import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { QueryKeys, SystemRoles, dataService } from 'librechat-data-provider';
import type { UseMutationResult, UseQueryOptions, UseQueryResult } from '@tanstack/react-query';
import type * as t from 'librechat-data-provider';

export const useAdminUsersQuery = (
  params: t.AdminUsersParams,
  config?: UseQueryOptions<t.AdminUsersResponse>,
): UseQueryResult<t.AdminUsersResponse> =>
  useQuery<t.AdminUsersResponse>(
    [QueryKeys.adminUsers, params],
    () => dataService.listAdminUsers(params),
    { keepPreviousData: true, refetchOnWindowFocus: false, retry: false, ...config },
  );

export type SetUserRoleVars = { userId: string; currentRole: string; role: string };

/** Moves a user to `role`. USER is not assignable directly, so it is reached by ending the
 *  membership of the current role, which the server resolves to USER. */
export const useSetUserRoleMutation = (): UseMutationResult<
  { success: boolean },
  t.TError | undefined,
  SetUserRoleVars
> => {
  const queryClient = useQueryClient();
  return useMutation(
    async ({ userId, currentRole, role }: SetUserRoleVars) => {
      if (role === SystemRoles.USER) {
        return dataService.removeAdminRoleMember(currentRole, userId);
      }
      return dataService.addAdminRoleMember(role, userId);
    },
    { onSuccess: () => queryClient.invalidateQueries([QueryKeys.adminUsers]) },
  );
};

export type CreateUserVars = t.TAdminCreateUserRequest & { role?: string };

/** The create endpoint always makes a standard user, so a higher role is a second, separately
 *  authorized step through the role-members API. */
export const useCreateUserMutation = (): UseMutationResult<
  t.TAdminCreateUserResponse,
  t.TError | undefined,
  CreateUserVars
> => {
  const queryClient = useQueryClient();
  return useMutation(
    async ({ role, ...body }: CreateUserVars) => {
      const created = await dataService.createAdminUser(body);
      if (role && role !== SystemRoles.USER) {
        try {
          await dataService.addAdminRoleMember(role, created.user.id);
        } catch {
          throw { response: { data: { code: 'role_failed' } } } as t.TError;
        }
      }
      return created;
    },
    { onSettled: () => queryClient.invalidateQueries([QueryKeys.adminUsers]) },
  );
};

export type UpdateUserVars = { userId: string } & t.AdminUpdateUserBody;

export const useUpdateUserMutation = (): UseMutationResult<
  t.AdminCreateUserResponse,
  t.TError | undefined,
  UpdateUserVars
> => {
  const queryClient = useQueryClient();
  return useMutation(
    ({ userId, ...body }: UpdateUserVars) => dataService.updateAdminUser(userId, body),
    { onSuccess: () => queryClient.invalidateQueries([QueryKeys.adminUsers]) },
  );
};
