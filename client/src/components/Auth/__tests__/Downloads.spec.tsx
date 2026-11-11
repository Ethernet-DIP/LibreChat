import { render, screen } from '@testing-library/react';
import type { TStartupConfig } from 'librechat-data-provider';
import Downloads from '../Downloads';

const config = (appDownloads?: Record<string, string>) =>
  ({ interface: { appDownloads } }) as unknown as TStartupConfig;

describe('Downloads', () => {
  it('renders nothing when no link is configured', () => {
    const { container } = render(<Downloads startupConfig={config()} />);
    expect(container).toBeEmptyDOMElement();
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
    expect(screen.queryByRole('link', { name: /android/i })).toBeNull();
  });

  it('drops unsafe links', () => {
    render(<Downloads startupConfig={config({ android: 'javascript:alert(1)' })} />);
    expect(screen.queryByRole('link')).toBeNull();
  });
});
