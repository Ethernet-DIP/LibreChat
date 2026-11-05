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
import {
  Permissions,
  PermissionTypes,
  isAgentsEndpoint,
  isEphemeralAgentId,
  isAssistantsEndpoint,
  defaultAgentCapabilities,
} from 'librechat-data-provider';
import type { TFile } from 'librechat-data-provider';
import type { ReactNode } from 'react';
import type { Textbook } from './model';
import { useAgentCapabilities, useGetAgentsConfig } from '~/hooks/Agents';
import { isIndexed, canUseTextbook, mergeTextbooks } from './model';
import { useGetFiles, useGetAgentKnowledge } from '~/data-provider';
import { useChatContext, useChatFormContext } from '~/Providers';
import useSubmitMessage from '~/hooks/Messages/useSubmitMessage';
import useAttachExisting from '~/hooks/Files/useAttachExisting';
import useAttachTarget from '~/hooks/Input/useAttachTarget';
import useScaledMaxWidth from '~/hooks/useScaledMaxWidth';
import useHasAccess from '~/hooks/Roles/useHasAccess';
import { useAuthContext } from '~/hooks/AuthContext';
import useLocalize from '~/hooks/useLocalize';
import { hasIncompleteFiles } from '~/utils';
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
  const { user } = useAuthContext();
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
  const { agentsConfig } = useGetAgentsConfig();
  const { fileSearchEnabled } = useAgentCapabilities(
    agentsConfig?.capabilities ?? defaultAgentCapabilities,
  );
  const hasFileSearchAccess = useHasAccess({
    permissionType: PermissionTypes.FILE_SEARCH,
    permission: Permissions.USE,
  });
  const agentId =
    isAgentsEndpoint(chat.conversation?.endpoint) &&
    chat.conversation?.agent_id &&
    !isEphemeralAgentId(chat.conversation.agent_id)
      ? chat.conversation.agent_id
      : undefined;
  const knowledge = useGetAgentKnowledge(agentId, {
    enabled: agentId != null,
    refetchOnMount: 'always',
  });
  const [selectedKnowledge, setSelectedKnowledge] = useAtom(
    state.selectedKnowledge(JSON.stringify([user?.id ?? '', agentId ?? ''])),
  );
  const query = useGetFiles<TFile[]>({ refetchOnMount: 'always' });
  const books = useMemo(
    () => mergeTextbooks(query.data ?? [], agentId ? (knowledge.data?.files ?? []) : [], agentId),
    [query.data, knowledge.data?.files, agentId],
  );
  const canSearch =
    agentId != null
      ? knowledge.data?.enabled === true && !knowledge.isError
      : hasFileSearchAccess &&
        fileSearchEnabled &&
        !isAssistantsEndpoint(chat.conversation?.endpoint);
  const selectedIds = useMemo(() => {
    const ids = new Set(Array.from(chat.files.values(), (file) => file.file_id));
    const savedIds = new Set(Array.isArray(selectedKnowledge) ? selectedKnowledge : []);
    for (const file of books) {
      if (file.agentId != null && file.agentId === agentId) {
        if (savedIds.has(file.file_id)) {
          ids.add(file.file_id);
        } else {
          ids.delete(file.file_id);
        }
      }
    }
    return ids;
  }, [chat.files, books, selectedKnowledge, agentId]);
  const busy = disabled || chat.isSubmitting || hasIncompleteFiles(chat.files);

  const toggle = (file: Textbook) => {
    if (disabled || !canUseTextbook(file, canAttach, canSearch) || (busy && file.agentId == null)) {
      return;
    }
    setError(null);
    const selected = selectedIds.has(file.file_id);
    if (file.agentId != null) {
      setSelectedKnowledge((current) => {
        const ids = new Set(Array.isArray(current) ? current : []);
        if (selected) {
          ids.delete(file.file_id);
        } else {
          ids.add(file.file_id);
        }
        return [...ids];
      });
      return;
    }
    if (!selected && file.accountFile) {
      attachExisting(file.accountFile);
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

  const generate = () => {
    const selected = books.filter((file) => selectedIds.has(file.file_id));
    const duration = Number(details.duration);
    if (
      busy ||
      chat.filesLoading ||
      selected.length === 0 ||
      selected.some((file) => !canUseTextbook(file, canAttach, canSearch)) ||
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
      section: details.section.trim() || localize('com_ui_textbooks_section_unspecified'),
      grade: details.grade.trim() || localize('com_ui_textbooks_infer_grade'),
      duration,
      date: details.date || localize('com_ui_textbooks_date_unspecified'),
      instructions:
        methods.getValues('text')?.trim() || localize('com_ui_textbooks_no_instructions'),
      interpolation: { escapeValue: false },
    });
    const indexedIds = selected.filter(isIndexed).map((file) => file.file_id);
    const fileSearchSelection =
      agentId && indexedIds.length > 0 ? { agentId, fileIds: indexedIds } : undefined;
    const requestText =
      indexedIds.length > 0
        ? `${localize('com_ui_textbooks_search_instruction')}\n\n${text}`
        : text;
    if (submitMessage({ text: requestText, fileSearchSelection }) === false) {
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
      canSearch={canSearch}
      knowledgeLoading={agentId != null && knowledge.isLoading}
      knowledgeFailed={agentId != null && knowledge.isError}
      busy={busy}
      selectionDisabled={disabled}
      error={error}
      search={search}
      details={details}
      onSearch={setSearch}
      onDetails={setDetails}
      onRetry={() => {
        void query.refetch();
        if (agentId != null) {
          void knowledge.refetch();
        }
      }}
      onToggle={toggle}
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
