import { Types } from 'mongoose';
import { buildUserSearchFilter } from '@librechat/data-schemas';
import { PrincipalType, SystemRoles } from 'librechat-data-provider';
import type { IUser, UserDeleteResult } from '@librechat/data-schemas';
import type { Response } from 'express';
import type { ServerRequest } from '~/types/http';
import type { AdminUsersDeps } from './users';
import { createAdminUsersHandlers } from './users';
import { eraseUserData } from '~/user/erasure';

jest.mock('~/user/erasure', () => ({
  eraseUserData: jest.fn().mockResolvedValue(undefined),
}));

jest.mock('@librechat/data-schemas', () => ({
  ...jest.requireActual('@librechat/data-schemas'),
  logger: { error: jest.fn(), warn: jest.fn(), info: jest.fn(), debug: jest.fn() },
}));

const validUserId = new Types.ObjectId().toString();

function mockUser(overrides: Partial<IUser> = {}): IUser {
  return {
    _id: new Types.ObjectId(),
    name: 'Test User',
    username: 'testuser',
    email: 'test@example.com',
    avatar: 'https://example.com/avatar.png',
    role: 'USER',
    provider: 'local',
    createdAt: new Date('2025-01-01'),
    updatedAt: new Date('2025-06-01'),
    ...overrides,
  } as IUser;
}

function createReqRes(
  overrides: {
    params?: Record<string, string>;
    query?: Record<string, string | string[]>;
    user?: { _id?: Types.ObjectId; id?: string; role?: string; tenantId?: string };
  } = {},
) {
  const req = {
    params: overrides.params ?? {},
    query: overrides.query ?? {},
    body: {},
    user: overrides.user ?? { _id: new Types.ObjectId(), role: 'admin' },
  } as unknown as ServerRequest;

  const json = jest.fn();
  const status = jest.fn().mockReturnValue({ json });
  const res = { status, json } as unknown as Response;

  return { req, res, status, json };
}

function createDeps(overrides: Partial<AdminUsersDeps> = {}): AdminUsersDeps {
  return {
    findUsers: jest.fn().mockResolvedValue([]),
    countUsers: jest.fn().mockResolvedValue(0),
    beginAgentTriggerUserDeletion: jest.fn().mockResolvedValue('acquired'),
    cancelAgentTriggerUserDeletion: jest.fn().mockResolvedValue(true),
    drainAgentTriggerDeliveriesForUser: jest.fn().mockResolvedValue(undefined),
    prepareAgentTriggerUserPurge: jest.fn().mockResolvedValue(undefined),
    cancelAgentTriggerUserPurge: jest.fn().mockResolvedValue(true),
    purgeAgentTriggerDeliveriesForUser: jest.fn().mockResolvedValue(undefined),
    revokeUserCodeEnvironmentWorkers: jest.fn().mockResolvedValue(0),
    deleteUserById: jest
      .fn()
      .mockResolvedValue({ deletedCount: 1, message: 'User was deleted successfully.' }),
    deleteUserCodeEnvironments: jest.fn().mockResolvedValue(0),
    invalidateCodeEnvironmentConfigCache: jest.fn().mockResolvedValue(undefined),
    deleteConfig: jest.fn().mockResolvedValue(null),
    deleteAclEntries: jest.fn().mockResolvedValue(undefined),
    deletePasskeysByUser: jest.fn().mockResolvedValue(0),
    resolveErasure: jest.fn().mockResolvedValue({ deps: {} }),
    cancelSubagentTasks: jest.fn().mockResolvedValue(undefined),
    quiesceUserSchedules: jest.fn().mockResolvedValue(true),
    restoreUserSchedulesFromDeletion: jest.fn().mockResolvedValue(undefined),
    generationJobs: {
      getAccountCleanupJobIdsForUser: jest.fn().mockResolvedValue([]),
      getCleanupJob: jest.fn().mockResolvedValue(undefined),
      abortJob: jest.fn().mockResolvedValue(null),
    },
    ...overrides,
  };
}

describe('createAdminUsersHandlers', () => {
  beforeEach(() => {
    jest.mocked(eraseUserData).mockClear();
  });

  describe('listUsers', () => {
    it('returns paginated users with total count', async () => {
      const users = [
        mockUser({ _id: new Types.ObjectId(validUserId) }),
        mockUser({ name: 'Other' }),
      ];
      const deps = createDeps({
        findUsers: jest.fn().mockResolvedValue(users),
        countUsers: jest.fn().mockResolvedValue(2),
      });
      const handlers = createAdminUsersHandlers(deps);
      const { req, res, status, json } = createReqRes();

      await handlers.listUsers(req, res);

      expect(status).toHaveBeenCalledWith(200);
      const response = json.mock.calls[0][0];
      expect(response.users).toHaveLength(2);
      expect(response.total).toBe(2);
      expect(response).toHaveProperty('limit');
      expect(response).toHaveProperty('offset');
      expect(response.users[0]).toHaveProperty('id');
      expect(response.users[0]).toHaveProperty('name');
      expect(response.users[0]).toHaveProperty('email');
      expect(response.users[0]).toHaveProperty('role');
    });

    it('passes pagination params to findUsers and unfiltered count', async () => {
      const findUsers = jest.fn().mockResolvedValue([]);
      const countUsers = jest.fn().mockResolvedValue(0);
      const deps = createDeps({ findUsers, countUsers });
      const handlers = createAdminUsersHandlers(deps);
      const { req, res } = createReqRes({ query: { limit: '10', offset: '20' } });

      await handlers.listUsers(req, res);

      expect(findUsers).toHaveBeenCalledWith({}, expect.any(String), {
        limit: 10,
        offset: 20,
        sort: { createdAt: -1 },
      });
      expect(countUsers).toHaveBeenCalledWith();
    });

    it('returns empty list when no users', async () => {
      const deps = createDeps();
      const handlers = createAdminUsersHandlers(deps);
      const { req, res, status, json } = createReqRes();

      await handlers.listUsers(req, res);

      expect(status).toHaveBeenCalledWith(200);
      expect(json.mock.calls[0][0].users).toEqual([]);
      expect(json.mock.calls[0][0].total).toBe(0);
    });

    it('returns 500 when findUsers throws', async () => {
      const deps = createDeps({ findUsers: jest.fn().mockRejectedValue(new Error('db down')) });
      const handlers = createAdminUsersHandlers(deps);
      const { req, res, status, json } = createReqRes();

      await handlers.listUsers(req, res);

      expect(status).toHaveBeenCalledWith(500);
      expect(json).toHaveBeenCalledWith({ error: 'Failed to list users' });
    });

    it('returns 500 when countUsers throws', async () => {
      const deps = createDeps({
        countUsers: jest.fn().mockRejectedValue(new Error('count failed')),
      });
      const handlers = createAdminUsersHandlers(deps);
      const { req, res, status, json } = createReqRes();

      await handlers.listUsers(req, res);

      expect(status).toHaveBeenCalledWith(500);
      expect(json).toHaveBeenCalledWith({ error: 'Failed to list users' });
    });
  });

  describe('searchUsers', () => {
    it('returns matching users with total and capped flag', async () => {
      const users = [mockUser()];
      const deps = createDeps({ findUsers: jest.fn().mockResolvedValue(users) });
      const handlers = createAdminUsersHandlers(deps);
      const { req, res, status, json } = createReqRes({ query: { q: 'test' } });

      await handlers.searchUsers(req, res);

      expect(status).toHaveBeenCalledWith(200);
      const response = json.mock.calls[0][0];
      expect(response.users).toHaveLength(1);
      expect(response.total).toBe(1);
      expect(response.capped).toBe(false);
      expect(response.users[0]).toHaveProperty('id');
      expect(response.users[0]).toHaveProperty('name');
      expect(response.users[0]).toHaveProperty('email');
      expect(response.users[0]).toHaveProperty('username');
    });

    it('sets capped to true when results hit the limit', async () => {
      const users = Array.from({ length: 20 }, () => mockUser());
      const deps = createDeps({ findUsers: jest.fn().mockResolvedValue(users) });
      const handlers = createAdminUsersHandlers(deps);
      const { req, res, json } = createReqRes({ query: { q: 'test', limit: '20' } });

      await handlers.searchUsers(req, res);

      const response = json.mock.calls[0][0];
      expect(response.total).toBe(20);
      expect(response.capped).toBe(true);
    });

    it('searches the indexed word-prefix tokens of name, email, and username', async () => {
      const findUsers = jest.fn().mockResolvedValue([]);
      const deps = createDeps({ findUsers });
      const handlers = createAdminUsersHandlers(deps);
      const { req, res } = createReqRes({ query: { q: 'Test' } });

      await handlers.searchUsers(req, res);

      const filter = findUsers.mock.calls[0][0];
      expect(filter).toEqual(buildUserSearchFilter('Test', { legacyPrefix: true }));
      expect(filter.$or).toEqual(
        expect.arrayContaining([
          { nameTokens: /^test/ },
          { emailTokens: /^test/ },
          { usernameTokens: /^test/ },
        ]),
      );
    });

    it('projects username in the field selection', async () => {
      const findUsers = jest.fn().mockResolvedValue([]);
      const deps = createDeps({ findUsers });
      const handlers = createAdminUsersHandlers(deps);
      const { req, res } = createReqRes({ query: { q: 'test' } });

      await handlers.searchUsers(req, res);

      const projection = findUsers.mock.calls[0][1];
      expect(projection).toContain('username');
    });

    it('escapes regex special characters in query', async () => {
      const findUsers = jest.fn().mockResolvedValue([]);
      const deps = createDeps({ findUsers });
      const handlers = createAdminUsersHandlers(deps);
      const { req, res } = createReqRes({ query: { q: 'test.user+1' } });

      await handlers.searchUsers(req, res);

      const filter = findUsers.mock.calls[0][0];
      expect(filter.$and[0].$or).toContainEqual({ emailTokens: /^test\.user\+1/ });
      /** Documents awaiting the backfill keep the old anchored prefix match. */
      expect(filter.$and[0].$or).toContainEqual({
        nameTokens: { $exists: false },
        name: /^test\.user\+1/i,
      });
    });

    it('returns no users without querying when the query has nothing to match', async () => {
      const findUsers = jest.fn();
      const deps = createDeps({ findUsers });
      const handlers = createAdminUsersHandlers(deps);
      const { req, res, status, json } = createReqRes({ query: { q: '\u0301\u0301' } });

      await handlers.searchUsers(req, res);

      expect(findUsers).not.toHaveBeenCalled();
      expect(status).toHaveBeenCalledWith(200);
      expect(json).toHaveBeenCalledWith({ users: [], total: 0, capped: false });
    });

    it('returns 400 when query is missing', async () => {
      const deps = createDeps();
      const handlers = createAdminUsersHandlers(deps);
      const { req, res, status, json } = createReqRes({ query: {} });

      await handlers.searchUsers(req, res);

      expect(status).toHaveBeenCalledWith(400);
      expect(json).toHaveBeenCalledWith({ error: 'Query parameter "q" is required' });
    });

    it('returns 400 when query is empty string', async () => {
      const deps = createDeps();
      const handlers = createAdminUsersHandlers(deps);
      const { req, res, status, json } = createReqRes({ query: { q: '' } });

      await handlers.searchUsers(req, res);

      expect(status).toHaveBeenCalledWith(400);
      expect(json).toHaveBeenCalledWith({ error: 'Query parameter "q" is required' });
    });

    it('returns 400 when query is whitespace-only', async () => {
      const deps = createDeps();
      const handlers = createAdminUsersHandlers(deps);
      const { req, res, status, json } = createReqRes({ query: { q: '   ' } });

      await handlers.searchUsers(req, res);

      expect(status).toHaveBeenCalledWith(400);
      expect(json).toHaveBeenCalledWith({ error: 'Query parameter "q" is required' });
    });

    it('returns 400 when query is too short', async () => {
      const deps = createDeps();
      const handlers = createAdminUsersHandlers(deps);
      const { req, res, status, json } = createReqRes({ query: { q: 'a' } });

      await handlers.searchUsers(req, res);

      expect(status).toHaveBeenCalledWith(400);
      expect(json).toHaveBeenCalledWith({ error: 'Query must be at least 2 characters' });
    });

    it('returns 400 when query exceeds max length', async () => {
      const deps = createDeps();
      const handlers = createAdminUsersHandlers(deps);
      const { req, res, status, json } = createReqRes({ query: { q: 'a'.repeat(201) } });

      await handlers.searchUsers(req, res);

      expect(status).toHaveBeenCalledWith(400);
      expect(json).toHaveBeenCalledWith(
        expect.objectContaining({ error: expect.stringContaining('200') }),
      );
    });

    it('treats array query param as missing', async () => {
      const deps = createDeps();
      const handlers = createAdminUsersHandlers(deps);
      const { req, res, status, json } = createReqRes({ query: { q: ['foo', 'bar'] } });

      await handlers.searchUsers(req, res);

      expect(status).toHaveBeenCalledWith(400);
      expect(json).toHaveBeenCalledWith({ error: 'Query parameter "q" is required' });
    });

    it('passes limit to findUsers', async () => {
      const findUsers = jest.fn().mockResolvedValue([mockUser()]);
      const deps = createDeps({ findUsers });
      const handlers = createAdminUsersHandlers(deps);
      const { req, res } = createReqRes({ query: { q: 'User', limit: '3' } });

      await handlers.searchUsers(req, res);

      expect(findUsers).toHaveBeenCalledWith(expect.any(Object), expect.any(String), {
        limit: 3,
        sort: { name: 1 },
      });
    });

    it('caps limit at 50', async () => {
      const findUsers = jest.fn().mockResolvedValue([]);
      const deps = createDeps({ findUsers });
      const handlers = createAdminUsersHandlers(deps);
      const { req, res } = createReqRes({ query: { q: 'User', limit: '100' } });

      await handlers.searchUsers(req, res);

      expect(findUsers).toHaveBeenCalledWith(expect.any(Object), expect.any(String), {
        limit: 50,
        sort: { name: 1 },
      });
    });

    it('returns 500 on error', async () => {
      const deps = createDeps({ findUsers: jest.fn().mockRejectedValue(new Error('db down')) });
      const handlers = createAdminUsersHandlers(deps);
      const { req, res, status, json } = createReqRes({ query: { q: 'test' } });

      await handlers.searchUsers(req, res);

      expect(status).toHaveBeenCalledWith(500);
      expect(json).toHaveBeenCalledWith({ error: 'Failed to search users' });
    });
  });

  describe('deleteUser', () => {
    it('deletes user and returns 200', async () => {
      const result: UserDeleteResult = {
        deletedCount: 1,
        message: 'User was deleted successfully.',
      };
      const deps = createDeps({ deleteUserById: jest.fn().mockResolvedValue(result) });
      const handlers = createAdminUsersHandlers(deps);
      const { req, res, status, json } = createReqRes({ params: { id: validUserId } });

      await handlers.deleteUser(req, res);

      expect(status).toHaveBeenCalledWith(200);
      expect(json).toHaveBeenCalledWith({ message: 'User was deleted successfully.' });
      expect(deps.beginAgentTriggerUserDeletion).toHaveBeenCalledWith(
        validUserId,
        expect.any(Date),
      );
      expect(deps.drainAgentTriggerDeliveriesForUser).toHaveBeenCalledWith(validUserId);
      expect(deps.prepareAgentTriggerUserPurge).toHaveBeenCalledWith(
        validUserId,
        expect.any(Date),
        undefined,
      );
      expect(deps.purgeAgentTriggerDeliveriesForUser).toHaveBeenCalledWith(validUserId);
      expect(deps.cancelAgentTriggerUserPurge).not.toHaveBeenCalled();
      expect(deps.cancelAgentTriggerUserDeletion).not.toHaveBeenCalled();
    });

    it('returns fallback message when result.message is empty', async () => {
      const result: UserDeleteResult = { deletedCount: 1, message: '' };
      const deps = createDeps({ deleteUserById: jest.fn().mockResolvedValue(result) });
      const handlers = createAdminUsersHandlers(deps);
      const { req, res, status, json } = createReqRes({ params: { id: validUserId } });

      await handlers.deleteUser(req, res);

      expect(status).toHaveBeenCalledWith(200);
      expect(json).toHaveBeenCalledWith({ message: 'User deleted successfully' });
    });

    it('returns 403 when deleting own account', async () => {
      const userId = new Types.ObjectId();
      const deps = createDeps();
      const handlers = createAdminUsersHandlers(deps);
      const { req, res, status, json } = createReqRes({
        params: { id: userId.toString() },
        user: { _id: userId, role: 'admin' },
      });

      await handlers.deleteUser(req, res);

      expect(status).toHaveBeenCalledWith(403);
      expect(json).toHaveBeenCalledWith({ error: 'Cannot delete your own account' });
      expect(deps.deleteUserById).not.toHaveBeenCalled();
    });

    it('returns 400 when deleting the last admin', async () => {
      const targetId = new Types.ObjectId().toString();
      const deps = createDeps({
        findUsers: jest.fn().mockResolvedValue([mockUser({ role: SystemRoles.ADMIN })]),
        countUsers: jest.fn().mockResolvedValue(1),
      });
      const handlers = createAdminUsersHandlers(deps);
      const { req, res, status, json } = createReqRes({ params: { id: targetId } });

      await handlers.deleteUser(req, res);

      expect(status).toHaveBeenCalledWith(400);
      expect(json).toHaveBeenCalledWith({ error: 'Cannot delete the last admin user' });
      expect(deps.deleteUserById).not.toHaveBeenCalled();
      expect(deps.countUsers).toHaveBeenCalledWith({ role: SystemRoles.ADMIN });
    });

    it('allows deleting an admin when other admins exist', async () => {
      const targetId = new Types.ObjectId().toString();
      const deps = createDeps({
        findUsers: jest.fn().mockResolvedValue([mockUser({ role: SystemRoles.ADMIN })]),
        countUsers: jest.fn().mockResolvedValue(3),
      });
      const handlers = createAdminUsersHandlers(deps);
      const { req, res, status } = createReqRes({ params: { id: targetId } });

      await handlers.deleteUser(req, res);

      expect(status).toHaveBeenCalledWith(200);
      expect(deps.deleteUserById).toHaveBeenCalledWith(targetId);
    });

    it('does not check admin count when target is a regular user', async () => {
      const targetId = new Types.ObjectId().toString();
      const deps = createDeps({
        findUsers: jest.fn().mockResolvedValue([mockUser({ role: 'USER' })]),
      });
      const handlers = createAdminUsersHandlers(deps);
      const { req, res, status } = createReqRes({ params: { id: targetId } });

      await handlers.deleteUser(req, res);

      expect(status).toHaveBeenCalledWith(200);
      expect(deps.countUsers).not.toHaveBeenCalled();
    });

    it('cascades cleanup of Config, code environments, and AclEntries', async () => {
      const result: UserDeleteResult = {
        deletedCount: 1,
        message: 'User was deleted successfully.',
      };
      const deps = createDeps({ deleteUserById: jest.fn().mockResolvedValue(result) });
      const handlers = createAdminUsersHandlers(deps);
      const { req, res, status } = createReqRes({ params: { id: validUserId } });

      await handlers.deleteUser(req, res);

      expect(status).toHaveBeenCalledWith(200);
      expect(deps.deleteConfig).toHaveBeenCalledWith(PrincipalType.USER, validUserId);
      expect(deps.deleteUserCodeEnvironments).toHaveBeenCalledWith(expect.any(Types.ObjectId));
      expect(deps.invalidateCodeEnvironmentConfigCache).toHaveBeenCalledWith(undefined);
      expect(deps.deleteAclEntries).toHaveBeenCalledWith({
        principalType: PrincipalType.USER,
        principalId: expect.any(Types.ObjectId),
      });
      expect(deps.deletePasskeysByUser).toHaveBeenCalledWith(validUserId);
    });

    it("clears the config caches after removing the user's config override, before answering", async () => {
      let release: () => void = () => undefined;
      const invalidateConfigCaches = jest.fn(
        () => new Promise<void>((resolve) => (release = resolve)),
      );
      const deps = createDeps({
        deleteConfig: jest.fn().mockResolvedValue({ principalId: validUserId }),
        invalidateConfigCaches,
      });
      const { req, res, status } = createReqRes({
        params: { id: validUserId },
        user: { _id: new Types.ObjectId(), role: 'admin', tenantId: 'tenant-a' },
      });

      const deleting = createAdminUsersHandlers(deps).deleteUser(req, res);
      await new Promise((resolve) => setImmediate(resolve));
      expect(invalidateConfigCaches).toHaveBeenCalledWith('tenant-a');
      expect(status).not.toHaveBeenCalled();
      release();
      await deleting;

      expect(status).toHaveBeenCalledWith(200);
      expect(invalidateConfigCaches).toHaveBeenCalledTimes(1);
    });

    it('leaves the config caches alone when the user had no config override', async () => {
      const invalidateConfigCaches = jest.fn().mockResolvedValue(undefined);
      const deps = createDeps({ invalidateConfigCaches });
      const { req, res, status } = createReqRes({ params: { id: validUserId } });

      await createAdminUsersHandlers(deps).deleteUser(req, res);

      expect(status).toHaveBeenCalledWith(200);
      expect(invalidateConfigCaches).not.toHaveBeenCalled();
    });

    it('runs the shared erasure cascade for the target before removing the user', async () => {
      const checkpointer = { ttl: 60 };
      const erasureDeps = { marker: true };
      const deps = createDeps({
        findUsers: jest.fn().mockResolvedValue([mockUser({ role: 'USER', tenantId: 'tenant-1' })]),
        resolveErasure: jest.fn().mockResolvedValue({ deps: erasureDeps, checkpointer }),
      });
      const handlers = createAdminUsersHandlers(deps);
      const { req, res, status } = createReqRes({ params: { id: validUserId } });

      await handlers.deleteUser(req, res);

      expect(status).toHaveBeenCalledWith(200);
      expect(deps.resolveErasure).toHaveBeenCalledWith(
        expect.objectContaining({
          id: validUserId,
          role: 'USER',
          tenantId: 'tenant-1',
          idOnTheSource: null,
          profile: expect.objectContaining({ role: 'USER' }),
        }),
      );
      expect(eraseUserData).toHaveBeenCalledWith(
        { userId: validUserId, tenantId: 'tenant-1', checkpointer },
        erasureDeps,
      );
      expect(jest.mocked(eraseUserData).mock.invocationCallOrder[0]).toBeLessThan(
        jest.mocked(deps.deleteUserById).mock.invocationCallOrder[0],
      );
    });

    it('keeps the user, and releases the fence, when the erasure cascade fails', async () => {
      jest.mocked(eraseUserData).mockRejectedValueOnce(new Error('storage down'));
      const deps = createDeps();
      const handlers = createAdminUsersHandlers(deps);
      const { req, res, status, json } = createReqRes({ params: { id: validUserId } });

      await handlers.deleteUser(req, res);

      expect(status).toHaveBeenCalledWith(500);
      expect(json).toHaveBeenCalledWith({ error: 'Failed to delete user' });
      expect(deps.deleteUserById).not.toHaveBeenCalled();
      expect(deps.cancelAgentTriggerUserDeletion).toHaveBeenCalled();
      expect(deps.cancelAgentTriggerUserPurge).toHaveBeenCalled();
    });

    it('suspends schedules before erasing and restores them when the deletion fails', async () => {
      jest.mocked(eraseUserData).mockRejectedValueOnce(new Error('storage down'));
      const deps = createDeps();
      const handlers = createAdminUsersHandlers(deps);
      const { req, res, status } = createReqRes({ params: { id: validUserId } });

      await handlers.deleteUser(req, res);

      const token = jest.mocked(deps.quiesceUserSchedules).mock.calls[0][1];
      expect(status).toHaveBeenCalledWith(500);
      expect(deps.restoreUserSchedulesFromDeletion).toHaveBeenCalledWith(validUserId, token);
      expect(
        jest.mocked(deps.restoreUserSchedulesFromDeletion).mock.invocationCallOrder[0],
      ).toBeLessThan(jest.mocked(deps.cancelAgentTriggerUserDeletion).mock.invocationCallOrder[0]);
    });

    it('takes the trigger deletion fence before listing generations to stop', async () => {
      const deps = createDeps();
      const handlers = createAdminUsersHandlers(deps);
      const { req, res } = createReqRes({ params: { id: validUserId } });

      await handlers.deleteUser(req, res);

      expect(
        jest.mocked(deps.beginAgentTriggerUserDeletion).mock.invocationCallOrder[0],
      ).toBeLessThan(
        jest.mocked(deps.generationJobs.getAccountCleanupJobIdsForUser).mock.invocationCallOrder[0],
      );
    });

    it('does not erase when schedules cannot be confirmed stopped', async () => {
      const deps = createDeps({ quiesceUserSchedules: jest.fn().mockResolvedValue(false) });
      const handlers = createAdminUsersHandlers(deps);
      const { req, res, status } = createReqRes({ params: { id: validUserId } });

      await handlers.deleteUser(req, res);

      expect(status).toHaveBeenCalledWith(500);
      expect(eraseUserData).not.toHaveBeenCalled();
      expect(deps.deleteUserById).not.toHaveBeenCalled();
    });

    it('aborts the cleanup jobs of the target and refuses to erase when a stop is unconfirmed', async () => {
      const abortJob = jest.fn().mockResolvedValue(null);
      const deps = createDeps({
        generationJobs: {
          getAccountCleanupJobIdsForUser: jest.fn().mockResolvedValue(['s1', 's2']),
          getCleanupJob: jest.fn(async (id: string) => ({
            createdAt: 5,
            metadata: { userId: id === 's1' ? validUserId : 'someone-else' },
          })),
          abortJob,
        } as unknown as AdminUsersDeps['generationJobs'],
      });
      const handlers = createAdminUsersHandlers(deps);
      const { req, res, status } = createReqRes({ params: { id: validUserId } });

      await handlers.deleteUser(req, res);

      expect(abortJob).toHaveBeenCalledTimes(1);
      expect(abortJob).toHaveBeenCalledWith('s1', {
        expectedCreatedAt: 5,
        awaitProviderDrain: true,
      });
      expect(status).toHaveBeenCalledWith(500);
      expect(eraseUserData).not.toHaveBeenCalled();
    });

    it('returns success even when cascade cleanup partially fails', async () => {
      const result: UserDeleteResult = {
        deletedCount: 1,
        message: 'User was deleted successfully.',
      };
      const deps = createDeps({
        deleteUserById: jest.fn().mockResolvedValue(result),
        deleteConfig: jest.fn().mockRejectedValue(new Error('cleanup failed')),
      });
      const handlers = createAdminUsersHandlers(deps);
      const { req, res, status, json } = createReqRes({ params: { id: validUserId } });

      await handlers.deleteUser(req, res);

      expect(status).toHaveBeenCalledWith(200);
      expect(json).toHaveBeenCalledWith({ message: 'User was deleted successfully.' });
    });

    it('preserves code environment records when revocation marking fails', async () => {
      const deps = createDeps({
        revokeUserCodeEnvironmentWorkers: jest.fn().mockRejectedValue(new Error('mongo down')),
      });
      const handlers = createAdminUsersHandlers(deps);
      const { req, res } = createReqRes({ params: { id: validUserId } });

      await handlers.deleteUser(req, res);

      expect(deps.deleteUserById).toHaveBeenCalledWith(validUserId);
      expect(deps.deleteUserCodeEnvironments).not.toHaveBeenCalled();
    });

    it('does not cascade when user is not found', async () => {
      const result: UserDeleteResult = { deletedCount: 0, message: '' };
      const deps = createDeps({ deleteUserById: jest.fn().mockResolvedValue(result) });
      const handlers = createAdminUsersHandlers(deps);
      const { req, res, status } = createReqRes({ params: { id: validUserId } });

      await handlers.deleteUser(req, res);

      expect(status).toHaveBeenCalledWith(404);
      expect(deps.deleteConfig).not.toHaveBeenCalled();
      expect(deps.deleteUserCodeEnvironments).not.toHaveBeenCalled();
      expect(deps.deleteAclEntries).not.toHaveBeenCalled();
      expect(deps.purgeAgentTriggerDeliveriesForUser).not.toHaveBeenCalled();
      expect(deps.cancelAgentTriggerUserDeletion).toHaveBeenCalledWith(
        validUserId,
        expect.any(Date),
      );
      expect(deps.cancelAgentTriggerUserPurge).toHaveBeenCalledWith(validUserId, expect.any(Date));
    });

    it('returns 400 for invalid ObjectId', async () => {
      const deps = createDeps();
      const handlers = createAdminUsersHandlers(deps);
      const { req, res, status, json } = createReqRes({ params: { id: 'not-valid' } });

      await handlers.deleteUser(req, res);

      expect(status).toHaveBeenCalledWith(400);
      expect(json).toHaveBeenCalledWith({ error: 'Invalid user ID format' });
    });

    it('returns 404 when user not found', async () => {
      const result: UserDeleteResult = { deletedCount: 0, message: '' };
      const deps = createDeps({ deleteUserById: jest.fn().mockResolvedValue(result) });
      const handlers = createAdminUsersHandlers(deps);
      const { req, res, status, json } = createReqRes({ params: { id: validUserId } });

      await handlers.deleteUser(req, res);

      expect(status).toHaveBeenCalledWith(404);
      expect(json).toHaveBeenCalledWith({ error: 'User not found' });
    });

    it('returns 500 on error', async () => {
      const deps = createDeps({
        deleteUserById: jest.fn().mockRejectedValue(new Error('db crash')),
      });
      const handlers = createAdminUsersHandlers(deps);
      const { req, res, status, json } = createReqRes({ params: { id: validUserId } });

      await handlers.deleteUser(req, res);

      expect(status).toHaveBeenCalledWith(500);
      expect(json).toHaveBeenCalledWith({ error: 'Failed to delete user' });
      expect(deps.cancelAgentTriggerUserDeletion).toHaveBeenCalledWith(
        validUserId,
        expect.any(Date),
      );
      expect(deps.cancelAgentTriggerUserPurge).toHaveBeenCalledWith(validUserId, expect.any(Date));
      expect(deps.purgeAgentTriggerDeliveriesForUser).not.toHaveBeenCalled();
    });

    it('does not delete while another deletion owns the trigger fence', async () => {
      const deps = createDeps({
        beginAgentTriggerUserDeletion: jest.fn().mockResolvedValue('in_progress'),
      });
      const handlers = createAdminUsersHandlers(deps);
      const { req, res, status, json } = createReqRes({ params: { id: validUserId } });

      await handlers.deleteUser(req, res);

      expect(status).toHaveBeenCalledWith(409);
      expect(json).toHaveBeenCalledWith({ error: 'User deletion is already in progress' });
      expect(deps.drainAgentTriggerDeliveriesForUser).not.toHaveBeenCalled();
      expect(deps.deleteUserById).not.toHaveBeenCalled();
      expect(deps.cancelAgentTriggerUserDeletion).not.toHaveBeenCalled();
    });

    it('returns not found without draining when the trigger fence principal is missing', async () => {
      const deps = createDeps({
        beginAgentTriggerUserDeletion: jest.fn().mockResolvedValue('missing'),
      });
      const handlers = createAdminUsersHandlers(deps);
      const { req, res, status, json } = createReqRes({ params: { id: validUserId } });

      await handlers.deleteUser(req, res);

      expect(status).toHaveBeenCalledWith(404);
      expect(json).toHaveBeenCalledWith({ error: 'User not found' });
      expect(deps.drainAgentTriggerDeliveriesForUser).not.toHaveBeenCalled();
      expect(deps.deleteUserById).not.toHaveBeenCalled();
      expect(deps.cancelAgentTriggerUserDeletion).not.toHaveBeenCalled();
    });

    it('drains before commit and purges only after the user is deleted', async () => {
      const deps = createDeps();
      const handlers = createAdminUsersHandlers(deps);
      const { req, res } = createReqRes({ params: { id: validUserId } });

      await handlers.deleteUser(req, res);

      const beginOrder = (deps.beginAgentTriggerUserDeletion as jest.Mock).mock
        .invocationCallOrder[0];
      const prepareOrder = (deps.prepareAgentTriggerUserPurge as jest.Mock).mock
        .invocationCallOrder[0];
      const drainOrder = (deps.drainAgentTriggerDeliveriesForUser as jest.Mock).mock
        .invocationCallOrder[0];
      const deleteOrder = (deps.deleteUserById as jest.Mock).mock.invocationCallOrder[0];
      const revokeCodeOrder = (deps.revokeUserCodeEnvironmentWorkers as jest.Mock).mock
        .invocationCallOrder[0];
      const deleteCodeOrder = (deps.deleteUserCodeEnvironments as jest.Mock).mock
        .invocationCallOrder[0];
      const purgeOrder = (deps.purgeAgentTriggerDeliveriesForUser as jest.Mock).mock
        .invocationCallOrder[0];
      expect(beginOrder).toBeLessThan(drainOrder);
      expect(beginOrder).toBeLessThan(prepareOrder);
      expect(prepareOrder).toBeLessThan(drainOrder);
      expect(drainOrder).toBeLessThan(deleteOrder);
      expect(deleteOrder).toBeLessThan(revokeCodeOrder);
      expect(revokeCodeOrder).toBeLessThan(deleteCodeOrder);
      expect(deleteOrder).toBeLessThan(purgeOrder);
    });

    it('leaves durable purge recovery armed when immediate post-commit cleanup fails', async () => {
      const deps = createDeps({
        purgeAgentTriggerDeliveriesForUser: jest.fn().mockRejectedValue(new Error('db down')),
      });
      const handlers = createAdminUsersHandlers(deps);
      const { req, res, status, json } = createReqRes({ params: { id: validUserId } });

      await handlers.deleteUser(req, res);

      expect(status).toHaveBeenCalledWith(500);
      expect(json).toHaveBeenCalledWith({ error: 'Failed to delete user' });
      expect(deps.deleteUserById).toHaveBeenCalledWith(validUserId);
      expect(deps.prepareAgentTriggerUserPurge).toHaveBeenCalled();
      expect(deps.cancelAgentTriggerUserPurge).not.toHaveBeenCalled();
      expect(deps.cancelAgentTriggerUserDeletion).not.toHaveBeenCalled();
    });
  });
});

describe('createUser', () => {
  function setup(overrides: Partial<AdminUsersDeps> = {}) {
    const created = mockUser({ email: 'new@example.com', name: 'New Teacher', role: 'USER' });
    const deps = createDeps({
      registerUser: jest.fn().mockResolvedValue({ status: 200, userCreated: true }),
      roleExists: jest.fn().mockResolvedValue(true),
      findUsers: jest.fn().mockResolvedValue([created]),
      recordAuditEntry: jest.fn().mockResolvedValue(undefined),
      ...overrides,
    });
    const handlers = createAdminUsersHandlers(deps);
    return { deps, handlers, created };
  }

  const body = { name: 'New Teacher', email: 'New@Example.com', password: 'correct-horse-9' };

  function call(handlers: ReturnType<typeof createAdminUsersHandlers>, payload: unknown) {
    const { req, res, status, json } = createReqRes();
    req.body = payload as typeof req.body;
    return handlers.createUser(req, res).then(() => ({ status, json }));
  }

  it('creates the account with a verified email and the default role', async () => {
    const { deps, handlers } = setup();
    const { status, json } = await call(handlers, body);
    expect(deps.registerUser).toHaveBeenCalledWith(
      expect.objectContaining({ email: 'New@Example.com', password: body.password }),
      { role: SystemRoles.USER, emailVerified: true },
    );
    expect(status).toHaveBeenCalledWith(201);
    expect(json).toHaveBeenCalledWith({
      user: expect.objectContaining({ email: 'new@example.com', role: 'USER' }),
    });
    expect(deps.recordAuditEntry).toHaveBeenCalledWith(
      expect.objectContaining({ action: 'user.created' }),
    );
  });

  it('does not answer with the password', async () => {
    const { handlers } = setup();
    const { json } = await call(handlers, body);
    expect(JSON.stringify(json.mock.calls)).not.toContain(body.password);
  });

  it('rejects a role that does not exist without registering anyone', async () => {
    const { deps, handlers } = setup({ roleExists: jest.fn().mockResolvedValue(false) });
    const { status, json } = await call(handlers, { ...body, role: 'GHOST' });
    expect(status).toHaveBeenCalledWith(400);
    expect(json).toHaveBeenCalledWith({ error: 'invalid_role', code: 'invalid_role' });
    expect(deps.registerUser).not.toHaveBeenCalled();
  });

  it('answers 409 when the email is already in use', async () => {
    const { handlers } = setup({
      registerUser: jest.fn().mockResolvedValue({ status: 200, userCreated: false }),
    });
    const { status, json } = await call(handlers, body);
    expect(status).toHaveBeenCalledWith(409);
    expect(json).toHaveBeenCalledWith({ error: 'email_taken', code: 'email_taken' });
  });

  it('maps registration validation and domain refusals to stable codes', async () => {
    const invalid = setup({ registerUser: jest.fn().mockResolvedValue({ status: 404 }) });
    expect((await call(invalid.handlers, body)).status).toHaveBeenCalledWith(400);
    const domain = setup({ registerUser: jest.fn().mockResolvedValue({ status: 403 }) });
    const { status, json } = await call(domain.handlers, body);
    expect(status).toHaveBeenCalledWith(403);
    expect(json).toHaveBeenCalledWith({ error: 'domain_not_allowed', code: 'domain_not_allowed' });
  });

  it('rejects a missing email or password before calling the service', async () => {
    const { deps, handlers } = setup();
    const { status } = await call(handlers, { name: 'No Pass', email: 'a@b.co' });
    expect(status).toHaveBeenCalledWith(400);
    expect(deps.registerUser).not.toHaveBeenCalled();
  });

  it('turns a service failure into a 500 without its text', async () => {
    const { handlers } = setup({
      registerUser: jest.fn().mockRejectedValue(new Error('mongo://secret@host failed')),
    });
    const { status, json } = await call(handlers, body);
    expect(status).toHaveBeenCalledWith(500);
    expect(JSON.stringify(json.mock.calls)).not.toContain('secret');
  });
});

describe('updateUser', () => {
  const targetId = new Types.ObjectId();
  const adminId = new Types.ObjectId();

  function setup(
    target: Partial<IUser> = {},
    overrides: Partial<AdminUsersDeps> = {},
    caller: Types.ObjectId = adminId,
  ) {
    const existing = mockUser({ _id: targetId, email: 'old@example.com', ...target });
    const deps = createDeps({
      findUsers: jest.fn().mockImplementation(async (criteria: { email?: string }) => {
        if (criteria.email && criteria.email !== existing.email) {
          return [];
        }
        return [existing];
      }),
      countUsers: jest.fn().mockResolvedValue(2),
      updateUser: jest.fn().mockImplementation(async (_id: string, data: Partial<IUser>) => ({
        ...existing,
        ...data,
      })),
      hashPassword: jest.fn().mockResolvedValue('hashed'),
      recordAuditEntry: jest.fn().mockResolvedValue(undefined),
      ...overrides,
    });
    const handlers = createAdminUsersHandlers(deps);
    const call = async (body: unknown) => {
      const { req, res, status, json } = createReqRes({
        params: { id: targetId.toString() },
        user: { _id: caller, role: 'ADMIN' },
      });
      req.body = body as typeof req.body;
      await handlers.updateUser(req, res);
      return { status, json };
    };
    return { deps, call };
  }

  it('updates the profile and audits the field names, not the values', async () => {
    const { deps, call } = setup();
    const { status, json } = await call({ name: 'Renamed Teacher', username: 'renamed' });
    expect(status).toHaveBeenCalledWith(200);
    expect(deps.updateUser).toHaveBeenCalledWith(targetId.toString(), {
      name: 'Renamed Teacher',
      username: 'renamed',
    });
    expect(json).toHaveBeenCalledWith({
      user: expect.objectContaining({ name: 'Renamed Teacher' }),
    });
    expect(deps.recordAuditEntry).toHaveBeenCalledWith(
      expect.objectContaining({
        action: 'user.updated',
        metadata: { fields: 'name,username' },
      }),
    );
  });

  it('hashes a new password and retires existing tokens', async () => {
    const { deps, call } = setup();
    const { status, json } = await call({ password: 'a-brand-new-password' });
    expect(status).toHaveBeenCalledWith(200);
    expect(deps.updateUser).toHaveBeenCalledWith(
      targetId.toString(),
      expect.objectContaining({ password: 'hashed', credentialsChangedAt: expect.any(Date) }),
    );
    expect(JSON.stringify(json.mock.calls)).not.toContain('a-brand-new-password');
    expect(JSON.stringify(json.mock.calls)).not.toContain('hashed');
  });

  it('refuses a password change for an account that signs in elsewhere', async () => {
    const { deps, call } = setup({ provider: 'google' });
    const { status } = await call({ password: 'a-brand-new-password' });
    expect(status).toHaveBeenCalledWith(409);
    expect(deps.updateUser).not.toHaveBeenCalled();
  });

  it('answers 409 when the new email belongs to someone else', async () => {
    const other = mockUser({ _id: new Types.ObjectId(), email: 'taken@example.com' });
    const { deps, call } = setup(
      {},
      {
        findUsers: jest
          .fn()
          .mockResolvedValueOnce([mockUser({ _id: targetId })])
          .mockResolvedValue([other]),
      },
    );
    const { status, json } = await call({ email: 'Taken@Example.com' });
    expect(status).toHaveBeenCalledWith(409);
    expect(json).toHaveBeenCalledWith({ error: 'email_taken', code: 'email_taken' });
    expect(deps.updateUser).not.toHaveBeenCalled();
  });

  it('disables an account, retires its tokens and audits it', async () => {
    const { deps, call } = setup();
    const { status, json } = await call({ disabled: true });
    expect(status).toHaveBeenCalledWith(200);
    expect(deps.updateUser).toHaveBeenCalledWith(targetId.toString(), {
      disabled: true,
      credentialsChangedAt: expect.any(Date),
    });
    expect(json).toHaveBeenCalledWith({ user: expect.objectContaining({ disabled: true }) });
    expect(deps.recordAuditEntry).toHaveBeenCalledWith(
      expect.objectContaining({ action: 'user.disabled' }),
    );
  });

  it('re-enables a disabled account', async () => {
    const { deps, call } = setup({ disabled: true });
    const { status } = await call({ disabled: false });
    expect(status).toHaveBeenCalledWith(200);
    expect(deps.updateUser).toHaveBeenCalledWith(targetId.toString(), { disabled: false });
    expect(deps.recordAuditEntry).toHaveBeenCalledWith(
      expect.objectContaining({ action: 'user.enabled' }),
    );
  });

  it('does not let an admin disable their own account', async () => {
    const { deps, call } = setup({}, {}, targetId);
    const { status, json } = await call({ disabled: true });
    expect(status).toHaveBeenCalledWith(403);
    expect(json).toHaveBeenCalledWith({
      error: 'cannot_disable_self',
      code: 'cannot_disable_self',
    });
    expect(deps.updateUser).not.toHaveBeenCalled();
  });

  it('does not disable the last active admin', async () => {
    const { deps, call } = setup(
      { role: SystemRoles.ADMIN },
      { countUsers: jest.fn().mockResolvedValue(1) },
    );
    const { status, json } = await call({ disabled: true });
    expect(status).toHaveBeenCalledWith(400);
    expect(json).toHaveBeenCalledWith({ error: 'last_admin', code: 'last_admin' });
    expect(deps.updateUser).not.toHaveBeenCalled();
  });

  it('rejects an empty or invalid body', async () => {
    const { deps, call } = setup();
    expect((await call({})).status).toHaveBeenCalledWith(400);
    expect((await call({ name: 'x' })).status).toHaveBeenCalledWith(400);
    expect((await call({ disabled: 'yes' })).status).toHaveBeenCalledWith(400);
    expect(deps.updateUser).not.toHaveBeenCalled();
  });
});
