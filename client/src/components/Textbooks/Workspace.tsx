import { createContext, useContext, useMemo } from 'react';
import { useAtom } from 'jotai';
import { BookOpen } from 'lucide-react';
import {
  Button,
  OGDialog,
  OGDialogContent,
  OGDialogHeader,
  OGDialogTitle,
} from '@librechat/client';
import type { TFile } from 'librechat-data-provider';
import type { ReactNode } from 'react';
import { useChatContext, useChatFormContext } from '~/Providers';
import useSubmitMessage from '~/hooks/Messages/useSubmitMessage';
import useAttachExisting from '~/hooks/Files/useAttachExisting';
import useFileHandling from '~/hooks/Files/useFileHandling';
import useAttachTarget from '~/hooks/Input/useAttachTarget';
import useScaledMaxWidth from '~/hooks/useScaledMaxWidth';
import { useGetFiles } from '~/data-provider';
import useLocalize from '~/hooks/useLocalize';
import { hasIncompleteFiles } from '~/utils';
import { isTextbook } from './model';
import TextbookPanel from './Panel';
import * as state from './state';

const OverlayContext = createContext(false);

function useTextbookPanel() {
  const isSmallScreen = useScaledMaxWidth(1023);
  const suspended = useContext(OverlayContext);
  const [desktopOpen, setDesktopOpen] = useAtom(state.desktopOpen);
  const [mobileOpen, setMobileOpen] = useAtom(state.mobileOpen);
  const isOverlay = isSmallScreen || suspended;
  return {
    isOverlay,
    open: isOverlay ? mobileOpen : desktopOpen,
    setOpen: isOverlay ? setMobileOpen : setDesktopOpen,
  };
}

export function TextbookButton() {
  const localize = useLocalize();
  const { open, setOpen } = useTextbookPanel();
  return (
    <Button
      variant="header-action"
      size="sm"
      aria-label={localize('com_ui_textbooks')}
      aria-expanded={open}
      aria-controls="textbooks-panel"
      onClick={() => setOpen(!open)}
    >
      <BookOpen className="size-4 shrink-0" aria-hidden="true" />
      <span className="hidden sm:inline">{localize('com_ui_textbooks')}</span>
    </Button>
  );
}

function Library({ disabled }: { disabled: boolean }) {
  const localize = useLocalize();
  const { isOverlay, open, setOpen } = useTextbookPanel();
  const chat = useChatContext();
  const methods = useChatFormContext();
  const [search, setSearch] = useAtom(state.search);
  const [details, setDetails] = useAtom(state.details);
  const [error, setError] = useAtom(state.operationError);
  const { submitMessage } = useSubmitMessage();
  const { canAttach, endpointType, endpointFileConfig } = useAttachTarget(
    chat.conversation,
    disabled,
  );
  const attachExisting = useAttachExisting({
    files: chat.files,
    setFiles: chat.setFiles,
    conversation: chat.conversation,
    endpointType,
    endpointFileConfig,
  });
  const { handleFiles } = useFileHandling();
  const query = useGetFiles<TFile[]>({ refetchOnMount: 'always' });
  const books = useMemo(() => (query.data ?? []).filter(isTextbook), [query.data]);
  const selectedIds = useMemo(
    () => new Set(Array.from(chat.files.values(), (file) => file.file_id)),
    [chat.files],
  );
  const busy = disabled || chat.isSubmitting || hasIncompleteFiles(chat.files);

  const toggle = (file: TFile) => {
    if (!canAttach || busy) {
      return;
    }
    setError(null);
    if (!selectedIds.has(file.file_id)) {
      attachExisting(file);
      return;
    }
    chat.setFiles((current) => {
      const next = new Map(current);
      for (const [key, attachment] of next) {
        if (attachment.file_id === file.file_id) {
          next.delete(key);
        }
      }
      return next;
    });
  };

  const upload = async (files: File[]) => {
    if (!canAttach || busy || chat.filesLoading) {
      return;
    }
    setError(null);
    const documents = files.filter((file) => isTextbook({ filename: file.name, type: file.type }));
    if (documents.length !== files.length) {
      setError('upload');
      return;
    }
    try {
      const accepted = await handleFiles(documents);
      if (!accepted) {
        setError('upload');
      }
    } catch {
      setError('upload');
    }
  };

  const generate = () => {
    const selected = books.filter((file) => selectedIds.has(file.file_id));
    const duration = Number(details.duration);
    if (
      busy ||
      !canAttach ||
      chat.filesLoading ||
      selected.length === 0 ||
      !details.topic.trim() ||
      !Number.isSafeInteger(duration) ||
      duration < 1
    ) {
      return;
    }
    setError(null);
    const text = localize('com_ui_textbooks_prompt', {
      books: selected.map((file) => file.filename).join(', '),
      topic: details.topic.trim(),
      grade: details.grade.trim() || localize('com_ui_textbooks_infer_grade'),
      duration,
      date: details.date || localize('com_ui_textbooks_date_unspecified'),
      instructions:
        methods.getValues('text')?.trim() || localize('com_ui_textbooks_no_instructions'),
      interpolation: { escapeValue: false },
    });
    if (submitMessage({ text }) === false) {
      setError('send');
      return;
    }
    if (isOverlay) {
      setOpen(false);
    }
  };

  const panel = (
    <TextbookPanel
      files={books}
      selectedIds={selectedIds}
      loading={query.isLoading}
      failed={query.isError}
      uploading={chat.filesLoading}
      canAttach={canAttach}
      busy={busy}
      error={error}
      search={search}
      details={details}
      onSearch={setSearch}
      onDetails={setDetails}
      onRetry={() => void query.refetch()}
      onToggle={toggle}
      onUpload={(files) => void upload(files)}
      onGenerate={generate}
      onClose={() => setOpen(false)}
    />
  );

  if (isOverlay) {
    return (
      <OGDialog open={open} onOpenChange={setOpen}>
        <OGDialogContent
          id="textbooks-panel"
          title={localize('com_ui_textbooks')}
          showCloseButton={false}
          className="flex h-[90dvh] max-w-md flex-col overflow-y-auto"
        >
          <OGDialogHeader className="sr-only">
            <OGDialogTitle>{localize('com_ui_textbooks')}</OGDialogTitle>
          </OGDialogHeader>
          {panel}
        </OGDialogContent>
      </OGDialog>
    );
  }

  return (
    <aside
      id="textbooks-panel"
      aria-label={localize('com_ui_textbooks')}
      hidden={!open}
      className={
        open
          ? 'bg-surface-sidebar border-border-light w-80 shrink-0 overflow-y-auto border-s'
          : 'hidden'
      }
    >
      {panel}
    </aside>
  );
}

export default function TextbookWorkspace({
  children,
  enabled,
  disabled,
  suspended,
}: {
  children: ReactNode;
  enabled: boolean;
  disabled: boolean;
  suspended: boolean;
}) {
  return (
    <OverlayContext.Provider value={suspended}>
      <div className="flex h-full min-w-0">
        {children}
        {enabled && <Library disabled={disabled} />}
      </div>
    </OverlayContext.Provider>
  );
}
