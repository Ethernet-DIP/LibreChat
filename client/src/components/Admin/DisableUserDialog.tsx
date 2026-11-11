import { Button, OGDialog, OGDialogTemplate, Spinner, useToastContext } from '@librechat/client';
import type { AdminUserListItem, TError } from 'librechat-data-provider';
import { useUpdateUserMutation } from '~/data-provider';
import { adminUserErrorKeys } from './errors';
import { useLocalize } from '~/hooks';

type DisableUserDialogProps = {
  user: AdminUserListItem | null;
  onOpenChange: (open: boolean) => void;
};

/** Confirms turning an account off. Turning one back on needs no confirmation and is done
 *  straight from the row. */
export default function DisableUserDialog({ user, onOpenChange }: DisableUserDialogProps) {
  const localize = useLocalize();
  const { showToast } = useToastContext();
  const updateUser = useUpdateUserMutation();

  const confirm = () => {
    if (!user) {
      return;
    }
    updateUser.mutate(
      { userId: user.id, disabled: true },
      {
        onSuccess: () => {
          showToast({ message: localize('com_ui_admin_users_disabled') });
          onOpenChange(false);
        },
        onError: (error: TError | undefined) => {
          const key =
            adminUserErrorKeys[error?.response?.data?.code ?? ''] ??
            'com_ui_admin_users_update_error';
          showToast({ message: localize(key), status: 'error' });
          onOpenChange(false);
        },
      },
    );
  };

  return (
    <OGDialog open={user != null} onOpenChange={onOpenChange}>
      <OGDialogTemplate
        title={localize('com_ui_admin_users_disable_title')}
        description={localize('com_ui_admin_users_disable_body', {
          0: user?.name || user?.email || '',
        })}
        showCloseButton={false}
        className="w-11/12 max-w-md"
        buttons={
          <Button
            variant="destructive"
            onClick={confirm}
            disabled={updateUser.isLoading}
            aria-label={localize('com_ui_admin_users_disable')}
          >
            {updateUser.isLoading ? (
              <Spinner className="size-4" />
            ) : (
              localize('com_ui_admin_users_disable')
            )}
          </Button>
        }
      />
    </OGDialog>
  );
}
