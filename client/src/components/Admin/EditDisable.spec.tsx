import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import DisableUserDialog from './DisableUserDialog';
import EditUserDialog from './EditUserDialog';

const mockShowToast = jest.fn();
const mockUpdate = jest.fn();
jest.mock('librechat-data-provider', () => ({
  ...jest.requireActual('librechat-data-provider'),
  dataService: { updateAdminUser: (...args: unknown[]) => mockUpdate(...args) },
}));
jest.mock('@librechat/client', () => ({
  ...jest.requireActual('@librechat/client'),
  useToastContext: () => ({ showToast: mockShowToast }),
}));

const user = {
  id: 'u1',
  name: 'Bob Teacher',
  username: 'bob',
  email: 'bob@x.org',
  avatar: '',
  role: 'USER',
  provider: 'local',
};

const wrap = (node: React.ReactNode) =>
  render(
    <QueryClientProvider
      client={new QueryClient({ defaultOptions: { queries: { retry: false } } })}
    >
      {node}
    </QueryClientProvider>,
  );

beforeEach(() => {
  jest.resetAllMocks();
  global.ResizeObserver = class MockedResizeObserver {
    observe = jest.fn();
    unobserve = jest.fn();
    disconnect = jest.fn();
  };
});

describe('EditUserDialog', () => {
  it('stays disabled until something changes and then sends only the changed fields', async () => {
    mockUpdate.mockResolvedValue({ user });
    const onOpenChange = jest.fn();
    wrap(<EditUserDialog user={user} onOpenChange={onOpenChange} />);
    const save = screen.getByRole('button', { name: /save changes/i });
    expect(save).toBeDisabled();
    fireEvent.change(screen.getByLabelText(/full name/i), { target: { value: 'Robert Teacher' } });
    expect(save).toBeEnabled();
    fireEvent.click(save);
    await waitFor(() => expect(mockUpdate).toHaveBeenCalledWith('u1', { name: 'Robert Teacher' }));
    await waitFor(() => expect(onOpenChange).toHaveBeenCalledWith(false));
  });

  it('hides the password and locks the email for an account that signs in elsewhere', () => {
    wrap(<EditUserDialog user={{ ...user, provider: 'google' }} onOpenChange={jest.fn()} />);
    expect(screen.queryByLabelText(/new password/i)).not.toBeInTheDocument();
    expect(screen.getByLabelText(/^email/i)).toBeDisabled();
  });

  it('shows a specific message when the email is taken', async () => {
    mockUpdate.mockRejectedValue({ response: { status: 409, data: { code: 'email_taken' } } });
    wrap(<EditUserDialog user={user} onOpenChange={jest.fn()} />);
    fireEvent.change(screen.getByLabelText(/^email/i), { target: { value: 'dup@x.org' } });
    fireEvent.click(screen.getByRole('button', { name: /save changes/i }));
    expect(await screen.findByRole('alert')).toHaveTextContent(/already exists/i);
  });
});

describe('DisableUserDialog', () => {
  it('disables the account only after confirmation', async () => {
    mockUpdate.mockResolvedValue({ user: { ...user, disabled: true } });
    const onOpenChange = jest.fn();
    wrap(<DisableUserDialog user={user} onOpenChange={onOpenChange} />);
    expect(mockUpdate).not.toHaveBeenCalled();
    fireEvent.click(screen.getByRole('button', { name: /disable account/i }));
    await waitFor(() => expect(mockUpdate).toHaveBeenCalledWith('u1', { disabled: true }));
    await waitFor(() => expect(onOpenChange).toHaveBeenCalledWith(false));
  });
});
