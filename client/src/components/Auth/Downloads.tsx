import { Apple, Monitor, Smartphone } from 'lucide-react';
import type { TStartupConfig } from 'librechat-data-provider';
import { publishedPolicyUrl } from '~/utils/policies';
import { useLocalize } from '~/hooks';

const platforms = [
  { key: 'desktop', Icon: Monitor, label: 'com_auth_download_desktop' },
  { key: 'android', Icon: Smartphone, label: 'com_auth_download_android' },
  { key: 'ios', Icon: Apple, label: 'com_auth_download_ios' },
] as const;

/** Native-app download links for the sign-in page; a platform without a URL has no button. */
function Downloads({ startupConfig }: { startupConfig: TStartupConfig | null | undefined }) {
  const localize = useLocalize();
  const links = platforms
    .map((p) => ({
      ...p,
      url: publishedPolicyUrl(startupConfig?.interface?.appDownloads?.[p.key]),
    }))
    .filter((p) => p.url != null);
  if (links.length === 0) {
    return null;
  }
  return (
    <nav
      aria-label={localize('com_auth_download_apps')}
      className="animate-auth-rise mt-6 flex flex-wrap justify-center gap-2 motion-reduce:animate-none"
      style={{ '--stagger': '500ms' } as React.CSSProperties}
    >
      {links.map(({ key, Icon, label, url }) => (
        <a
          key={key}
          href={url as string}
          rel="noreferrer"
          className="border-border-medium text-text-primary hover:bg-surface-hover focus-visible:ring-surface-brand/40 inline-flex items-center gap-2 rounded-xl border px-3 py-2 text-sm font-medium transition-colors focus-visible:ring-4 focus-visible:outline-none motion-reduce:transition-none"
        >
          <Icon className="size-4" aria-hidden="true" />
          {localize(label)}
        </a>
      ))}
    </nav>
  );
}

export default Downloads;
