import { render, screen } from '@testing-library/react';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import AdminRoute from '../AdminRoute';

let mockUser: { role: string } | undefined;

jest.mock('~/hooks/AuthContext', () => ({ useAuthContext: () => ({ user: mockUser }) }));

const renderRoute = () =>
  render(
    <MemoryRouter initialEntries={['/admin/users']}>
      <Routes>
        <Route element={<AdminRoute />}>
          <Route path="admin/users" element={<div data-testid="admin-page" />} />
        </Route>
        <Route path="c/new" element={<div data-testid="new-chat" />} />
      </Routes>
    </MemoryRouter>,
  );

describe('AdminRoute', () => {
  it('sends a standard user to a new chat', () => {
    mockUser = { role: 'USER' };
    renderRoute();
    expect(screen.getByTestId('new-chat')).toBeInTheDocument();
    expect(screen.queryByTestId('admin-page')).not.toBeInTheDocument();
  });

  it('opens the page for an admin', () => {
    mockUser = { role: 'ADMIN' };
    renderRoute();
    expect(screen.getByTestId('admin-page')).toBeInTheDocument();
  });

  it('does not redirect while the user is still loading', () => {
    mockUser = undefined;
    renderRoute();
    expect(screen.queryByTestId('new-chat')).not.toBeInTheDocument();
    expect(screen.queryByTestId('admin-page')).not.toBeInTheDocument();
  });
});
