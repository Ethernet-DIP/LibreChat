import { useId } from 'react';
import { BookOpen } from 'lucide-react';
import { Button, Spinner } from '@librechat/client';
import type { ExtendedFile } from '~/common';
import { useLocalize } from '~/hooks';

interface Props {
  files: Array<[string, ExtendedFile]>;
  loading: boolean;
  failed: boolean;
  canSearch: boolean;
  onRetry: () => void;
  onManage?: () => void;
}

export default function Knowledge({ files, loading, failed, canSearch, onRetry, onManage }: Props) {
  const localize = useLocalize();
  const id = useId();
  const readyStatus = canSearch ? 'com_ui_textbooks_indexed' : 'com_ui_textbooks_search_disabled';

  return (
    <section className="mb-3 space-y-2" aria-labelledby={id} aria-busy={loading}>
      <div className="flex items-center justify-between gap-2">
        <h3 id={id} className="text-text-secondary text-2xs font-medium tracking-wide uppercase">
          {localize('com_ui_textbooks')}
        </h3>
        {onManage && (
          <Button type="button" variant="quiet" size="sm" onClick={onManage}>
            {localize('com_ui_textbooks_manage')}
          </Button>
        )}
      </div>
      <p className="text-text-secondary text-xs leading-relaxed">
        {localize('com_ui_textbooks_agent_description')}
      </p>
      {loading && (
        <p className="text-text-secondary flex items-center gap-2 text-xs" role="status">
          <Spinner className="size-4" />
          {localize('com_ui_textbooks_agent_loading')}
        </p>
      )}
      {failed && (
        <div className="space-y-2" role="alert">
          <p className="text-text-secondary text-xs">
            {localize('com_ui_textbooks_agent_load_error')}
          </p>
          <Button type="button" variant="outline" size="sm" onClick={onRetry}>
            {localize('com_ui_retry')}
          </Button>
        </div>
      )}
      {files.length > 0 ? (
        <>
          <p className="text-text-secondary text-xs" role="status" aria-live="polite">
            {localize('com_ui_textbooks_agent_count', { count: files.length })}
          </p>
          <ul className="space-y-1.5" aria-label={localize('com_ui_textbooks_available')}>
            {files.map(([fileId, file]) => (
              <li
                key={fileId}
                className="border-border-light flex items-start gap-2 rounded-lg border px-3 py-2"
              >
                <BookOpen
                  className="text-text-secondary mt-0.5 size-4 shrink-0"
                  aria-hidden="true"
                />
                <div className="min-w-0 flex-1 space-y-1">
                  <p className="text-text-primary text-sm break-words">
                    {file.filename ||
                      file.file?.name ||
                      localize('com_ui_textbooks_name_unavailable')}
                  </p>
                  <p className="text-text-secondary text-xs">
                    {localize(file.progress < 1 ? 'com_ui_textbooks_embedding' : readyStatus)}
                  </p>
                </div>
              </li>
            ))}
          </ul>
        </>
      ) : (
        !loading &&
        !failed && (
          <p className="text-text-secondary text-xs">{localize('com_ui_textbooks_empty')}</p>
        )
      )}
    </section>
  );
}
