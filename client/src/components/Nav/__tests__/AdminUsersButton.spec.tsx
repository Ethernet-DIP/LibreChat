import { MemoryRouter } from 'react-router-dom';
import { render, screen } from '@testing-library/react';
import AdminUsersButton from '../AdminUsersButton';

let mockUser: { role: string } | undefined;

jest.mock('~/hooks', () => ({
  useLocalize: () => (key: string) => key,
  useAdminAccess: () => mockUser?.role === 'ADMIN',
}));

const renderButton = () =>
  render(
    <MemoryRouter>
      <AdminUsersButton layout="row" />
    </MemoryRouter>,
  );

describe('AdminUsersButton', () => {
  it('links admins to the users page', () => {
    mockUser = { role: 'ADMIN' };
    renderButton();
    expect(screen.getByTestId('nav-admin-users-button')).toHaveAttribute('href', '/admin/users');
  });

  it('is not offered to standard users', () => {
    mockUser = { role: 'USER' };
    renderButton();
    expect(screen.queryByTestId('nav-admin-users-button')).not.toBeInTheDocument();
  });

  it('is not offered before the user has loaded', () => {
    mockUser = undefined;
    renderButton();
    expect(screen.queryByTestId('nav-admin-users-button')).not.toBeInTheDocument();
  });
});
