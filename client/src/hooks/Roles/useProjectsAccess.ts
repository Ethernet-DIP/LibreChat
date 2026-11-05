import { SystemRoles } from 'librechat-data-provider';
import { useGetStartupConfig } from '~/data-provider';
import { useAuthContext } from '~/hooks/AuthContext';

/**
 * Whether the current user is offered Chat Projects. Without the `projects.adminOnly` config
 * every user is. This scopes the interface only: the server does not restrict project requests.
 * Stays false until the config and user have loaded, so a project surface never flashes.
 */
export default function useProjectsAccess(): boolean {
  const { user } = useAuthContext();
  const { data: startupConfig } = useGetStartupConfig();
  if (startupConfig == null || user == null) {
    return false;
  }
  return startupConfig.projects?.adminOnly !== true || user.role === SystemRoles.ADMIN;
}
