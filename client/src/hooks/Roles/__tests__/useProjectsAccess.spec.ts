import { renderHook } from '@testing-library/react';
import useProjectsAccess from '../useProjectsAccess';

let mockUser: { role: string } | undefined;
let mockConfig: { projects?: { adminOnly?: boolean } } | undefined;

jest.mock('~/hooks/AuthContext', () => ({ useAuthContext: () => ({ user: mockUser }) }));
jest.mock('~/data-provider', () => ({ useGetStartupConfig: () => ({ data: mockConfig }) }));

const canUseProjects = () => renderHook(() => useProjectsAccess()).result.current;

describe('useProjectsAccess', () => {
  it('offers projects to every user by default', () => {
    mockUser = { role: 'USER' };
    mockConfig = {};
    expect(canUseProjects()).toBe(true);
  });

  it('offers projects to admins only with adminOnly', () => {
    mockConfig = { projects: { adminOnly: true } };
    mockUser = { role: 'USER' };
    expect(canUseProjects()).toBe(false);
    mockUser = { role: 'ADMIN' };
    expect(canUseProjects()).toBe(true);
  });

  it('offers nothing until the config and user have loaded', () => {
    mockUser = undefined;
    mockConfig = {};
    expect(canUseProjects()).toBe(false);
    mockUser = { role: 'ADMIN' };
    mockConfig = undefined;
    expect(canUseProjects()).toBe(false);
  });
});
