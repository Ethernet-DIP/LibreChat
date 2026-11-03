import { AgentCapabilities, PermissionBits, ResourceType } from 'librechat-data-provider';
import type { AgentKnowledgeRequest } from './knowledge';
import { handleAgentKnowledgeRequest } from './knowledge';

describe('handleAgentKnowledgeRequest', () => {
  const request: AgentKnowledgeRequest = {
    agentId: 'lesson-agent',
    user: { id: 'teacher', role: 'USER', tenantId: 'school' },
    capabilities: [AgentCapabilities.file_search],
  };
  const agent = {
    _id: 'agent-record',
    author: 'school-admin',
    tenantId: 'school',
    tools: ['file_search'],
    tool_resources: { file_search: { file_ids: ['book-a', 'book-b', 'book-a'] } },
  };
  const book = {
    file_id: 'book-a',
    filename: 'Textbook.pdf',
    type: 'application/pdf',
    bytes: 35_000_000,
    embedded: true,
    llmDeliveryPath: 'none' as const,
    user: 'school-admin',
    tenantId: 'school',
  };

  function setup() {
    return {
      getAgent: jest.fn().mockResolvedValue(agent),
      getFiles: jest.fn().mockResolvedValue([book]),
      getRoleByName: jest.fn().mockResolvedValue({ permissions: { FILE_SEARCH: { USE: true } } }),
      checkPermission: jest.fn().mockResolvedValue(true),
      logger: { error: jest.fn() },
    };
  }

  it('lists existing knowledge for a viewer using VIEW permission', async () => {
    const deps = setup();
    const result = await handleAgentKnowledgeRequest(request, deps);

    expect(result).toEqual({
      status: 200,
      body: {
        enabled: true,
        files: [
          {
            file_id: book.file_id,
            filename: book.filename,
            type: book.type,
            bytes: book.bytes,
            embedded: true,
            llmDeliveryPath: 'none',
          },
        ],
      },
    });
    expect(deps.checkPermission).toHaveBeenCalledWith({
      userId: 'teacher',
      role: 'USER',
      resourceType: ResourceType.AGENT,
      resourceId: 'agent-record',
      requiredPermission: PermissionBits.VIEW,
    });
    expect(deps.getFiles).toHaveBeenCalledWith(
      { file_id: { $in: ['book-a', 'book-b'] }, tenantId: 'school' },
      null,
      expect.objectContaining({ _id: 0, file_id: 1, tenantId: 1, user: 1 }),
    );
  });

  it('allows the author to list knowledge without an ACL lookup', async () => {
    const deps = setup();
    deps.getAgent.mockResolvedValue({ ...agent, author: 'teacher' });

    expect((await handleAgentKnowledgeRequest(request, deps)).status).toBe(200);
    expect(deps.checkPermission).not.toHaveBeenCalled();
  });

  it('denies unauthenticated requests without reading storage', async () => {
    const deps = setup();
    expect(await handleAgentKnowledgeRequest({ agentId: 'lesson-agent' }, deps)).toEqual({
      status: 401,
      body: { code: 'UNAUTHORIZED' },
    });
    expect(deps.getAgent).not.toHaveBeenCalled();
    expect(deps.getFiles).not.toHaveBeenCalled();
  });

  it('rejects missing agent IDs', async () => {
    const deps = setup();
    expect(await handleAgentKnowledgeRequest({ ...request, agentId: '' }, deps)).toEqual({
      status: 400,
      body: { code: 'INVALID_AGENT_ID' },
    });
    expect(deps.getAgent).not.toHaveBeenCalled();
  });

  it('does not hydrate files when VIEW permission is denied', async () => {
    const deps = setup();
    deps.checkPermission.mockResolvedValue(false);

    expect(await handleAgentKnowledgeRequest(request, deps)).toEqual({
      status: 403,
      body: { code: 'FORBIDDEN' },
    });
    expect(deps.getFiles).not.toHaveBeenCalled();
  });

  it.each([null, { ...agent, tenantId: 'other-school' }])(
    'conceals missing or cross-tenant agents (%j)',
    async (record) => {
      const deps = setup();
      deps.getAgent.mockResolvedValue(record);

      expect(await handleAgentKnowledgeRequest(request, deps)).toEqual({
        status: 404,
        body: { code: 'AGENT_NOT_FOUND' },
      });
      expect(deps.getAgent).toHaveBeenCalledWith(
        { id: 'lesson-agent', tenantId: 'school' },
        expect.any(Object),
      );
      expect(deps.getFiles).not.toHaveBeenCalled();
      expect(deps.checkPermission).not.toHaveBeenCalled();
    },
  );

  it('matches legacy missing tenant IDs to the tenantless scope', async () => {
    const deps = setup();
    deps.getAgent.mockResolvedValue({ ...agent, tenantId: undefined });
    deps.getFiles.mockResolvedValue([{ ...book, tenantId: undefined }]);

    const result = await handleAgentKnowledgeRequest(
      { ...request, user: { id: 'teacher', role: 'USER' } },
      deps,
    );
    expect(result.status).toBe(200);
    expect(deps.getFiles.mock.calls[0][0]).toMatchObject({ tenantId: null });
  });

  it.each(['capability', 'role', 'agent tool'])(
    'reports a disabled %s without listing files',
    async (gate) => {
      const deps = setup();
      const input = { ...request };
      if (gate === 'capability') {
        input.capabilities = [];
      } else if (gate === 'role') {
        deps.getRoleByName.mockResolvedValue({ permissions: { FILE_SEARCH: { USE: false } } });
      } else {
        deps.getAgent.mockResolvedValue({ ...agent, tools: [] });
      }

      expect(await handleAgentKnowledgeRequest(input, deps)).toEqual({
        status: 200,
        body: { enabled: false, files: [] },
      });
      expect(deps.getFiles).not.toHaveBeenCalled();
    },
  );

  it('excludes missing, expired, invalid, cross-tenant, unowned, and unrelated records', async () => {
    const deps = setup();
    deps.getFiles.mockResolvedValue([
      book,
      { ...book },
      { ...book, file_id: 'book-b', expiredAt: '2000-01-01T00:00:00.000Z' },
      { ...book, file_id: 'book-b', expiredAt: 'invalid-date' },
      { ...book, file_id: 'book-b', tenantId: 'other-school' },
      { ...book, file_id: 'book-b', user: undefined },
      { ...book, file_id: 'unrelated' },
    ]);

    const result = await handleAgentKnowledgeRequest(request, deps);
    expect(result).toMatchObject({ status: 200, body: { files: [{ file_id: 'book-a' }] } });
    if (result.status === 200) {
      expect(result.body.files).toHaveLength(1);
    }
  });

  it('serializes only allowlisted metadata even when the data layer returns extra fields', async () => {
    const deps = setup();
    deps.getFiles.mockResolvedValue([
      {
        ...book,
        expiredAt: new Date('2999-01-01T00:00:00Z'),
        filepath: '/private/signed?credential=secret',
        storageKey: 'private-key',
        text: 'full textbook contents',
        metadata: { secret: 'internal' },
      },
    ]);

    const result = await handleAgentKnowledgeRequest(request, deps);
    expect(result).toEqual({
      status: 200,
      body: {
        enabled: true,
        files: [
          {
            file_id: 'book-a',
            filename: 'Textbook.pdf',
            type: 'application/pdf',
            bytes: 35_000_000,
            embedded: true,
            llmDeliveryPath: 'none',
            expiredAt: '2999-01-01T00:00:00.000Z',
          },
        ],
      },
    });
  });

  it('uses only File Search knowledge, excluding the agent’s other resources', async () => {
    const deps = setup();
    deps.getAgent.mockResolvedValue({
      ...agent,
      tool_resources: { context: { file_ids: ['private-context'] } },
    });

    expect(await handleAgentKnowledgeRequest(request, deps)).toEqual({
      status: 200,
      body: { enabled: true, files: [] },
    });
    expect(deps.getFiles).not.toHaveBeenCalled();
  });

  it.each(['getAgent', 'getFiles', 'getRoleByName', 'checkPermission'] as const)(
    'returns a safe failure when %s fails',
    async (method) => {
      const deps = setup();
      deps[method].mockRejectedValue(new Error('secret provider payload and database query'));

      expect(await handleAgentKnowledgeRequest(request, deps)).toEqual({
        status: 500,
        body: { code: 'KNOWLEDGE_UNAVAILABLE' },
      });
      expect(deps.logger.error).toHaveBeenCalledWith(
        '[agentKnowledge] Failed to list knowledge files',
        { type: 'Error' },
      );
    },
  );
});
