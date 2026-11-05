import { useId } from 'react';
import { BookOpen, Send, X } from 'lucide-react';
import { Button, CheckboxGlyph, Input, Label, Spinner } from '@librechat/client';
import type { LessonDetails } from './state';
import type { Textbook } from './model';
import PanelHeader from '~/components/ui/PanelHeader';
import { isIndexed, canUseTextbook } from './model';
import { formatFileSize } from '~/utils/files';
import useLocalize from '~/hooks/useLocalize';

export type TextbookPanelProps = {
  files: Textbook[];
  selectedIds: ReadonlySet<string>;
  loading: boolean;
  failed: boolean;
  uploading: boolean;
  canAttach: boolean;
  canSearch?: boolean;
  knowledgeLoading?: boolean;
  knowledgeFailed?: boolean;
  busy: boolean;
  selectionDisabled?: boolean;
  error: 'send' | null;
  search: string;
  details: LessonDetails;
  onSearch: (value: string) => void;
  onDetails: (value: LessonDetails) => void;
  onRetry: () => void;
  onToggle: (file: Textbook) => void;
  onGenerate: () => void;
  onClose: () => void;
};

export default function TextbookPanel({
  files,
  selectedIds,
  loading,
  failed,
  uploading,
  canAttach,
  canSearch = false,
  knowledgeLoading = false,
  knowledgeFailed = false,
  busy,
  selectionDisabled = false,
  error,
  search,
  details,
  onSearch,
  onDetails,
  onRetry,
  onToggle,
  onGenerate,
  onClose,
}: TextbookPanelProps) {
  const localize = useLocalize();
  const id = useId();
  const matchingFiles = files.filter((file) =>
    file.filename.toLocaleLowerCase().includes(search.trim().toLocaleLowerCase()),
  );
  const selected = files.filter((file) => selectedIds.has(file.file_id));
  const selectedCount = selected.length;
  const canGenerate =
    !busy &&
    !uploading &&
    selectedCount > 0 &&
    selected.every((file) => canUseTextbook(file, canAttach, canSearch)) &&
    details.topic.trim().length > 0;

  const renderLibrary = () => {
    if (loading && files.length === 0) {
      return (
        <div
          className="text-text-secondary flex items-center justify-center gap-2 py-8"
          role="status"
        >
          <Spinner className="size-4" />
          <span className="text-sm">{localize('com_ui_loading')}</span>
        </div>
      );
    }
    if (matchingFiles.length === 0) {
      if (knowledgeLoading || ((failed || knowledgeFailed) && files.length === 0)) {
        return null;
      }
      return (
        <div className="text-text-secondary flex flex-col items-center gap-2 px-2 py-7 text-center">
          <BookOpen className="size-7" aria-hidden="true" />
          <p className="text-text-primary text-sm font-medium">
            {localize(search ? 'com_ui_textbooks_no_results' : 'com_ui_textbooks_empty')}
          </p>
          {!search && <p className="text-xs">{localize('com_ui_textbooks_empty_description')}</p>}
        </div>
      );
    }
    return (
      <ul className="space-y-1" aria-label={localize('com_ui_textbooks_available')}>
        {matchingFiles.map((file) => {
          const selected = selectedIds.has(file.file_id);
          const indexed = isIndexed(file);
          let status = formatFileSize(file.bytes);
          if (indexed) {
            status = localize(
              canSearch ? 'com_ui_textbooks_indexed' : 'com_ui_textbooks_search_disabled',
            );
          } else if (file.llmDeliveryPath === 'none') {
            status = localize('com_ui_textbooks_unreadable');
          }
          return (
            <li key={file.file_id}>
              <Button
                variant="option"
                aria-pressed={selected}
                data-selected={selected}
                disabled={
                  selectionDisabled ||
                  (busy && file.agentId == null) ||
                  !canUseTextbook(file, canAttach, canSearch)
                }
                onClick={() => onToggle(file)}
              >
                <CheckboxGlyph checked={selected} />
                <span className="min-w-0 flex-1 space-y-1">
                  <span className="block text-sm break-words">{file.filename}</span>
                  <span className="text-text-secondary block text-xs">{status}</span>
                </span>
              </Button>
            </li>
          );
        })}
      </ul>
    );
  };

  return (
    <section className="flex h-full min-h-0 flex-col pt-3" aria-labelledby={`${id}-title`}>
      <PanelHeader
        title={localize('com_ui_textbooks')}
        titleId={`${id}-title`}
        action={
          <Button
            variant="quiet"
            size="icon-sm"
            aria-label={localize('com_ui_textbooks_close')}
            onClick={onClose}
          >
            <X className="size-4" aria-hidden="true" />
          </Button>
        }
        search={
          <Input
            type="search"
            value={search}
            onChange={(event) => onSearch(event.target.value)}
            aria-label={localize('com_ui_textbooks_search')}
            placeholder={localize('com_ui_textbooks_search')}
          />
        }
      >
        <p className="text-text-secondary text-xs leading-relaxed">
          {localize('com_ui_textbooks_description')}
        </p>
      </PanelHeader>

      <div
        className="min-h-28 flex-1 overflow-y-auto px-3 py-2"
        aria-busy={loading || knowledgeLoading}
      >
        {(failed || knowledgeFailed) && (
          <div className="space-y-3 py-4 text-center" role="alert">
            <p className="text-text-secondary text-sm">
              {localize(
                knowledgeFailed
                  ? 'com_ui_textbooks_agent_load_error'
                  : 'com_ui_textbooks_load_error',
              )}
            </p>
            <Button variant="outline" size="sm" onClick={onRetry}>
              {localize('com_ui_retry')}
            </Button>
          </div>
        )}
        {knowledgeLoading && (
          <p className="text-text-secondary px-2 py-3 text-xs" role="status">
            {localize('com_ui_textbooks_agent_loading')}
          </p>
        )}
        {renderLibrary()}
      </div>

      <div className="space-y-2 px-4 pb-4">
        {!canAttach && files.some((file) => file.agentId == null) && (
          <p className="text-text-secondary text-xs" role="status">
            {localize('com_ui_textbooks_unsupported')}
          </p>
        )}
        <p className="text-text-secondary text-xs" role="status" aria-live="polite">
          {localize('com_ui_textbooks_selected', { count: selectedCount })}
        </p>
      </div>

      <form
        className="border-border-light space-y-3 border-t p-4"
        onSubmit={(event) => {
          event.preventDefault();
          if (canGenerate) {
            onGenerate();
          }
        }}
      >
        <h3 className="text-text-primary text-sm font-semibold">
          {localize('com_ui_textbooks_lesson')}
        </h3>
        <div className="space-y-1.5">
          <Label htmlFor={`${id}-topic`}>{localize('com_ui_textbooks_topic')}</Label>
          <Input
            id={`${id}-topic`}
            value={details.topic}
            onChange={(event) => onDetails({ ...details, topic: event.target.value })}
            placeholder={localize('com_ui_textbooks_topic_placeholder')}
            required
          />
        </div>
        <div className="space-y-1.5">
          <Label htmlFor={`${id}-section`}>{localize('com_ui_textbooks_section')}</Label>
          <Input
            id={`${id}-section`}
            value={details.section}
            onChange={(event) => onDetails({ ...details, section: event.target.value })}
            placeholder={localize('com_ui_textbooks_section_placeholder')}
          />
        </div>
        <div className="grid grid-cols-2 gap-3">
          <div className="space-y-1.5">
            <Label htmlFor={`${id}-grade`}>{localize('com_ui_textbooks_grade')}</Label>
            <Input
              id={`${id}-grade`}
              value={details.grade}
              onChange={(event) => onDetails({ ...details, grade: event.target.value })}
              placeholder={localize('com_ui_textbooks_grade_placeholder')}
            />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor={`${id}-duration`}>{localize('com_ui_textbooks_duration')}</Label>
            <Input
              id={`${id}-duration`}
              type="number"
              min="1"
              step="1"
              value={details.duration}
              onChange={(event) => onDetails({ ...details, duration: event.target.value })}
              required
            />
          </div>
        </div>
        <div className="space-y-1.5">
          <Label htmlFor={`${id}-date`}>{localize('com_ui_textbooks_date')}</Label>
          <Input
            id={`${id}-date`}
            type="date"
            value={details.date}
            onChange={(event) => onDetails({ ...details, date: event.target.value })}
          />
        </div>
        <p className="text-text-secondary text-xs leading-relaxed">
          {localize('com_ui_textbooks_lesson_hint')}
        </p>
        {error && (
          <p className="text-text-destructive text-xs" role="alert">
            {localize('com_ui_textbooks_send_error')}
          </p>
        )}
        <Button type="submit" className="w-full whitespace-normal" disabled={!canGenerate}>
          <Send className="size-4 shrink-0" aria-hidden="true" />
          {localize('com_ui_textbooks_generate')}
        </Button>
      </form>
    </section>
  );
}
