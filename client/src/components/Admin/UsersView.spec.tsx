import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import UsersView from './UsersView';

jest.mock('~/hooks/AuthContext', () => ({ useAuthContext: () => ({ user: { id: 'u-admin' } }) }));
jest.mock('~/data-provider/roles', () => ({
  useListRoles: () => ({ data: { roles: [{ name: 'USER' }, { name: 'ADMIN' }, { name: 'TA' }] } }),
}));

const mockShowToast = jest.fn();
const mockList = jest.fn();
const mockAdd = jest.fn();
const mockRemove = jest.fn();
jest.mock('librechat-data-provider', () => ({
  ...jest.requireActual('librechat-data-provider'),
  dataService: {
    listAdminUsers: (...args: unknown[]) => mockList(...args),
    addAdminRoleMember: (...args: unknown[]) => mockAdd(...args),
    removeAdminRoleMember: (...args: unknown[]) => mockRemove(...args),
  },
}));
jest.mock('@librechat/client', () => ({
  ...jest.requireActual('@librechat/client'),
  useToastContext: () => ({ showToast: mockShowToast }),
}));

const users = [
  { id: 'u-admin', name: 'Ada Admin', username: 'ada', email: 'ada@x.org', role: 'ADMIN' },
  { id: 'u-bob', name: 'Bob Teacher', username: 'bob', email: 'bob@x.org', role: 'USER' },
];

const renderView = () => {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <QueryClientProvider client={client}>
      <UsersView />
    </QueryClientProvider>,
  );
};

describe('UsersView', () => {
  beforeEach(() => {
    global.ResizeObserver = class MockedResizeObserver {
      observe = jest.fn();
      unobserve = jest.fn();
      disconnect = jest.fn();
    };
    jest.resetAllMocks();
    mockShowToast.mockClear();
  });

  it('lists users and filters them by name', async () => {
    mockList.mockResolvedValue({ users, total: 2, limit: 25, offset: 0 });
    renderView();
    expect(await screen.findByText('Bob Teacher')).toBeInTheDocument();
    fireEvent.change(screen.getByLabelText(/filter users/i), { target: { value: 'ada' } });
    expect(screen.queryByText('Bob Teacher')).not.toBeInTheDocument();
    expect(screen.getByText('Ada Admin')).toBeInTheDocument();
  });

  it('marks a disabled account and offers to enable it', async () => {
    mockList.mockResolvedValue({
      users: [users[0], { ...users[1], disabled: true }],
      total: 2,
      limit: 25,
      offset: 0,
    });
    renderView();
    await screen.findByText('Bob Teacher');
    expect(screen.getByText('Disabled')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /enable bob teacher/i })).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /^disable bob teacher/i })).not.toBeInTheDocument();
  });

  it('does not let an admin disable their own account', async () => {
    mockList.mockResolvedValue({ users, total: 2, limit: 25, offset: 0 });
    renderView();
    await screen.findByText('Bob Teacher');
    expect(screen.getByRole('button', { name: /disable ada admin/i })).toBeDisabled();
    expect(screen.getByRole('button', { name: /disable bob teacher/i })).toBeEnabled();
  });

  it('does not let an admin change their own role', async () => {
    mockList.mockResolvedValue({ users, total: 2, limit: 25, offset: 0 });
    renderView();
    await screen.findByText('Bob Teacher');
    expect(screen.getByRole('combobox', { name: /role for ada admin/i })).toBeDisabled();
    expect(screen.getByRole('combobox', { name: /role for bob teacher/i })).toBeEnabled();
  });

  it('shows an error with a retry when loading fails', async () => {
    mockList.mockRejectedValue(new Error('boom'));
    renderView();
    expect(await screen.findByRole('alert')).toHaveTextContent(/couldn't load the users/i);
    expect(screen.getByRole('button', { name: /retry/i })).toBeInTheDocument();
  });

  it('adds the user to a custom role through the role members API', async () => {
    mockList.mockResolvedValue({ users, total: 2, limit: 25, offset: 0 });
    mockAdd.mockResolvedValue({ success: true });
    renderView();
    await screen.findByText('Bob Teacher');
    fireEvent.click(screen.getByRole('combobox', { name: /role for bob teacher/i }));
    fireEvent.click(await screen.findByRole('option', { name: 'TA' }));
    await waitFor(() => expect(mockAdd).toHaveBeenCalledWith('TA', 'u-bob'));
  });
});
