import userEvent from '@testing-library/user-event';
import { render, screen, waitFor } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import AddUser from '../AddUser';

const mockShowToast = jest.fn();
const mockCreateUser = jest.fn();

jest.mock('@librechat/client', () => ({
  ...jest.requireActual('@librechat/client'),
  useToastContext: () => ({ showToast: mockShowToast }),
}));

jest.mock('~/hooks', () => ({
  useLocalize: () => (key: string, values?: Record<string, string>) =>
    values ? `${key}:${values[0]}` : key,
}));

jest.mock('~/data-provider', () => {
  const { useMutation } = jest.requireActual('@tanstack/react-query');
  return {
    useGetStartupConfig: () => ({ data: { minPasswordLength: 8 } }),
    useCreateAdminUserMutation: () =>
      useMutation({ mutationFn: (payload: unknown) => mockCreateUser(payload) }),
  };
});

function renderOpen() {
  render(
    <QueryClientProvider client={new QueryClient()}>
      <AddUser />
    </QueryClientProvider>,
  );
  return userEvent.click(screen.getByTestId('add-user-button'));
}

async function fillAndSubmit() {
  await userEvent.type(screen.getByLabelText('com_auth_full_name'), 'New Teacher');
  await userEvent.type(screen.getByLabelText('com_auth_email'), 'teacher@example.com');
  await userEvent.type(screen.getByLabelText('com_auth_password'), 'correct-horse');
  await userEvent.click(screen.getByRole('button', { name: 'com_ui_add_user' }));
}

describe('AddUser', () => {
  afterEach(() => {
    mockCreateUser.mockReset();
    mockShowToast.mockClear();
  });

  it('validates required fields before calling the server', async () => {
    await renderOpen();

    await userEvent.click(screen.getByRole('button', { name: 'com_ui_add_user' }));

    expect(await screen.findByText('com_auth_name_required')).toBeInTheDocument();
    expect(screen.getByText('com_auth_email_required')).toBeInTheDocument();
    expect(screen.getByText('com_auth_password_required')).toBeInTheDocument();
    expect(mockCreateUser).not.toHaveBeenCalled();
  });

  it('creates the user, confirms, and closes the dialog', async () => {
    mockCreateUser.mockResolvedValue({
      user: { id: '1', email: 'teacher@example.com', role: 'USER' },
    });
    await renderOpen();

    await fillAndSubmit();

    await waitFor(() =>
      expect(mockShowToast).toHaveBeenCalledWith({
        message: 'com_ui_add_user_success:teacher@example.com',
        status: 'success',
      }),
    );
    expect(mockCreateUser.mock.calls[0][0]).toMatchObject({
      name: 'New Teacher',
      email: 'teacher@example.com',
      password: 'correct-horse',
    });
    await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument());
  });

  it.each([
    ['email_in_use', 'com_ui_add_user_error_email_in_use'],
    ['email_domain_not_allowed', 'com_ui_add_user_error_domain'],
    ['invalid_input', 'com_ui_add_user_error_invalid'],
    ['unknown_code', 'com_ui_add_user_error_generic'],
  ])('keeps the dialog open and localizes %s', async (code, key) => {
    mockCreateUser.mockRejectedValue({ response: { data: { code, error: 'raw server text' } } });
    await renderOpen();

    await fillAndSubmit();

    expect(await screen.findByText(key)).toBeInTheDocument();
    expect(screen.getByRole('dialog')).toBeInTheDocument();
    expect(screen.queryByText('raw server text')).not.toBeInTheDocument();
  });
});
