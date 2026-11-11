import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import AddUserDialog from './AddUserDialog';

const mockShowToast = jest.fn();
const mockCreate = jest.fn();
jest.mock('librechat-data-provider', () => ({
  ...jest.requireActual('librechat-data-provider'),
  dataService: { createAdminUser: (...args: unknown[]) => mockCreate(...args) },
}));
jest.mock('~/data-provider/roles', () => ({
  useListRoles: () => ({ data: { roles: [{ name: 'USER' }, { name: 'ADMIN' }] } }),
}));
jest.mock('@librechat/client', () => ({
  ...jest.requireActual('@librechat/client'),
  useToastContext: () => ({ showToast: mockShowToast }),
}));

const renderDialog = (onOpenChange = jest.fn()) => {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  render(
    <QueryClientProvider client={client}>
      <AddUserDialog open onOpenChange={onOpenChange} />
    </QueryClientProvider>,
  );
  return onOpenChange;
};

const fill = () => {
  fireEvent.change(screen.getByLabelText(/full name/i), { target: { value: 'New Teacher' } });
  fireEvent.change(screen.getByLabelText(/^email/i), { target: { value: 'new@x.org' } });
  fireEvent.change(screen.getByLabelText(/temporary password/i), {
    target: { value: 'correct-horse-9' },
  });
};

describe('AddUserDialog', () => {
  beforeEach(() => {
    jest.resetAllMocks();
    global.ResizeObserver = class MockedResizeObserver {
      observe = jest.fn();
      unobserve = jest.fn();
      disconnect = jest.fn();
    };
  });

  it('keeps the button disabled until name, email and password are filled', () => {
    renderDialog();
    expect(screen.getByRole('button', { name: /add user/i })).toBeDisabled();
    fill();
    expect(screen.getByRole('button', { name: /add user/i })).toBeEnabled();
  });

  it('creates the user, confirms, and closes', async () => {
    mockCreate.mockResolvedValue({ user: { id: 'u1' } });
    const onOpenChange = renderDialog();
    fill();
    fireEvent.click(screen.getByRole('button', { name: /add user/i }));
    await waitFor(() =>
      expect(mockCreate).toHaveBeenCalledWith(expect.objectContaining({ email: 'new@x.org' })),
    );
    await waitFor(() => expect(onOpenChange).toHaveBeenCalledWith(false));
    expect(mockShowToast).toHaveBeenCalled();
  });

  it('shows a specific message when the email is taken', async () => {
    mockCreate.mockRejectedValue({ response: { status: 409, data: { code: 'email_in_use' } } });
    renderDialog();
    fill();
    fireEvent.click(screen.getByRole('button', { name: /add user/i }));
    expect(await screen.findByRole('alert')).toHaveTextContent(/already exists/i);
  });
});
