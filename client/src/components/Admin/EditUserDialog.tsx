import { useEffect, useId, useState } from 'react';
import {
  Button,
  Input,
  Label,
  OGDialog,
  OGDialogTemplate,
  Spinner,
  useToastContext,
} from '@librechat/client';
import type { AdminUserListItem, TError } from 'librechat-data-provider';
import { useUpdateUserMutation } from '~/data-provider';
import { adminUserErrorKeys } from './errors';
import { useLocalize } from '~/hooks';

type EditUserDialogProps = {
  user: AdminUserListItem | null;
  onOpenChange: (open: boolean) => void;
};

/** Edits an account's name, username, email and, optionally, its password. Only fields that
 *  changed are sent, so an untouched email is never re-validated against other accounts. */
export default function EditUserDialog({ user, onOpenChange }: EditUserDialogProps) {
  const localize = useLocalize();
  const formId = useId();
  const { showToast } = useToastContext();
  const updateUser = useUpdateUserMutation();
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [errorCode, setErrorCode] = useState<string | null>(null);

  useEffect(() => {
    setName(user?.name ?? '');
    setEmail(user?.email ?? '');
    setUsername(user?.username ?? '');
    setPassword('');
    setErrorCode(null);
    updateUser.reset();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [user?.id]);

  const isExternal = user != null && user.provider !== 'local';
  const changes = {
    ...(user && name.trim() !== user.name ? { name: name.trim() } : {}),
    ...(user && username.trim() !== user.username ? { username: username.trim() } : {}),
    ...(user && email.trim() !== user.email ? { email: email.trim() } : {}),
    ...(password ? { password } : {}),
  };
  const hasChanges = Object.keys(changes).length > 0;

  const handleSubmit = (event: React.FormEvent) => {
    event.preventDefault();
    if (!user || !hasChanges) {
      return;
    }
    setErrorCode(null);
    updateUser.mutate(
      { userId: user.id, ...changes },
      {
        onSuccess: () => {
          showToast({ message: localize('com_ui_admin_users_saved') });
          onOpenChange(false);
        },
        onError: (error: TError | undefined) => setErrorCode(error?.response?.data?.code ?? 'x'),
      },
    );
  };

  const errorKey = errorCode
    ? (adminUserErrorKeys[errorCode] ?? 'com_ui_admin_users_update_error')
    : null;

  return (
    <OGDialog open={user != null} onOpenChange={onOpenChange}>
      <OGDialogTemplate
        title={localize('com_ui_admin_users_edit')}
        description={localize('com_ui_admin_users_edit_description')}
        showCloseButton={false}
        className="w-11/12 max-w-md"
        main={
          <form id={formId} onSubmit={handleSubmit} className="flex flex-col gap-4">
            <div className="space-y-2">
              <Label htmlFor={`${formId}-name`}>{localize('com_ui_admin_users_field_name')}</Label>
              <Input
                id={`${formId}-name`}
                value={name}
                onChange={(event) => setName(event.target.value)}
                maxLength={80}
                autoComplete="off"
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor={`${formId}-email`}>
                {localize('com_ui_admin_users_field_email')}
              </Label>
              <Input
                id={`${formId}-email`}
                type="email"
                value={email}
                onChange={(event) => setEmail(event.target.value)}
                maxLength={120}
                autoComplete="off"
                disabled={isExternal}
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor={`${formId}-username`}>
                {localize('com_ui_admin_users_field_username')}
              </Label>
              <Input
                id={`${formId}-username`}
                value={username}
                onChange={(event) => setUsername(event.target.value)}
                maxLength={80}
                autoComplete="off"
              />
            </div>
            {!isExternal && (
              <div className="space-y-2">
                <Label htmlFor={`${formId}-password`}>
                  {localize('com_ui_admin_users_new_password')}{' '}
                  <span className="text-text-secondary font-normal">
                    {localize('com_ui_optional')}
                  </span>
                </Label>
                <Input
                  id={`${formId}-password`}
                  type="password"
                  value={password}
                  onChange={(event) => setPassword(event.target.value)}
                  maxLength={128}
                  autoComplete="new-password"
                />
              </div>
            )}
            {errorKey && (
              <p role="alert" className="text-text-destructive text-sm">
                {localize(errorKey)}
              </p>
            )}
          </form>
        }
        buttons={
          <Button
            type="submit"
            form={formId}
            variant="submit"
            disabled={!hasChanges || updateUser.isLoading}
            aria-label={localize('com_ui_admin_users_save')}
          >
            {updateUser.isLoading ? (
              <Spinner className="size-4" />
            ) : (
              localize('com_ui_admin_users_save')
            )}
          </Button>
        }
      />
    </OGDialog>
  );
}
