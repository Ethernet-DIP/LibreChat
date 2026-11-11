import { render, screen } from '@testing-library/react';
import type { TStartupConfig } from 'librechat-data-provider';
import Downloads from '../Downloads';

const config = (appDownloads?: Record<string, string>) =>
  ({ interface: { appDownloads } }) as unknown as TStartupConfig;

describe('Downloads', () => {
  it('shows every platform disabled when no link is configured', () => {
    render(<Downloads startupConfig={config()} />);
    expect(screen.queryByRole('link')).toBeNull();
    for (const name of [/desktop/i, /android/i, /ios/i]) {
      expect(screen.getByRole('button', { name })).toBeDisabled();
    }
  });

  it('renders a button only for each configured platform', () => {
    render(
      <Downloads
        startupConfig={config({ desktop: 'https://x.org/app.dmg', ios: 'https://x.org/ios' })}
      />,
    );
    expect(screen.getByRole('link', { name: /desktop/i })).toHaveAttribute(
      'href',
      'https://x.org/app.dmg',
    );
    expect(screen.getByRole('link', { name: /ios/i })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /android/i })).toBeDisabled();
  });

  it('drops unsafe links', () => {
    render(<Downloads startupConfig={config({ android: 'javascript:alert(1)' })} />);
    expect(screen.queryByRole('link')).toBeNull();
    expect(screen.getByRole('button', { name: /android/i })).toBeDisabled();
  });
});
