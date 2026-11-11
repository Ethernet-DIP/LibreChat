import { Navigate, Outlet } from 'react-router-dom';
import useAdminAccess from '~/hooks/Roles/useAdminAccess';
import { useAuthContext } from '~/hooks/AuthContext';

/** Keeps users who are not admins out of an admin page opened by URL. */
export default function AdminRoute() {
  const { user } = useAuthContext();
  const isAdmin = useAdminAccess();
  if (user == null) {
    return null;
  }
  return isAdmin ? <Outlet /> : <Navigate to="/c/new" replace />;
}
