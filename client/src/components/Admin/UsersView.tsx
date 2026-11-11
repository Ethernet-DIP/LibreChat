import { useMemo, useState } from 'react';
import { UserPlus } from 'lucide-react';
import { SystemRoles } from 'librechat-data-provider';
import { Button, Dropdown, FilterInput, Skeleton, useToastContext } from '@librechat/client';
import type { AdminUserListItem, TError } from 'librechat-data-provider';
import { useAdminUsersQuery, useListRoles, useSetUserRoleMutation } from '~/data-provider';
import { useAuthContext } from '~/hooks/AuthContext';
import AddUserDialog from './AddUserDialog';
import { useLocalize } from '~/hooks';

const PAGE_SIZE = 25;

function formatDate(value?: string) {
  const date = value ? new Date(value) : null;
  if (date == null || Number.isNaN(date.getTime())) {
    return '';
  }
  return date.toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric' });
}

/** Admin page: every account with its role, and a control to move a user to another role. */
export default function UsersView() {
  const localize = useLocalize();
  const { showToast } = useToastContext();
  const { user: self } = useAuthContext();
  const [offset, setOffset] = useState(0);
  const [filter, setFilter] = useState('');
  const [addOpen, setAddOpen] = useState(false);

  const { data, isLoading, isError, isFetching, refetch } = useAdminUsersQuery({
    limit: PAGE_SIZE,
    offset,
  });
  const { data: roleList } = useListRoles();
  const setRole = useSetUserRoleMutation();

  const roleNames = useMemo(() => {
    const names = roleList?.roles?.map((role) => role.name) ?? [];
    return names.length > 0 ? names : [SystemRoles.USER, SystemRoles.ADMIN];
  }, [roleList]);

  const query = filter.trim().toLowerCase();
  const users = useMemo(() => {
    const all = data?.users ?? [];
    if (!query) {
      return all;
    }
    return all.filter((u) =>
      [u.name, u.email, u.username].some((field) => field?.toLowerCase().includes(query)),
    );
  }, [data, query]);

  const total = data?.total ?? 0;
  const pageStart = total === 0 ? 0 : offset + 1;
  const pageEnd = Math.min(offset + PAGE_SIZE, total);

  const changeRole = (target: AdminUserListItem, role: string) => {
    if (role === target.role) {
      return;
    }
    setRole.mutate(
      { userId: target.id, currentRole: target.role, role },
      {
        onSuccess: () => showToast({ message: localize('com_ui_admin_users_role_updated') }),
        onError: (error: TError | undefined) =>
          showToast({
            message:
              error?.response?.status === 400
                ? localize('com_ui_admin_users_last_admin')
                : localize('com_ui_admin_users_role_error'),
            status: 'error',
          }),
      },
    );
  };

  return (
    <main className="bg-surface-primary flex h-full min-h-0 flex-col overflow-y-auto px-4 py-6 md:px-8">
      <div className="mx-auto w-full max-w-4xl">
        <div className="flex items-start justify-between gap-4">
          <div>
            <h1 className="text-text-primary text-2xl font-semibold">
              {localize('com_ui_admin_users')}
            </h1>
            <p className="text-text-secondary mt-1 text-sm">
              {localize('com_ui_admin_users_description')}
            </p>
          </div>
          <Button variant="submit" className="shrink-0" onClick={() => setAddOpen(true)}>
            <UserPlus className="size-4" aria-hidden="true" />
            {localize('com_ui_admin_users_add')}
          </Button>
        </div>
        <AddUserDialog open={addOpen} onOpenChange={setAddOpen} />

        <div className="mt-6 max-w-sm">
          <FilterInput
            inputId="admin-users-filter"
            label={localize('com_ui_admin_users_filter')}
            value={filter}
            onChange={(event) => setFilter(event.target.value)}
          />
        </div>

        {isError ? (
          <div role="alert" className="text-text-secondary mt-8 flex flex-col items-start gap-3">
            <p>{localize('com_ui_admin_users_error')}</p>
            <Button variant="outline" onClick={() => refetch()}>
              {localize('com_ui_retry')}
            </Button>
          </div>
        ) : (
          <div className="border-border-light mt-6 overflow-x-auto rounded-xl border">
            <table className="w-full text-start text-sm">
              <caption className="sr-only">{localize('com_ui_admin_users')}</caption>
              <thead className="bg-surface-secondary text-text-secondary">
                <tr>
                  <th scope="col" className="px-4 py-3 text-start font-medium">
                    {localize('com_ui_admin_users_col_user')}
                  </th>
                  <th scope="col" className="px-4 py-3 text-start font-medium">
                    {localize('com_ui_admin_users_col_role')}
                  </th>
                  <th scope="col" className="hidden px-4 py-3 text-start font-medium sm:table-cell">
                    {localize('com_ui_admin_users_col_joined')}
                  </th>
                </tr>
              </thead>
              <tbody aria-busy={isLoading || isFetching}>
                {isLoading &&
                  Array.from({ length: 5 }, (_, i) => (
                    <tr key={i} className="border-border-light border-t">
                      <td className="px-4 py-3" colSpan={3}>
                        <Skeleton className="h-8 w-full" />
                      </td>
                    </tr>
                  ))}
                {!isLoading && users.length === 0 && (
                  <tr className="border-border-light border-t">
                    <td colSpan={3} className="text-text-secondary px-4 py-8 text-center">
                      {localize('com_ui_admin_users_empty')}
                    </td>
                  </tr>
                )}
                {users.map((u) => {
                  const isSelf = u.id === self?.id;
                  return (
                    <tr key={u.id} className="border-border-light border-t">
                      <td className="px-4 py-3">
                        <div className="text-text-primary font-medium">
                          {u.name || u.username || u.email}
                          {isSelf && (
                            <span className="text-text-secondary ms-2 text-xs font-normal">
                              {localize('com_ui_admin_users_you')}
                            </span>
                          )}
                        </div>
                        <div className="text-text-secondary text-xs">{u.email}</div>
                      </td>
                      <td className="px-4 py-3">
                        <Dropdown
                          variant="compact"
                          value={u.role}
                          options={roleNames.includes(u.role) ? roleNames : [...roleNames, u.role]}
                          onChange={(role) => changeRole(u, role)}
                          disabled={isSelf || setRole.isLoading}
                          ariaLabel={localize('com_ui_admin_users_role_for', {
                            0: u.name || u.email,
                          })}
                        />
                      </td>
                      <td className="text-text-secondary hidden px-4 py-3 sm:table-cell">
                        {formatDate(u.createdAt)}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}

        {!isError && total > PAGE_SIZE && (
          <nav
            aria-label={localize('com_ui_admin_users')}
            className="mt-4 flex items-center justify-between"
          >
            <span className="text-text-secondary text-sm" aria-live="polite">
              {localize('com_ui_admin_users_range', { 0: pageStart, 1: pageEnd, 2: total })}
            </span>
            <div className="flex gap-2">
              <Button
                variant="outline"
                disabled={offset === 0}
                onClick={() => setOffset(Math.max(0, offset - PAGE_SIZE))}
              >
                {localize('com_ui_prev')}
              </Button>
              <Button
                variant="outline"
                disabled={offset + PAGE_SIZE >= total}
                onClick={() => setOffset(offset + PAGE_SIZE)}
              >
                {localize('com_ui_next')}
              </Button>
            </div>
          </nav>
        )}
      </div>
    </main>
  );
}
