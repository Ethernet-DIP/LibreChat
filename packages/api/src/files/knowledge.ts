import {
  Tools,
  Permissions,
  ResourceType,
  PermissionBits,
  PermissionTypes,
  AgentCapabilities,
  defaultAgentCapabilities,
} from 'librechat-data-provider';
import type { TAgentKnowledgeFile, TAgentKnowledgeResponse } from 'librechat-data-provider';
import type { IRole } from '@librechat/data-schemas';
import { getSafeErrorMetadata } from '../utils/errors';

type KnowledgeAgent = {
  _id: string | { toString(): string };
  author?: string | { toString(): string } | null;
  tenantId?: string | null;
  tools?: string[];
  tool_resources?: { file_search?: { file_ids?: string[] } };
};

type KnowledgeFile = TAgentKnowledgeFile & {
  tenantId?: string | null;
  user?: string | null;
};

export interface AgentKnowledgeRequest {
  agentId?: string;
  user?: { id?: string; role?: string; tenantId?: string | null };
  capabilities?: readonly AgentCapabilities[];
}

export interface AgentKnowledgeDependencies {
  getAgent: (
    filter: { id: string; tenantId: string | null },
    projection: Record<string, 0 | 1>,
  ) => Promise<KnowledgeAgent | null>;
  getFiles: (
    filter: { file_id: { $in: string[] }; tenantId: string | null },
    sort: null,
    projection: Record<string, 0 | 1>,
  ) => Promise<KnowledgeFile[] | null>;
  checkPermission: (params: {
    userId: string;
    role?: string;
    resourceType: ResourceType;
    resourceId: KnowledgeAgent['_id'];
    requiredPermission: PermissionBits;
  }) => Promise<boolean>;
  getRoleByName: (roleName: string) => Promise<Pick<IRole, 'permissions'> | null>;
  logger: { error: (message: string, metadata: ReturnType<typeof getSafeErrorMetadata>) => void };
}

export type AgentKnowledgeResult =
  | { status: 200; body: TAgentKnowledgeResponse }
  | { status: 400 | 401 | 403 | 404 | 500; body: { code: string } };

/** Lists searchable knowledge metadata without disclosing stored documents or creating embeddings. */
export async function handleAgentKnowledgeRequest(
  { agentId, user, capabilities = defaultAgentCapabilities }: AgentKnowledgeRequest,
  deps: AgentKnowledgeDependencies,
): Promise<AgentKnowledgeResult> {
  if (!user?.id) {
    return { status: 401, body: { code: 'UNAUTHORIZED' } };
  }
  if (typeof agentId !== 'string' || agentId.trim().length === 0) {
    return { status: 400, body: { code: 'INVALID_AGENT_ID' } };
  }

  try {
    const tenantId = user.tenantId || null;
    const capabilityEnabled = capabilities.includes(AgentCapabilities.file_search);
    const [agent, role] = await Promise.all([
      deps.getAgent(
        { id: agentId, tenantId },
        { _id: 1, author: 1, tenantId: 1, tools: 1, 'tool_resources.file_search.file_ids': 1 },
      ),
      capabilityEnabled && user.role ? deps.getRoleByName(user.role) : Promise.resolve(null),
    ]);

    if (!agent || (agent.tenantId || null) !== tenantId) {
      return { status: 404, body: { code: 'AGENT_NOT_FOUND' } };
    }
    if (
      agent.author?.toString() !== user.id &&
      !(await deps.checkPermission({
        userId: user.id,
        role: user.role,
        resourceType: ResourceType.AGENT,
        resourceId: agent._id,
        requiredPermission: PermissionBits.VIEW,
      }))
    ) {
      return { status: 403, body: { code: 'FORBIDDEN' } };
    }

    const enabled =
      capabilityEnabled &&
      role?.permissions?.[PermissionTypes.FILE_SEARCH]?.[Permissions.USE] === true &&
      agent.tools?.includes(Tools.file_search) === true;
    if (!enabled) {
      return { status: 200, body: { enabled: false, files: [] } };
    }

    const fileIds = [...new Set(agent.tool_resources?.file_search?.file_ids ?? [])];
    if (fileIds.length === 0) {
      return { status: 200, body: { enabled: true, files: [] } };
    }
    const records = await deps.getFiles({ file_id: { $in: fileIds }, tenantId }, null, {
      _id: 0,
      file_id: 1,
      filename: 1,
      type: 1,
      bytes: 1,
      embedded: 1,
      expiredAt: 1,
      llmDeliveryPath: 1,
      tenantId: 1,
      user: 1,
    });
    const allowedIds = new Set(fileIds);
    const seen = new Set<string>();
    const files: TAgentKnowledgeFile[] = [];
    const now = Date.now();
    for (const file of records ?? []) {
      if (
        !allowedIds.has(file.file_id) ||
        seen.has(file.file_id) ||
        !file.user ||
        (file.tenantId || null) !== tenantId
      ) {
        continue;
      }
      const expiry = file.expiredAt == null ? null : new Date(file.expiredAt).getTime();
      if (expiry != null && (!Number.isFinite(expiry) || expiry <= now)) {
        continue;
      }
      seen.add(file.file_id);
      files.push({
        file_id: file.file_id,
        filename: file.filename,
        type: file.type,
        bytes: file.bytes,
        embedded: file.embedded === true,
        ...(file.expiredAt !== undefined && {
          expiredAt: expiry == null ? null : new Date(expiry).toISOString(),
        }),
        ...(file.llmDeliveryPath !== undefined && { llmDeliveryPath: file.llmDeliveryPath }),
      });
    }
    return { status: 200, body: { enabled: true, files } };
  } catch (error) {
    deps.logger.error(
      '[agentKnowledge] Failed to list knowledge files',
      getSafeErrorMetadata(error),
    );
    return { status: 500, body: { code: 'KNOWLEDGE_UNAVAILABLE' } };
  }
}
