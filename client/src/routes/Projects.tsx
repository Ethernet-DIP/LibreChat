import { Navigate, Outlet } from 'react-router-dom';
import useProjectsAccess from '~/hooks/Roles/useProjectsAccess';
import { useGetStartupConfig } from '~/data-provider';
import { useAuthContext } from '~/hooks/AuthContext';

/** Keeps users who are not offered Chat Projects out of a project page opened by URL. */
export default function ProjectsRoute() {
  const { user } = useAuthContext();
  const { data: startupConfig } = useGetStartupConfig();
  const canUseProjects = useProjectsAccess();
  if (startupConfig == null || user == null) {
    return null;
  }
  return canUseProjects ? <Outlet /> : <Navigate to="/c/new" replace />;
}
