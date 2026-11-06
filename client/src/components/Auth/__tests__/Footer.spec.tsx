import { render, screen } from '@testing-library/react';
import type { TStartupConfig } from 'librechat-data-provider';
import Footer from '../Footer';

jest.mock('~/hooks', () => ({ useLocalize: () => (key: string) => key }));

const policies = {
  privacyPolicy: { externalUrl: 'https://example.com/privacy' },
  termsOfService: { externalUrl: 'https://example.com/terms' },
};

const renderFooter = (authFooterLink?: { label: string; url: string }) =>
  render(
    <Footer
      startupConfig={{ interface: { ...policies, authFooterLink } } as unknown as TStartupConfig}
    />,
  );

describe('Auth Footer', () => {
  it('shows the policy links by default', () => {
    renderFooter();
    expect(screen.getByRole('link', { name: 'com_ui_privacy_policy' })).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'com_ui_terms_of_service' })).toBeInTheDocument();
  });

  it('replaces the policy links with a configured link', () => {
    renderFooter({ label: 'www.moe.gov.et', url: 'https://moe.gov.et/' });
    expect(screen.getByRole('link', { name: 'www.moe.gov.et' })).toHaveAttribute(
      'href',
      'https://moe.gov.et/',
    );
    expect(screen.queryByRole('link', { name: 'com_ui_privacy_policy' })).not.toBeInTheDocument();
    expect(screen.queryByRole('link', { name: 'com_ui_terms_of_service' })).not.toBeInTheDocument();
  });

  it('never renders an unsafe configured link', () => {
    renderFooter({ label: 'bad', url: 'javascript:alert(1)' });
    expect(screen.queryByRole('link', { name: 'bad' })).not.toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'com_ui_privacy_policy' })).toBeInTheDocument();
  });
});
