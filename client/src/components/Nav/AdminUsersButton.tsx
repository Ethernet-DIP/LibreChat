import { Users } from 'lucide-react';
import { Link } from 'react-router-dom';
import { Button, TooltipAnchor } from '@librechat/client';
import { useAdminAccess, useLocalize } from '~/hooks';
import { cn } from '~/utils';

interface AdminUsersButtonProps {
  side?: 'right' | 'bottom';
  /** Mobile dismisses the drawer on navigation; the desktop rail stays put. */
  onNavigate?: () => void;
  /** `icon` is the rail's square, labelled by a tooltip; `row` carries its own label. */
  layout?: 'icon' | 'row';
}

/** Users and roles entry in the sidebar, offered to admins only. */
export default function AdminUsersButton({
  side = 'right',
  onNavigate,
  layout = 'icon',
}: AdminUsersButtonProps) {
  const localize = useLocalize();
  const isAdmin = useAdminAccess();

  if (!isAdmin) {
    return null;
  }

  const isRow = layout === 'row';
  const label = localize('com_ui_admin_users');
  const button = (
    <Button
      asChild
      variant="nav"
      size={isRow ? 'row' : 'icon'}
      className={cn('shrink-0', isRow ? 'w-full justify-start' : 'h-9 w-9')}
    >
      <Link
        to="/admin/users"
        data-testid="nav-admin-users-button"
        aria-label={isRow ? undefined : label}
        onClick={(event) => {
          if (event.button !== 0 || event.ctrlKey || event.metaKey || event.shiftKey) {
            return;
          }
          onNavigate?.();
        }}
      >
        <Users className="text-text-primary h-5 w-5 shrink-0" aria-hidden="true" />
        {isRow && (
          <span className="text-text-primary min-w-0 truncate text-sm font-medium">{label}</span>
        )}
      </Link>
    </Button>
  );

  return isRow ? button : <TooltipAnchor side={side} description={label} render={button} />;
}
