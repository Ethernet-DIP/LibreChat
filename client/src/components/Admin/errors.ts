import type { TranslationKeys } from '~/hooks';

/** Maps the stable codes the admin user endpoints return to localized copy. */
export const adminUserErrorKeys: Record<string, TranslationKeys> = {
  invalid_details: 'com_ui_admin_users_err_invalid_details',
  email_taken: 'com_ui_admin_users_err_email_taken',
  domain_not_allowed: 'com_ui_admin_users_err_domain',
  invalid_role: 'com_ui_admin_users_err_role',
  email_locked: 'com_ui_admin_users_err_email_locked',
  password_unsupported: 'com_ui_admin_users_err_password_unsupported',
  cannot_disable_self: 'com_ui_admin_users_err_disable_self',
  last_admin: 'com_ui_admin_users_last_admin',
  nothing_to_update: 'com_ui_admin_users_err_nothing',
};
