import { useState } from 'react';
import { useForm } from 'react-hook-form';
import {
  Label,
  Input,
  Button,
  Spinner,
  OGDialog,
  SecretInput,
  OGDialogTitle,
  OGDialogHeader,
  OGDialogFooter,
  OGDialogContent,
  OGDialogDescription,
  useToastContext,
} from '@librechat/client';
import type { TAdminCreateUserErrorCode, TAdminCreateUserRequest } from 'librechat-data-provider';
import type { FieldError } from 'react-hook-form';
import type { TranslationKeys } from '~/hooks';
import { useCreateAdminUserMutation, useGetStartupConfig } from '~/data-provider';
import { useLocalize } from '~/hooks';

const errorKeys: Record<TAdminCreateUserErrorCode, TranslationKeys> = {
  invalid_input: 'com_ui_add_user_error_invalid',
  email_in_use: 'com_ui_add_user_error_email_in_use',
  email_domain_not_allowed: 'com_ui_add_user_error_domain',
  create_failed: 'com_ui_add_user_error_generic',
};

function getErrorKey(error: unknown): TranslationKeys {
  const code = (error as { response?: { data?: { code?: TAdminCreateUserErrorCode } } }).response
    ?.data?.code;
  return (code && errorKeys[code]) || errorKeys.create_failed;
}

function FieldMessage({ id, error }: { id: string; error?: FieldError }) {
  if (!error?.message) {
    return null;
  }
  return (
    <span id={id} role="alert" className="text-text-destructive text-sm">
      {error.message}
    </span>
  );
}

export default function AddUser() {
  const localize = useLocalize();
  const { showToast } = useToastContext();
  const { data: startupConfig } = useGetStartupConfig();
  const [open, setOpen] = useState(false);
  const createUser = useCreateAdminUserMutation();
  const {
    reset,
    register,
    handleSubmit,
    formState: { errors },
  } = useForm<TAdminCreateUserRequest>({ mode: 'onSubmit' });

  const handleOpenChange = (next: boolean) => {
    setOpen(next);
    if (!next) {
      reset();
      createUser.reset();
    }
  };

  const onSubmit = (data: TAdminCreateUserRequest) => {
    createUser.mutate(data, {
      onSuccess: ({ user }) => {
        showToast({
          message: localize('com_ui_add_user_success', { 0: user.email }),
          status: 'success',
        });
        handleOpenChange(false);
      },
    });
  };

  return (
    <div className="flex items-center justify-between">
      <Label id="add-user-label">{localize('com_ui_add_user')}</Label>
      <Button
        variant="outline"
        onClick={() => setOpen(true)}
        aria-labelledby="add-user-label"
        data-testid="add-user-button"
      >
        {localize('com_ui_add_user')}
      </Button>
      <OGDialog open={open} onOpenChange={handleOpenChange}>
        <OGDialogContent className="max-w-md">
          <OGDialogHeader>
            <OGDialogTitle>{localize('com_ui_add_user')}</OGDialogTitle>
            <OGDialogDescription>{localize('com_ui_add_user_description')}</OGDialogDescription>
          </OGDialogHeader>
          <form
            noValidate
            className="flex flex-col gap-4"
            aria-label={localize('com_ui_add_user')}
            onSubmit={handleSubmit(onSubmit)}
          >
            <div className="flex flex-col gap-1">
              <Label htmlFor="add-user-name">{localize('com_auth_full_name')}</Label>
              <Input
                id="add-user-name"
                autoComplete="off"
                aria-invalid={!!errors.name}
                aria-describedby={errors.name ? 'add-user-name-error' : undefined}
                {...register('name', {
                  required: localize('com_auth_name_required'),
                  minLength: { value: 3, message: localize('com_auth_name_min_length') },
                  maxLength: { value: 80, message: localize('com_auth_name_max_length') },
                })}
              />
              <FieldMessage id="add-user-name-error" error={errors.name} />
            </div>
            <div className="flex flex-col gap-1">
              <Label htmlFor="add-user-email">{localize('com_auth_email')}</Label>
              <Input
                id="add-user-email"
                type="email"
                autoComplete="off"
                aria-invalid={!!errors.email}
                aria-describedby={errors.email ? 'add-user-email-error' : undefined}
                {...register('email', {
                  required: localize('com_auth_email_required'),
                  maxLength: { value: 120, message: localize('com_auth_email_max_length') },
                  pattern: { value: /\S+@\S+\.\S+/, message: localize('com_auth_email_pattern') },
                })}
              />
              <FieldMessage id="add-user-email-error" error={errors.email} />
            </div>
            <div className="flex flex-col gap-1">
              <Label htmlFor="add-user-username">{localize('com_auth_username')}</Label>
              <Input
                id="add-user-username"
                autoComplete="off"
                aria-invalid={!!errors.username}
                aria-describedby={errors.username ? 'add-user-username-error' : undefined}
                {...register('username', {
                  minLength: { value: 2, message: localize('com_auth_username_min_length') },
                  maxLength: { value: 80, message: localize('com_auth_username_max_length') },
                })}
              />
              <FieldMessage id="add-user-username-error" error={errors.username} />
            </div>
            <div className="flex flex-col gap-1">
              <Label htmlFor="add-user-password">{localize('com_auth_password')}</Label>
              <SecretInput
                id="add-user-password"
                autoComplete="new-password"
                aria-invalid={!!errors.password}
                aria-describedby={errors.password ? 'add-user-password-error' : undefined}
                {...register('password', {
                  required: localize('com_auth_password_required'),
                  minLength: {
                    value: startupConfig?.minPasswordLength || 8,
                    message: localize('com_auth_password_min_length'),
                  },
                  maxLength: { value: 128, message: localize('com_auth_password_max_length') },
                })}
              />
              <FieldMessage id="add-user-password-error" error={errors.password} />
            </div>
            {createUser.isError && (
              <p role="alert" className="text-text-destructive text-sm">
                {localize(getErrorKey(createUser.error))}
              </p>
            )}
            <OGDialogFooter>
              <Button type="button" variant="outline" onClick={() => handleOpenChange(false)}>
                {localize('com_ui_cancel')}
              </Button>
              <Button type="submit" variant="submit" disabled={createUser.isLoading}>
                {createUser.isLoading ? <Spinner /> : localize('com_ui_add_user')}
              </Button>
            </OGDialogFooter>
          </form>
        </OGDialogContent>
      </OGDialog>
    </div>
  );
}
