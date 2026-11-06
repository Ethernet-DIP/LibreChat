import { render, screen } from '@testing-library/react';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import ProjectsRoute from '../Projects';

let mockUser: { role: string } | undefined;
let mockConfig: { projects?: { adminOnly?: boolean } } | undefined;

jest.mock('~/hooks/AuthContext', () => ({ useAuthContext: () => ({ user: mockUser }) }));
jest.mock('~/data-provider', () => ({ useGetStartupConfig: () => ({ data: mockConfig }) }));

const renderRoute = () =>
  render(
    <MemoryRouter initialEntries={['/projects']}>
      <Routes>
        <Route element={<ProjectsRoute />}>
          <Route path="projects" element={<div data-testid="projects-page" />} />
        </Route>
        <Route path="c/new" element={<div data-testid="new-chat" />} />
      </Routes>
    </MemoryRouter>,
  );

describe('ProjectsRoute', () => {
  beforeEach(() => {
    mockConfig = { projects: { adminOnly: true } };
  });

  it('sends a standard user to a new chat', () => {
    mockUser = { role: 'USER' };
    renderRoute();
    expect(screen.getByTestId('new-chat')).toBeInTheDocument();
    expect(screen.queryByTestId('projects-page')).not.toBeInTheDocument();
  });

  it('opens the page for an admin', () => {
    mockUser = { role: 'ADMIN' };
    renderRoute();
    expect(screen.getByTestId('projects-page')).toBeInTheDocument();
  });

  it('does not redirect while the user is still loading', () => {
    mockUser = undefined;
    renderRoute();
    expect(screen.queryByTestId('new-chat')).not.toBeInTheDocument();
    expect(screen.queryByTestId('projects-page')).not.toBeInTheDocument();
  });
});
