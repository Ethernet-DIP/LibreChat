import { useId, useMemo, useState } from 'react';
import { SystemRoles } from 'librechat-data-provider';
import {
  Button,
  Dropdown,
  Input,
  Label,
  OGDialog,
  OGDialogTemplate,
  Spinner,
  useToastContext,
} from '@librechat/client';
import type { TError } from 'librechat-data-provider';
import type { TranslationKeys } from '~/hooks';
import { useCreateUserMutation, useListRoles } from '~/data-provider';
import { useLocalize } from '~/hooks';

type AddUserDialogProps = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
};

const errorKeys: Record<string, TranslationKeys> = {
  invalid_details: 'com_ui_admin_users_err_invalid_details',
  email_taken: 'com_ui_admin_users_err_email_taken',
  domain_not_allowed: 'com_ui_admin_users_err_domain',
  invalid_role: 'com_ui_admin_users_err_role',
};

/** Creates an account on the admin's behalf. The server marks the email verified and applies
 *  the chosen role, so the person can sign in with the temporary password straight away. */
export default function AddUserDialog({ open, onOpenChange }: AddUserDialogProps) {
  const localize = useLocalize();
  const formId = useId();
  const { showToast } = useToastContext();
  const createUser = useCreateUserMutation();
  const { data: roleList } = useListRoles();
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [role, setRole] = useState<string>(SystemRoles.USER);
  const [errorCode, setErrorCode] = useState<string | null>(null);

  const roleNames = useMemo(() => {
    const names = roleList?.roles?.map((r) => r.name) ?? [];
    return names.length > 0 ? names : [SystemRoles.USER, SystemRoles.ADMIN];
  }, [roleList]);

  const reset = () => {
    setName('');
    setEmail('');
    setUsername('');
    setPassword('');
    setRole(SystemRoles.USER);
    setErrorCode(null);
    createUser.reset();
  };

  const handleOpenChange = (next: boolean) => {
    if (!next) {
      reset();
    }
    onOpenChange(next);
  };

  const handleSubmit = (event: React.FormEvent) => {
    event.preventDefault();
    setErrorCode(null);
    createUser.mutate(
      { name: name.trim(), email: email.trim(), username: username.trim(), password, role },
      {
        onSuccess: () => {
          showToast({ message: localize('com_ui_admin_users_created') });
          handleOpenChange(false);
        },
        onError: (error: TError | undefined) => {
          setErrorCode(error?.response?.data?.code ?? 'unknown');
        },
      },
    );
  };

  const canSubmit = name.trim() && email.trim() && password && !createUser.isLoading;
  const errorKey = errorCode ? (errorKeys[errorCode] ?? 'com_ui_admin_users_create_error') : null;

  return (
    <OGDialog open={open} onOpenChange={handleOpenChange}>
      <OGDialogTemplate
        title={localize('com_ui_admin_users_add')}
        description={localize('com_ui_admin_users_add_description')}
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
                autoComplete="off"
                maxLength={80}
                required
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
                autoComplete="off"
                maxLength={120}
                required
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor={`${formId}-username`}>
                {localize('com_ui_admin_users_field_username')}{' '}
                <span className="text-text-secondary font-normal">
                  {localize('com_ui_optional')}
                </span>
              </Label>
              <Input
                id={`${formId}-username`}
                value={username}
                onChange={(event) => setUsername(event.target.value)}
                autoComplete="off"
                maxLength={80}
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor={`${formId}-password`}>
                {localize('com_ui_admin_users_field_password')}
              </Label>
              <Input
                id={`${formId}-password`}
                type="password"
                value={password}
                onChange={(event) => setPassword(event.target.value)}
                autoComplete="new-password"
                maxLength={128}
                required
              />
            </div>
            <div className="space-y-2">
              <Label id={`${formId}-role`}>{localize('com_ui_admin_users_field_role')}</Label>
              <Dropdown
                variant="field"
                value={role}
                options={roleNames}
                onChange={setRole}
                portal={false}
                aria-labelledby={`${formId}-role`}
              />
            </div>
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
            disabled={!canSubmit}
            aria-label={localize('com_ui_admin_users_add')}
          >
            {createUser.isLoading ? (
              <Spinner className="size-4" />
            ) : (
              localize('com_ui_admin_users_add')
            )}
          </Button>
        }
      />
    </OGDialog>
  );
}
