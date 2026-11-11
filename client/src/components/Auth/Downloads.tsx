import { disabledFillClasses } from '@librechat/client';
import { Apple, Monitor, Smartphone } from 'lucide-react';
import type { TStartupConfig } from 'librechat-data-provider';
import { publishedPolicyUrl } from '~/utils/policies';
import { useLocalize } from '~/hooks';

const platforms = [
  { key: 'desktop', Icon: Monitor, label: 'com_auth_download_desktop' },
  { key: 'android', Icon: Smartphone, label: 'com_auth_download_android' },
  { key: 'ios', Icon: Apple, label: 'com_auth_download_ios' },
] as const;

const itemClass =
  'border-border-medium text-text-primary inline-flex items-center gap-2 rounded-xl border px-3 py-2 text-sm font-medium transition-colors motion-reduce:transition-none';

/** Native-app download buttons for the sign-in page; a platform without a URL is shown disabled. */
function Downloads({ startupConfig }: { startupConfig: TStartupConfig | null | undefined }) {
  const localize = useLocalize();
  const links = platforms.map((p) => ({
    ...p,
    url: publishedPolicyUrl(startupConfig?.interface?.appDownloads?.[p.key]),
  }));
  return (
    <nav
      aria-label={localize('com_auth_download_apps')}
      className="animate-auth-rise mt-6 flex flex-wrap justify-center gap-2 motion-reduce:animate-none"
      style={{ '--stagger': '500ms' } as React.CSSProperties}
    >
      {links.map(({ key, Icon, label, url }) =>
        url != null ? (
          <a
            key={key}
            href={url}
            rel="noreferrer"
            className={`${itemClass} hover:bg-surface-hover focus-visible:ring-surface-brand/40 focus-visible:ring-4 focus-visible:outline-none`}
          >
            <Icon className="size-4" aria-hidden="true" />
            {localize(label)}
          </a>
        ) : (
          <button
            key={key}
            type="button"
            disabled
            className={`${itemClass} ${disabledFillClasses} cursor-not-allowed disabled:opacity-50`}
          >
            <Icon className="size-4" aria-hidden="true" />
            {localize(label)}
          </button>
        ),
      )}
    </nav>
  );
}

export default Downloads;
