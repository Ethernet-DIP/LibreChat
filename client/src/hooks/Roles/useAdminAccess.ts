import { SystemRoles } from 'librechat-data-provider';
import { useAuthContext } from '~/hooks/AuthContext';

/**
 * Whether the current user is offered the admin pages. This scopes the interface only: the
 * `/api/admin` routes check the capability on the server. False until the user has loaded.
 */
export default function useAdminAccess(): boolean {
  const { user } = useAuthContext();
  return user?.role === SystemRoles.ADMIN;
}
