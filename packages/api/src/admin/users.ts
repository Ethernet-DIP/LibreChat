import { Types } from 'mongoose';
import { randomUUID } from 'node:crypto';
import { PrincipalType, SystemRoles } from 'librechat-data-provider';
import { logger, isValidObjectIdString, buildUserSearchFilter } from '@librechat/data-schemas';
import type {
  IUser,
  ConfigRecord,
  AdminUserListItem,
  AdminUserSearchResult,
  UserDeleteResult,
} from '@librechat/data-schemas';
import type { TCheckpointerConfig } from 'librechat-data-provider';
import type { FilterQuery } from 'mongoose';
import type { Response } from 'express';
import type { UserGenerationControl } from '~/user/generations';
import type { UserErasureDeps } from '~/user/erasure';
import type { ServerRequest } from '~/types/http';
import type { RecordAuditEntry } from './audit';
import { stopUserGenerations } from '~/user/generations';
import { getSafeErrorMetadata } from '~/utils/errors';
import { invalidatingConfigStore } from './cascade';
import { createAdminAuditEmitter } from './audit';
import { parsePagination } from './pagination';
import { eraseUserData } from '~/user/erasure';

const MAX_SEARCH_LENGTH = 200;

const ERASURE_PROFILE_KEYS = [
  'name',
  'username',
  'email',
  'provider',
  'googleId',
  'facebookId',
  'openidId',
  'samlId',
  'ldapId',
  'githubId',
  'discordId',
  'appleId',
  'emailVerified',
  'twoFactorEnabled',
  'termsAccepted',
  'termsAcceptedAt',
] as const;

const ERASURE_TARGET_FIELDS = ['role', 'tenantId', 'idOnTheSource', ...ERASURE_PROFILE_KEYS].join(
  ' ',
);

/** The target's plain profile fields, which storage header templates such as the user email read. */
export type ErasureTargetProfile = Partial<Pick<IUser, (typeof ERASURE_PROFILE_KEYS)[number]>>;

const USER_LIST_FIELDS =
  '_id name username email avatar role provider disabled createdAt updatedAt';

/** The target account's identity, from which the caller builds storage and MCP cleanup. */
export interface AdminErasureTarget {
  id: string;
  role?: string;
  tenantId?: string;
  /** External identity key, so principal resolution reuses the loaded user instead of re-reading it. */
  idOnTheSource?: string | null;
  profile?: ErasureTargetProfile;
}

export interface AdminErasureContext {
  deps: UserErasureDeps;
  checkpointer?: TCheckpointerConfig;
}

/** The account an admin supplies to `createUser`. */
export interface AdminCreateUserInput {
  email: string;
  name: string;
  username: string;
  password: string;
  confirm_password: string;
}

/** What the shared registration service answers; `userCreated` separates a new account from
 *  the identical 200 it returns when the email is already in use. */
export interface AdminRegisterResult {
  status: number;
  message?: string;
  userCreated?: boolean;
}

export interface AdminUsersDeps {
  /** The shared registration service, called with the admin-chosen role and a verified email. */
  registerUser?: (
    user: AdminCreateUserInput,
    additionalData: { role: string; emailVerified: boolean },
  ) => Promise<AdminRegisterResult>;
  /** Whether a role of exactly this name exists in the caller's partition. */
  roleExists?: (name: string) => Promise<boolean>;
  recordAuditEntry?: RecordAuditEntry;
  auditFailClosed?: boolean;
  /** Persists profile, password and `disabled` changes; the write bumps `updatedAt`, which retires
   *  the cached auth document. */
  updateUser?: (userId: string, data: Partial<IUser>) => Promise<IUser | null>;
  /** Hashes a new password the way registration does. */
  hashPassword?: (plain: string) => Promise<string>;
  /** The deployment's minimum password length; 8 when unset. */
  minPasswordLength?: number;
  findUsers: (
    searchCriteria: FilterQuery<IUser>,
    fieldsToSelect?: string | string[] | null,
    options?: { limit?: number; offset?: number; sort?: Record<string, 1 | -1> },
  ) => Promise<IUser[]>;
  countUsers: (filter?: FilterQuery<IUser>) => Promise<number>;
  beginAgentTriggerUserDeletion: (
    userId: string,
    startedAt: Date,
  ) => Promise<'acquired' | 'in_progress' | 'missing'>;
  cancelAgentTriggerUserDeletion: (userId: string, startedAt: Date) => Promise<boolean>;
  drainAgentTriggerDeliveriesForUser: (userId: string) => Promise<void>;
  prepareAgentTriggerUserPurge: (
    userId: string,
    fenceStartedAt: Date,
    tenantId?: string,
  ) => Promise<void>;
  cancelAgentTriggerUserPurge: (userId: string, fenceStartedAt: Date) => Promise<boolean>;
  purgeAgentTriggerDeliveriesForUser: (userId: string) => Promise<void>;
  revokeUserCodeEnvironmentWorkers?: (userId: string) => Promise<number>;
  /** Cancels and drains the account's subagent thread tasks. */
  cancelSubagentTasks?: (userId: string, tenantId?: string) => Promise<unknown>;
  /**
   * Reversibly suspends the account's schedules under a per-attempt token; false means the
   * executions could not be confirmed stopped. Restored if the deletion fails.
   */
  quiesceUserSchedules: (userId: string, token: string) => Promise<boolean>;
  restoreUserSchedulesFromDeletion: (userId: string, token: string) => Promise<unknown>;
  generationJobs: UserGenerationControl;
  /**
   * Resolves the dependencies of the shared `eraseUserData` cascade for the account being
   * deleted, the same set the self-service controller and the delete-user CLI pass. Storage
   * cleanup must run as the target user, not the calling admin.
   */
  resolveErasure: (target: AdminErasureTarget) => Promise<AdminErasureContext>;
  /** Thin data-layer delete: removes the User document after the erasure cascade has run. */
  deleteUserById: (userId: string) => Promise<UserDeleteResult>;
  deleteUserCodeEnvironments: (userId: string | Types.ObjectId) => Promise<number>;
  invalidateCodeEnvironmentConfigCache: (tenantId?: string) => Promise<void>;
  deleteConfig: (
    principalType: PrincipalType,
    principalId: string | Types.ObjectId,
  ) => Promise<ConfigRecord | null>;
  /** Clears the merged-config caches (on every instance, with Redis) after the deletion removes
   * the user's config override, before the response, as config writes do. */
  invalidateConfigCaches?: (tenantId?: string) => Promise<void>;
  deleteAclEntries: (filter: {
    principalType: PrincipalType;
    principalId: string | Types.ObjectId;
  }) => Promise<void>;
  /**
   * Credential IDs are globally unique, so passkeys left behind by a deleted user
   * keep authentication material and can collide with a later registration.
   */
  deletePasskeysByUser: (userId: string) => Promise<number>;
}

export function createAdminUsersHandlers(deps: AdminUsersDeps): {
  listUsers: (req: ServerRequest, res: Response) => Promise<Response>;
  searchUsers: (req: ServerRequest, res: Response) => Promise<Response>;
  deleteUser: (req: ServerRequest, res: Response) => Promise<Response>;
  createUser: (req: ServerRequest, res: Response) => Promise<Response>;
  updateUser: (req: ServerRequest, res: Response) => Promise<Response>;
} {
  const emitAudit = createAdminAuditEmitter({
    recordAuditEntry: deps.recordAuditEntry,
    failClosed: deps.auditFailClosed,
    logPrefix: '[adminUsers]',
  });

  const {
    findUsers,
    countUsers,
    beginAgentTriggerUserDeletion,
    cancelAgentTriggerUserDeletion,
    drainAgentTriggerDeliveriesForUser,
    prepareAgentTriggerUserPurge,
    cancelAgentTriggerUserPurge,
    purgeAgentTriggerDeliveriesForUser,
    revokeUserCodeEnvironmentWorkers,
    deleteUserCodeEnvironments,
    deleteUserById,
    invalidateCodeEnvironmentConfigCache,
    deleteConfig,
    invalidateConfigCaches,
    deleteAclEntries,
    deletePasskeysByUser,
    resolveErasure,
    cancelSubagentTasks,
    quiesceUserSchedules,
    restoreUserSchedulesFromDeletion,
    generationJobs,
  } = deps;

  async function listUsersHandler(req: ServerRequest, res: Response) {
    try {
      const { limit, offset } = parsePagination(req.query);
      const [users, total] = await Promise.all([
        findUsers({}, USER_LIST_FIELDS, { limit, offset, sort: { createdAt: -1 } }),
        countUsers(),
      ]);

      const mapped: AdminUserListItem[] = users.map((u) => ({
        id: u._id?.toString() ?? '',
        name: u.name ?? '',
        username: u.username ?? '',
        email: u.email ?? '',
        avatar: u.avatar ?? '',
        role: u.role ?? 'USER',
        provider: u.provider ?? 'local',
        disabled: u.disabled === true,
        createdAt: u.createdAt?.toISOString(),
        updatedAt: u.updatedAt?.toISOString(),
      }));

      return res.status(200).json({ users: mapped, total, limit, offset });
    } catch (error) {
      logger.error('[adminUsers] listUsers error:', error);
      return res.status(500).json({ error: 'Failed to list users' });
    }
  }

  async function searchUsersHandler(req: ServerRequest, res: Response) {
    try {
      const rawQ = req.query.q;
      const rawLimit = req.query.limit;
      const query = typeof rawQ === 'string' ? rawQ : undefined;
      const limitStr = typeof rawLimit === 'string' ? rawLimit : '20';
      const trimmed = query?.trim() ?? '';

      if (!trimmed) {
        return res.status(400).json({ error: 'Query parameter "q" is required' });
      }

      if (trimmed.length < 2) {
        return res.status(400).json({ error: 'Query must be at least 2 characters' });
      }

      if (trimmed.length > MAX_SEARCH_LENGTH) {
        return res
          .status(400)
          .json({ error: `Query must not exceed ${MAX_SEARCH_LENGTH} characters` });
      }

      const searchLimit = Math.min(Math.max(1, parseInt(limitStr, 10) || 20), 50);
      const filter = buildUserSearchFilter(trimmed, { legacyPrefix: true });
      const users = filter
        ? await findUsers(filter, '_id name email username avatar', {
            limit: searchLimit,
            sort: { name: 1 },
          })
        : [];

      const results: AdminUserSearchResult[] = users.map((u) => ({
        id: u._id?.toString() ?? '',
        name: u.name ?? '',
        email: u.email ?? '',
        username: u.username,
        avatarUrl: u.avatar,
      }));

      return res
        .status(200)
        .json({ users: results, total: results.length, capped: results.length >= searchLimit });
    } catch (error) {
      logger.error('[adminUsers] searchUsers error:', error);
      return res.status(500).json({ error: 'Failed to search users' });
    }
  }

  /** Stable codes the client maps to localized copy; the body never carries service text. */
  type CreateUserError =
    | 'invalid_details'
    | 'invalid_role'
    | 'email_taken'
    | 'domain_not_allowed'
    | 'unavailable';

  const createUserFailure = (res: Response, status: number, code: CreateUserError) =>
    res.status(status).json({ error: code, code });

  async function createUserHandler(req: ServerRequest, res: Response) {
    try {
      const { registerUser, roleExists } = deps;
      if (!registerUser || !roleExists) {
        return createUserFailure(res, 501, 'unavailable');
      }
      const body = (req.body ?? {}) as Record<string, unknown>;
      const email = typeof body.email === 'string' ? body.email.trim() : '';
      const name = typeof body.name === 'string' ? body.name.trim() : '';
      const password = typeof body.password === 'string' ? body.password : '';
      const role =
        typeof body.role === 'string' && body.role.trim() ? body.role.trim() : SystemRoles.USER;
      const rawUsername = typeof body.username === 'string' ? body.username.trim() : '';
      const username = rawUsername || email.split('@')[0];

      if (!email.includes('@') || email.length > 120 || !name || !password || !username) {
        return createUserFailure(res, 400, 'invalid_details');
      }
      if (role !== SystemRoles.USER && !(await roleExists(role))) {
        return createUserFailure(res, 400, 'invalid_role');
      }

      const result = await registerUser(
        { email, name, username, password, confirm_password: password },
        { role, emailVerified: true },
      );
      if (result.status === 403) {
        return createUserFailure(res, 403, 'domain_not_allowed');
      }
      if (result.status === 404) {
        return createUserFailure(res, 400, 'invalid_details');
      }
      if (result.status !== 200) {
        return res.status(500).json({ error: 'Failed to create user' });
      }
      if (result.userCreated !== true) {
        return createUserFailure(res, 409, 'email_taken');
      }

      const [created] = await findUsers({ email: email.toLowerCase() }, USER_LIST_FIELDS, {
        limit: 1,
      });
      const userId = created?._id?.toString() ?? '';
      await emitAudit(req, {
        action: 'user.created',
        severity: role === SystemRoles.ADMIN ? 'critical' : 'info',
        target: { type: 'user', id: userId, name: created?.name ?? name },
        metadata: { role },
      });
      const user: AdminUserListItem = {
        id: userId,
        name: created?.name ?? name,
        username: created?.username ?? username,
        email: created?.email ?? email,
        avatar: created?.avatar ?? '',
        role: created?.role ?? role,
        provider: created?.provider ?? 'local',
        createdAt: created?.createdAt?.toISOString(),
        updatedAt: created?.updatedAt?.toISOString(),
      };
      return res.status(201).json({ user });
    } catch (error) {
      logger.error('[adminUsers] createUser error:', getSafeErrorMetadata(error));
      return res.status(500).json({ error: 'Failed to create user' });
    }
  }

  type UpdateUserError =
    | CreateUserError
    | 'nothing_to_update'
    | 'email_locked'
    | 'password_unsupported'
    | 'cannot_disable_self'
    | 'last_admin';

  const updateUserFailure = (res: Response, status: number, code: UpdateUserError) =>
    res.status(status).json({ error: code, code });

  async function updateUserHandler(req: ServerRequest, res: Response) {
    try {
      const { updateUser, hashPassword } = deps;
      if (!updateUser) {
        return updateUserFailure(res, 501, 'unavailable');
      }
      const { id } = req.params as { id: string };
      if (!isValidObjectIdString(id)) {
        return res.status(400).json({ error: 'Invalid user ID format' });
      }

      const body = (req.body ?? {}) as Record<string, unknown>;
      const changes: Partial<IUser> = {};
      const fields: string[] = [];
      if (body.name !== undefined) {
        const name = typeof body.name === 'string' ? body.name.trim() : '';
        if (name.length < 3 || name.length > 80) {
          return updateUserFailure(res, 400, 'invalid_details');
        }
        changes.name = name;
        fields.push('name');
      }
      if (body.username !== undefined) {
        const username = typeof body.username === 'string' ? body.username.trim() : '';
        if (username.length < 2 || username.length > 80) {
          return updateUserFailure(res, 400, 'invalid_details');
        }
        changes.username = username;
        fields.push('username');
      }
      if (body.email !== undefined) {
        const email = typeof body.email === 'string' ? body.email.trim().toLowerCase() : '';
        if (!email.includes('@') || email.length > 120) {
          return updateUserFailure(res, 400, 'invalid_details');
        }
        changes.email = email;
        fields.push('email');
      }
      if (body.password !== undefined) {
        const password = typeof body.password === 'string' ? body.password : '';
        if (
          password.length < (deps.minPasswordLength ?? 8) ||
          password.length > 128 ||
          password.trim().length === 0 ||
          !hashPassword
        ) {
          return updateUserFailure(res, 400, 'invalid_details');
        }
        changes.password = await hashPassword(password);
        fields.push('password');
      }
      if (body.disabled !== undefined) {
        if (typeof body.disabled !== 'boolean') {
          return updateUserFailure(res, 400, 'invalid_details');
        }
        changes.disabled = body.disabled;
      }
      if (fields.length === 0 && changes.disabled === undefined) {
        return updateUserFailure(res, 400, 'nothing_to_update');
      }

      const [target] = await findUsers({ _id: id }, `${USER_LIST_FIELDS} tenantId`, { limit: 1 });
      if (!target) {
        return res.status(404).json({ error: 'User not found' });
      }

      const isLocal = (target.provider ?? 'local') === 'local';
      if (changes.email !== undefined && changes.email !== target.email?.toLowerCase()) {
        if (!isLocal) {
          return updateUserFailure(res, 409, 'email_locked');
        }
        const [taken] = await findUsers({ email: changes.email }, '_id', { limit: 1 });
        if (taken && taken._id?.toString() !== id) {
          return updateUserFailure(res, 409, 'email_taken');
        }
      } else {
        delete changes.email;
        const index = fields.indexOf('email');
        if (index >= 0) {
          fields.splice(index, 1);
        }
      }
      if (changes.password !== undefined && !isLocal) {
        return updateUserFailure(res, 409, 'password_unsupported');
      }

      const wasDisabled = target.disabled === true;
      const disabling = changes.disabled === true && !wasDisabled;
      const enabling = changes.disabled === false && wasDisabled;
      if (changes.disabled === wasDisabled) {
        delete changes.disabled;
      }
      if (disabling) {
        const callerId = req.user?._id?.toString() ?? req.user?.id;
        if (callerId === id) {
          return updateUserFailure(res, 403, 'cannot_disable_self');
        }
        if (target.role === SystemRoles.ADMIN) {
          const activeAdmins = await countUsers({
            role: SystemRoles.ADMIN,
            disabled: { $ne: true },
          });
          if (activeAdmins <= 1) {
            return updateUserFailure(res, 400, 'last_admin');
          }
        }
      }

      /** A new password or a disable retires every token issued before this instant. */
      if (changes.password !== undefined || disabling) {
        changes.credentialsChangedAt = new Date();
      }
      if (Object.keys(changes).length === 0) {
        return updateUserFailure(res, 400, 'nothing_to_update');
      }

      const updated = await updateUser(id, changes);
      if (!updated) {
        return res.status(404).json({ error: 'User not found' });
      }
      if (disabling) {
        await stopUserGenerations(id, target.tenantId, generationJobs);
      }

      const targetRef = { type: 'user', id, name: updated.name ?? target.name ?? '' };
      if (fields.length > 0) {
        await emitAudit(req, {
          action: 'user.updated',
          severity: fields.includes('password') ? 'warning' : 'info',
          target: targetRef,
          metadata: { fields: fields.join(',') },
        });
      }
      if (disabling || enabling) {
        await emitAudit(req, {
          action: disabling ? 'user.disabled' : 'user.enabled',
          severity: disabling ? 'warning' : 'info',
          target: targetRef,
        });
      }

      const user: AdminUserListItem = {
        id,
        name: updated.name ?? target.name ?? '',
        username: updated.username ?? target.username ?? '',
        email: updated.email ?? target.email ?? '',
        avatar: updated.avatar ?? target.avatar ?? '',
        role: updated.role ?? target.role ?? SystemRoles.USER,
        provider: updated.provider ?? target.provider ?? 'local',
        disabled: updated.disabled === true,
        createdAt: updated.createdAt?.toISOString(),
        updatedAt: updated.updatedAt?.toISOString(),
      };
      return res.status(200).json({ user });
    } catch (error) {
      logger.error('[adminUsers] updateUser error:', getSafeErrorMetadata(error));
      return res.status(500).json({ error: 'Failed to update user' });
    }
  }

  async function deleteUserHandler(req: ServerRequest, res: Response) {
    let targetUserId: string | undefined;
    let triggerDeletionFence: Date | undefined;
    let scheduleSuspensionToken: string | undefined;
    let userDeleted = false;

    try {
      const { id } = req.params as { id: string };
      targetUserId = id;

      if (!isValidObjectIdString(id)) {
        return res.status(400).json({ error: 'Invalid user ID format' });
      }

      const callerId = req.user?._id?.toString() ?? req.user?.id;
      if (callerId === id) {
        return res.status(403).json({ error: 'Cannot delete your own account' });
      }

      const [targetUser] = await findUsers({ _id: id }, ERASURE_TARGET_FIELDS, { limit: 1 });
      if (targetUser?.role === SystemRoles.ADMIN) {
        const adminCount = await countUsers({ role: SystemRoles.ADMIN });
        if (adminCount <= 1) {
          return res.status(400).json({ error: 'Cannot delete the last admin user' });
        }
      }

      triggerDeletionFence = new Date();
      const fenceState = await beginAgentTriggerUserDeletion(id, triggerDeletionFence);
      if (fenceState === 'in_progress') {
        triggerDeletionFence = undefined;
        return res.status(409).json({ error: 'User deletion is already in progress' });
      }
      if (fenceState === 'missing') {
        triggerDeletionFence = undefined;
        return res.status(404).json({ error: 'User not found' });
      }
      await prepareAgentTriggerUserPurge(id, triggerDeletionFence, targetUser?.tenantId);
      await drainAgentTriggerDeliveriesForUser(id);

      await cancelSubagentTasks?.(id, targetUser?.tenantId);
      scheduleSuspensionToken = randomUUID();
      if (!(await quiesceUserSchedules(id, scheduleSuspensionToken))) {
        throw new Error('Scheduled executions could not be confirmed stopped');
      }
      await stopUserGenerations(id, targetUser?.tenantId, generationJobs);

      const { deps: erasureDeps, checkpointer } = await resolveErasure({
        id,
        role: targetUser?.role,
        tenantId: targetUser?.tenantId,
        idOnTheSource: targetUser?.idOnTheSource ?? null,
        profile: targetUser,
      });
      await eraseUserData(
        { userId: id, tenantId: targetUser?.tenantId, checkpointer },
        erasureDeps,
      );
      const result = await deleteUserById(id);

      if (result.deletedCount === 0) {
        await cancelAgentTriggerUserPurge(id, triggerDeletionFence);
        await cancelAgentTriggerUserDeletion(id, triggerDeletionFence);
        triggerDeletionFence = undefined;
        return res.status(404).json({ error: 'User not found' });
      }
      userDeleted = true;
      let codeEnvironmentCleanupSafe = true;
      try {
        await revokeUserCodeEnvironmentWorkers?.(id);
      } catch (error) {
        codeEnvironmentCleanupSafe = false;
        logger.error('[adminUsers] failed to revoke code environment workers:', id, error);
      }
      await purgeAgentTriggerDeliveriesForUser(id);

      if (targetUser?.role === SystemRoles.ADMIN) {
        const remaining = await countUsers({ role: SystemRoles.ADMIN });
        if (remaining === 0) {
          logger.error(
            `[adminUsers] CRITICAL: last admin deleted via race condition, user: ${id}. ` +
              'Manual DB intervention required to restore an ADMIN user.',
          );
        }
      }

      const objectId = new Types.ObjectId(id);
      const profiles = invalidatingConfigStore(
        { deleteConfig },
        { invalidateConfigCaches, tenantId: req.user?.tenantId, logPrefix: '[adminUsers]' },
      );
      const cleanupResults = await Promise.allSettled([
        profiles.deleteConfig(PrincipalType.USER, id),
        ...(codeEnvironmentCleanupSafe ? [deleteUserCodeEnvironments(objectId)] : []),
        deleteAclEntries({ principalType: PrincipalType.USER, principalId: objectId }),
        deletePasskeysByUser(id),
      ]);
      for (const r of cleanupResults) {
        if (r.status === 'rejected') {
          logger.error('[adminUsers] cascade cleanup failed for user:', id, r.reason);
        }
      }
      await invalidateCodeEnvironmentConfigCache(targetUser?.tenantId).catch((error: unknown) => {
        logger.error('[adminUsers] code environment cache invalidation failed:', id, error);
      });

      return res.status(200).json({ message: result.message || 'User deleted successfully' });
    } catch (error) {
      /** Restore before releasing the fence, as the self-service flow does. */
      if (targetUserId != null && scheduleSuspensionToken != null && !userDeleted) {
        try {
          await restoreUserSchedulesFromDeletion(targetUserId, scheduleSuspensionToken);
        } catch (restoreError) {
          logger.error(
            `[adminUsers] failed to restore suspended schedules for user ${targetUserId} under token ${scheduleSuspensionToken}:`,
            restoreError,
          );
        }
      }
      if (targetUserId != null && triggerDeletionFence != null && !userDeleted) {
        try {
          await cancelAgentTriggerUserPurge(targetUserId, triggerDeletionFence);
        } catch (purgeFenceError) {
          logger.error('[adminUsers] failed to disarm trigger purge recovery:', purgeFenceError);
        }
        try {
          await cancelAgentTriggerUserDeletion(targetUserId, triggerDeletionFence);
        } catch (fenceError) {
          logger.error('[adminUsers] failed to release trigger deletion fence:', fenceError);
        }
      }
      logger.error('[adminUsers] deleteUser error:', error);
      return res.status(500).json({ error: 'Failed to delete user' });
    }
  }

  return {
    listUsers: listUsersHandler,
    searchUsers: searchUsersHandler,
    deleteUser: deleteUserHandler,
    createUser: createUserHandler,
    updateUser: updateUserHandler,
  };
}
