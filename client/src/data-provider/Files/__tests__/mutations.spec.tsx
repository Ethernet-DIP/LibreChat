import React from 'react';
import { RecoilRoot } from 'recoil';
import { act, renderHook, waitFor } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { QueryKeys, FileSources, EToolResources, DynamicQueryKeys } from 'librechat-data-provider';
import type { TFile, BatchFile } from 'librechat-data-provider';
import type { ReactNode } from 'react';
import { useUploadFileMutation, useDeleteFilesMutation } from '../mutations';
import { useGetRecentFiles, useGetAgentKnowledge } from '../queries';

/**
 * The composer palette reads its "your files" section from
 * `[QueryKeys.files, 'recent', limit]`, a query that is only enabled while the
 * palette is open. These cover both halves of the staleness question: a file
 * arriving while the palette watches, and one arriving while it is shut.
 */

const mockGetFiles = jest.fn();
const mockUploadFile = jest.fn();
const mockDeleteFiles = jest.fn();
const mockGetAgentKnowledge = jest.fn();

jest.mock('librechat-data-provider', () => {
  const actual = jest.requireActual('librechat-data-provider');
  return {
    ...actual,
    dataService: {
      ...actual.dataService,
      getFiles: (...args: unknown[]) => mockGetFiles(...args),
      uploadFile: (...args: unknown[]) => mockUploadFile(...args),
      deleteFiles: (...args: unknown[]) => mockDeleteFiles(...args),
      getAgentKnowledge: (...args: unknown[]) => mockGetAgentKnowledge(...args),
    },
  };
});

jest.mock('@librechat/client', () => ({
  useToastContext: () => ({ showToast: jest.fn() }),
}));

jest.mock('~/hooks', () => ({
  useLocalize: () => (key: string) => key,
}));

jest.mock('../../Endpoints', () => ({
  useGetStartupConfig: () => ({ data: undefined }),
}));

const RECENT_LIMIT = 5;

const makeFile = (over: Partial<TFile> = {}): TFile =>
  ({
    user: 'user-1',
    file_id: 'file-old',
    filename: 'old.pdf',
    filepath: '/files/old.pdf',
    type: 'application/pdf',
    bytes: 1024,
    embedded: false,
    object: 'file',
    ...over,
  }) as TFile;

const createClient = () =>
  new QueryClient({
    defaultOptions: {
      queries: { retry: false },
      mutations: { retry: false },
    },
  });

const wrapperFor = (queryClient: QueryClient) =>
  function Wrapper({ children }: { children: ReactNode }) {
    return (
      <RecoilRoot>
        <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>
      </RecoilRoot>
    );
  };

const renderPalette = (queryClient: QueryClient, initialOpen: boolean) =>
  renderHook(
    ({ open }: { open: boolean }) => ({
      recent: useGetRecentFiles(RECENT_LIMIT, { enabled: open }),
      upload: useUploadFileMutation(),
      remove: useDeleteFilesMutation(),
    }),
    { wrapper: wrapperFor(queryClient), initialProps: { open: initialOpen } },
  );

const uploadForm = (): FormData => {
  const body = new FormData();
  body.append('endpoint', 'openAI');
  return body;
};

describe('recent-files cache after file mutations', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockGetFiles.mockResolvedValue([makeFile()]);
    mockDeleteFiles.mockResolvedValue({ message: 'deleted' });
  });

  it('keys the recent page separately from the full file list', async () => {
    const queryClient = createClient();
    const { result } = renderPalette(queryClient, true);

    await waitFor(() => expect(result.current.recent.data).toHaveLength(1));

    expect(mockGetFiles).toHaveBeenCalledWith({ limit: RECENT_LIMIT });
    expect(queryClient.getQueryData([QueryKeys.files, 'recent', RECENT_LIMIT])).toHaveLength(1);
    expect(queryClient.getQueryData([QueryKeys.files])).toBeUndefined();
  });

  it('refreshes the open palette when a file is uploaded onto the composer', async () => {
    const queryClient = createClient();
    const { result } = renderPalette(queryClient, true);

    await waitFor(() => expect(result.current.recent.data).toHaveLength(1));
    expect(mockGetFiles).toHaveBeenCalledTimes(1);

    const uploaded = makeFile({ file_id: 'file-new', filename: 'new.pdf' });
    mockUploadFile.mockResolvedValue(uploaded);
    mockGetFiles.mockResolvedValue([uploaded, makeFile()]);

    await act(async () => {
      await result.current.upload.mutateAsync(uploadForm());
    });

    await waitFor(() =>
      expect(result.current.recent.data?.map((file) => file.file_id)).toEqual([
        'file-new',
        'file-old',
      ]),
    );
    expect(mockGetFiles).toHaveBeenCalledTimes(2);
  });

  /* The palette component holds the disclosure button, so it stays mounted for
     the whole conversation and closing it only flips `enabled`. React Query
     refetches when a mounted observer goes from disabled to enabled over stale
     data, which is a different path from `refetchOnMount` and is why the
     invalidation above does not need a matching `setQueriesData`. */
  it('refreshes the palette on reopen when the upload landed while it was shut', async () => {
    const queryClient = createClient();
    const { result, rerender } = renderPalette(queryClient, true);

    await waitFor(() => expect(result.current.recent.data).toHaveLength(1));
    expect(mockGetFiles).toHaveBeenCalledTimes(1);

    rerender({ open: false });

    const uploaded = makeFile({ file_id: 'file-new', filename: 'new.pdf' });
    mockUploadFile.mockResolvedValue(uploaded);
    mockGetFiles.mockResolvedValue([uploaded, makeFile()]);

    await act(async () => {
      await result.current.upload.mutateAsync(uploadForm());
    });

    expect(mockGetFiles).toHaveBeenCalledTimes(1);

    rerender({ open: true });

    await waitFor(() =>
      expect(result.current.recent.data?.map((file) => file.file_id)).toEqual([
        'file-new',
        'file-old',
      ]),
    );
    expect(mockGetFiles).toHaveBeenCalledTimes(2);
  });

  it('drops a deleted file from the recent page while the palette is open', async () => {
    const queryClient = createClient();
    const { result } = renderPalette(queryClient, true);

    await waitFor(() => expect(result.current.recent.data).toHaveLength(1));

    mockGetFiles.mockResolvedValue([]);

    await act(async () => {
      await result.current.remove.mutateAsync({
        files: [{ file_id: 'file-old', filepath: '/files/old.pdf' } as BatchFile],
      });
    });

    await waitFor(() => expect(result.current.recent.data).toEqual([]));
    expect(mockGetFiles).toHaveBeenCalledTimes(2);
  });
});

describe('agent textbook cache after File Search mutations', () => {
  const agentId = 'agent_a';
  const otherAgentId = 'agent_b';
  const previous = { enabled: true, files: [makeFile()] };
  const renderKnowledge = (queryClient: QueryClient) =>
    renderHook(
      ({ enabled }: { enabled: boolean }) => ({
        knowledge: useGetAgentKnowledge(agentId, { enabled, staleTime: Infinity }),
        upload: useUploadFileMutation(),
        remove: useDeleteFilesMutation(),
      }),
      { wrapper: wrapperFor(queryClient), initialProps: { enabled: true } },
    );
  const fileSearchForm = () => {
    const body = uploadForm();
    body.set('agent_id', agentId);
    body.set('tool_resource', EToolResources.file_search);
    return body;
  };

  beforeEach(() => {
    jest.clearAllMocks();
    mockGetAgentKnowledge.mockResolvedValue(previous);
    mockUploadFile.mockResolvedValue(makeFile({ file_id: 'file-new' }));
    mockDeleteFiles.mockResolvedValue({ message: 'deleted' });
  });

  it('reloads books uploaded while the list is disabled without invalidating another agent', async () => {
    const queryClient = createClient();
    queryClient.setQueryData(DynamicQueryKeys.agentKnowledge(otherAgentId), previous);
    const { result, rerender } = renderKnowledge(queryClient);
    await waitFor(() => expect(result.current.knowledge.data).toEqual(previous));
    rerender({ enabled: false });
    const updated = { enabled: true, files: [makeFile(), makeFile({ file_id: 'file-new' })] };
    mockGetAgentKnowledge.mockResolvedValue(updated);

    await act(async () => {
      await result.current.upload.mutateAsync(fileSearchForm());
    });

    expect(mockGetAgentKnowledge).toHaveBeenCalledTimes(1);
    expect(queryClient.getQueryState(DynamicQueryKeys.agentKnowledge(agentId))?.isInvalidated).toBe(
      true,
    );
    expect(
      queryClient.getQueryState(DynamicQueryKeys.agentKnowledge(otherAgentId))?.isInvalidated,
    ).toBe(false);
    rerender({ enabled: true });
    await waitFor(() => expect(result.current.knowledge.data).toEqual(updated));
  });

  it('reloads books removed while the list is disabled', async () => {
    const queryClient = createClient();
    const { result, rerender } = renderKnowledge(queryClient);
    await waitFor(() => expect(result.current.knowledge.data).toEqual(previous));
    rerender({ enabled: false });
    const updated = { enabled: true, files: [] };
    mockGetAgentKnowledge.mockResolvedValue(updated);

    await act(async () => {
      await result.current.remove.mutateAsync({
        files: [
          {
            file_id: 'file-old',
            filepath: '/files/old.pdf',
            embedded: true,
            source: FileSources.vectordb,
          },
        ],
        agent_id: agentId,
        tool_resource: EToolResources.file_search,
      });
    });

    expect(mockGetAgentKnowledge).toHaveBeenCalledTimes(1);
    rerender({ enabled: true });
    await waitFor(() => expect(result.current.knowledge.data).toEqual(updated));
  });

  it('keeps the open list current after a book is removed', async () => {
    const queryClient = createClient();
    const { result } = renderKnowledge(queryClient);
    await waitFor(() => expect(result.current.knowledge.data).toEqual(previous));
    const updated = { enabled: true, files: [] };
    mockGetAgentKnowledge.mockResolvedValue(updated);

    await act(async () => {
      await result.current.remove.mutateAsync({
        files: [],
        agent_id: agentId,
        tool_resource: EToolResources.file_search,
      });
    });

    await waitFor(() => expect(result.current.knowledge.data).toEqual(updated));
    expect(mockGetAgentKnowledge).toHaveBeenCalledTimes(2);
  });

  it('does not invalidate agent books for an attachment to a conversation', async () => {
    const queryClient = createClient();
    const { result, rerender } = renderKnowledge(queryClient);
    await waitFor(() => expect(result.current.knowledge.data).toEqual(previous));
    rerender({ enabled: false });
    const body = fileSearchForm();
    body.set('message_file', 'true');

    await act(async () => {
      await result.current.upload.mutateAsync(body);
    });

    expect(queryClient.getQueryState(DynamicQueryKeys.agentKnowledge(agentId))?.isInvalidated).toBe(
      false,
    );
  });
});
