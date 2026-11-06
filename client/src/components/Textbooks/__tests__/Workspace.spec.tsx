import React, { useState } from 'react';
import { createInstance } from 'i18next';
import { Provider, createStore } from 'jotai';
import { I18nextProvider } from 'react-i18next';
import { FileSources } from 'librechat-data-provider';
import { render, screen, fireEvent } from '@testing-library/react';
import type { TFile, TAgentKnowledgeResponse } from 'librechat-data-provider';
import type { AttachExistingContext } from '~/hooks/Files/useAttachExisting';
import type { ExtendedFile } from '~/common';
import translation from '~/locales/en/translation.json';
import TextbookWorkspace from '../Workspace';

const i18n = createInstance();
void i18n.init({
  lng: 'en',
  fallbackLng: 'en',
  resources: { en: { translation } },
  interpolation: { escapeValue: false },
});

let mockAgentId = 'agent_a';
let mockEndpoint = 'agents';
let mockUserId = 'teacher-a';
let mockCanAttach = true;
let mockHasFileSearchAccess = true;
let mockFileSearchEnabled = true;
let mockKnowledgeFailed = false;
let mockIsSubmitting = false;
let mockFilesLoading = false;
let mockNavigationPending = false;
let mockInitialFiles = new Map<string, ExtendedFile>();
let mockCurrentFiles = mockInitialFiles;
let mockAccountFiles: TFile[] = [];
let mockKnowledge: Record<string, TAgentKnowledgeResponse>;
const mockSubmitMessage = jest.fn();
const mockAttachExisting = jest.fn();
const mockAccountRefetch = jest.fn();
const mockKnowledgeRefetch = jest.fn();
const mockKnowledgeQuery = jest.fn((agentId?: string) => ({
  data: agentId ? mockKnowledge[agentId] : undefined,
  isLoading: false,
  isError: mockKnowledgeFailed,
  refetch: mockKnowledgeRefetch,
}));

function MockChatContext() {
  const [files, setFiles] = useState(mockInitialFiles);
  mockCurrentFiles = files;
  return {
    files,
    setFiles,
    conversation: { endpoint: mockEndpoint, agent_id: mockAgentId },
    isSubmitting: mockIsSubmitting,
    filesLoading: mockFilesLoading,
  };
}

jest.mock('~/Providers', () => ({
  useChatContext: () => MockChatContext(),
  useChatFormContext: () => ({ getValues: () => '' }),
}));
jest.mock('~/hooks/AuthContext', () => ({
  useAuthContext: () => ({ user: { id: mockUserId } }),
}));
jest.mock('~/hooks/Messages/useSubmitMessage', () => ({
  __esModule: true,
  default: () => ({ submitMessage: mockSubmitMessage }),
}));
jest.mock('~/hooks/Input/useAttachTarget', () => ({
  __esModule: true,
  default: () => ({ canAttach: mockCanAttach, endpointType: 'custom' }),
}));
jest.mock('~/hooks/Files/useAttachExisting', () => ({
  __esModule: true,
  default: (context: AttachExistingContext) => (file: TFile) => {
    mockAttachExisting(file);
    context.setFiles((current) => {
      const next = new Map(current);
      next.set(file.file_id, {
        file_id: file.file_id,
        filename: file.filename,
        filepath: file.filepath,
        type: file.type,
        size: file.bytes,
        progress: 1,
        source: file.source,
      });
      return next;
    });
  },
}));
jest.mock('~/hooks/Agents', () => ({
  useGetAgentsConfig: () => ({ agentsConfig: {} }),
  useAgentCapabilities: () => ({ fileSearchEnabled: mockFileSearchEnabled }),
}));
jest.mock('~/hooks/Roles/useHasAccess', () => ({
  __esModule: true,
  default: () => mockHasFileSearchAccess,
}));
jest.mock('~/hooks/useScaledMaxWidth', () => ({ __esModule: true, default: () => false }));
jest.mock('~/utils', () => ({
  hasIncompleteFiles: jest.requireActual('~/utils/files').hasIncompleteFiles,
  cn: jest.requireActual('~/utils/cn').default,
}));
jest.mock('~/data-provider', () => ({
  useGetFiles: () => ({
    data: mockAccountFiles,
    isLoading: false,
    isError: false,
    refetch: mockAccountRefetch,
  }),
  useGetAgentKnowledge: (agentId?: string) => mockKnowledgeQuery(agentId),
}));

const biology = {
  file_id: 'biology',
  filename: 'Biology.pdf',
  type: 'application/pdf',
  bytes: 40_000_000,
  embedded: true,
  llmDeliveryPath: 'none' as const,
};
const mathematics = { ...biology, file_id: 'mathematics', filename: 'Mathematics.pdf' };
const sample: TFile = {
  ...biology,
  file_id: 'sample',
  filename: 'Sample lesson plan.txt',
  type: 'text/plain',
  bytes: 1000,
  embedded: false,
  llmDeliveryPath: 'text',
  user: 'teacher-a',
  filepath: '/uploads/sample.txt',
  source: FileSources.local,
  object: 'file',
  usage: 0,
};

function renderWorkspace() {
  const store = createStore();
  const content = () => (
    <Provider store={store}>
      <I18nextProvider i18n={i18n}>
        <TextbookWorkspace enabled disabled={mockNavigationPending} suspended={false}>
          <div />
        </TextbookWorkspace>
      </I18nextProvider>
    </Provider>
  );
  const result = render(content());
  return { ...result, rerenderWorkspace: () => result.rerender(content()) };
}

function chooseTopic() {
  fireEvent.change(screen.getByLabelText('Topic or unit'), {
    target: { value: 'Photosynthesis' },
  });
}

beforeEach(() => {
  mockAgentId = 'agent_a';
  mockEndpoint = 'agents';
  mockUserId = 'teacher-a';
  mockCanAttach = true;
  mockHasFileSearchAccess = true;
  mockFileSearchEnabled = true;
  mockKnowledgeFailed = false;
  mockIsSubmitting = false;
  mockFilesLoading = false;
  mockNavigationPending = false;
  mockInitialFiles = new Map();
  mockCurrentFiles = mockInitialFiles;
  mockAccountFiles = [];
  mockKnowledge = {
    agent_a: { enabled: true, files: [biology] },
    agent_b: { enabled: true, files: [mathematics] },
  };
  localStorage.clear();
});

describe('indexed textbook lesson planning', () => {
  it.each(['pending upload', 'active response'])(
    'keeps saved-agent selection responsive during a %s without changing attachments',
    (activity) => {
      const progress = activity === 'pending upload' ? 0.4 : 1;
      mockIsSubmitting = activity === 'active response';
      mockAccountFiles = [sample];
      mockInitialFiles = new Map([
        [
          'biology',
          {
            file_id: 'biology',
            filename: biology.filename,
            type: biology.type,
            size: biology.bytes,
            progress,
          },
        ],
        [
          'sample',
          {
            file_id: 'sample',
            filename: sample.filename,
            type: sample.type,
            size: sample.bytes,
            progress,
          },
        ],
      ]);
      const attachments = mockInitialFiles;
      renderWorkspace();
      const textbook = screen.getByRole('button', { name: /Biology.pdf/ });
      const personal = screen.getByRole('button', { name: /Sample lesson plan/ });
      expect(textbook).toBeEnabled();
      expect(textbook).toHaveAttribute('aria-pressed', 'false');
      expect(personal).toBeDisabled();
      chooseTopic();
      fireEvent.click(textbook);
      expect(textbook).toHaveAttribute('aria-pressed', 'true');
      expect(screen.getByRole('button', { name: 'Create daily lesson plan' })).toBeDisabled();
      fireEvent.click(screen.getByRole('button', { name: 'Create daily lesson plan' }));
      fireEvent.click(personal);
      expect(mockSubmitMessage).not.toHaveBeenCalled();
      expect(mockAttachExisting).not.toHaveBeenCalled();
      expect(mockCurrentFiles).toBe(attachments);
      fireEvent.click(textbook);
      expect(textbook).toHaveAttribute('aria-pressed', 'false');
      expect(mockCurrentFiles).toBe(attachments);
      expect(mockCurrentFiles.size).toBe(2);
      expect(mockCurrentFiles.get('biology')?.progress).toBe(progress);
      expect(mockCurrentFiles.get('sample')?.progress).toBe(progress);
    },
  );

  it('sends the textbook section separately from the topic or unit', () => {
    mockKnowledge.agent_a = { enabled: true, files: [biology] };
    renderWorkspace();
    fireEvent.click(screen.getByRole('button', { name: /Biology.pdf/ }));
    chooseTopic();
    fireEvent.change(screen.getByLabelText('Textbook section (optional)'), {
      target: { value: ' 2.3 Light reactions ' },
    });
    fireEvent.click(screen.getByRole('button', { name: 'Create daily lesson plan' }));
    const { text } = mockSubmitMessage.mock.calls[0][0];
    expect(text).toContain('Topic or unit: Photosynthesis\n');
    expect(text).toContain('Textbook section: 2.3 Light reactions\n');
  });

  it('keeps a submitted textbook scope unchanged while selecting books for the next lesson', () => {
    mockKnowledge.agent_a = { enabled: true, files: [biology, mathematics] };
    const { rerenderWorkspace } = renderWorkspace();
    fireEvent.click(screen.getByRole('button', { name: /Biology.pdf/ }));
    chooseTopic();
    fireEvent.click(screen.getByRole('button', { name: 'Create daily lesson plan' }));
    const submitted = mockSubmitMessage.mock.calls[0][0];
    mockIsSubmitting = true;
    rerenderWorkspace();
    fireEvent.click(screen.getByRole('button', { name: /Biology.pdf/ }));
    fireEvent.click(screen.getByRole('button', { name: /Mathematics.pdf/ }));
    expect(screen.getByRole('button', { name: /Biology.pdf/ })).toHaveAttribute(
      'aria-pressed',
      'false',
    );
    expect(screen.getByRole('button', { name: /Mathematics.pdf/ })).toHaveAttribute(
      'aria-pressed',
      'true',
    );
    expect(screen.getByRole('button', { name: 'Create daily lesson plan' })).toBeDisabled();
    expect(submitted.fileSearchSelection).toEqual({ agentId: 'agent_a', fileIds: ['biology'] });
    expect(submitted.text).toContain('Selected textbooks: Biology.pdf');
    expect(submitted.text).toContain('Topic or unit: Photosynthesis');
    expect(submitted.text).toContain(
      'Textbook section: Not specified. Cover the topic or unit above.',
    );
    mockIsSubmitting = false;
    rerenderWorkspace();
    fireEvent.click(screen.getByRole('button', { name: 'Create daily lesson plan' }));
    expect(mockSubmitMessage).toHaveBeenLastCalledWith({
      text: expect.stringContaining('Selected textbooks: Mathematics.pdf'),
      fileSearchSelection: { agentId: 'agent_a', fileIds: ['mathematics'] },
    });
    expect(submitted.fileSearchSelection).toEqual({ agentId: 'agent_a', fileIds: ['biology'] });
  });

  it('blocks selection while navigating without changing the previous agent’s selection', () => {
    mockNavigationPending = true;
    mockAccountFiles = [sample];
    const { rerenderWorkspace } = renderWorkspace();
    const textbook = screen.getByRole('button', { name: /Biology.pdf/ });
    expect(textbook).toBeDisabled();
    expect(screen.getByRole('button', { name: /Sample lesson plan/ })).toBeDisabled();
    fireEvent.click(textbook);
    expect(textbook).toHaveAttribute('aria-pressed', 'false');
    expect(mockCurrentFiles.size).toBe(0);
    mockNavigationPending = false;
    rerenderWorkspace();
    expect(screen.getByRole('button', { name: /Biology.pdf/ })).toBeEnabled();
    expect(screen.getByRole('button', { name: /Biology.pdf/ })).toHaveAttribute(
      'aria-pressed',
      'false',
    );
  });

  it('keeps generation blocked during file loading while allowing saved-agent selection', () => {
    mockFilesLoading = true;
    renderWorkspace();
    fireEvent.click(screen.getByRole('button', { name: /Biology.pdf/ }));
    chooseTopic();
    expect(screen.getByRole('button', { name: /Biology.pdf/ })).toHaveAttribute(
      'aria-pressed',
      'true',
    );
    expect(screen.getByRole('button', { name: 'Create daily lesson plan' })).toBeDisabled();
    fireEvent.click(screen.getByRole('button', { name: 'Create daily lesson plan' }));
    expect(mockSubmitMessage).not.toHaveBeenCalled();
  });

  it.each(['capability', 'permission'])(
    'uses the saved agent’s server-confirmed availability when client %s data is unavailable',
    (gate) => {
      if (gate === 'capability') {
        mockFileSearchEnabled = false;
      } else {
        mockHasFileSearchAccess = false;
      }
      mockCanAttach = false;
      renderWorkspace();
      const textbook = screen.getByRole('button', { name: /Biology.pdf/ });
      expect(textbook).toBeEnabled();
      fireEvent.click(textbook);
      expect(textbook).toHaveAttribute('aria-pressed', 'true');
      chooseTopic();
      fireEvent.click(screen.getByRole('button', { name: 'Create daily lesson plan' }));
      expect(mockSubmitMessage).toHaveBeenCalledWith({
        text: expect.stringContaining('Selected textbooks: Biology.pdf'),
        fileSearchSelection: { agentId: 'agent_a', fileIds: ['biology'] },
      });
      expect(mockCurrentFiles.size).toBe(0);
      expect(mockAttachExisting).not.toHaveBeenCalled();
    },
  );

  it.each(['capability', 'permission'])(
    'keeps the client %s gate for indexed personal books outside saved agents',
    (gate) => {
      mockEndpoint = 'Ollama';
      mockAgentId = '';
      mockAccountFiles = [{ ...sample, ...mathematics }];
      if (gate === 'capability') {
        mockFileSearchEnabled = false;
      } else {
        mockHasFileSearchAccess = false;
      }
      const { rerenderWorkspace } = renderWorkspace();
      const textbook = screen.getByRole('button', { name: /Mathematics.pdf/ });
      expect(textbook).toBeDisabled();
      fireEvent.click(textbook);
      expect(mockAttachExisting).not.toHaveBeenCalled();
      mockFileSearchEnabled = true;
      mockHasFileSearchAccess = true;
      rerenderWorkspace();
      expect(screen.getByRole('button', { name: /Mathematics.pdf/ })).toBeEnabled();
    },
  );

  it('selects agent metadata without attaching or reuploading a book and sends its exact scope', () => {
    mockCanAttach = false;
    const { container } = renderWorkspace();
    fireEvent.click(screen.getByRole('button', { name: /Biology.pdf/ }));
    chooseTopic();
    fireEvent.click(screen.getByRole('button', { name: 'Create daily lesson plan' }));
    expect(mockCurrentFiles.size).toBe(0);
    expect(mockAttachExisting).not.toHaveBeenCalled();
    expect(container.querySelector('input[type="file"]')).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Upload textbook' })).not.toBeInTheDocument();
    expect(mockSubmitMessage).toHaveBeenCalledWith({
      text: expect.stringContaining('Selected textbooks: Biology.pdf'),
      fileSearchSelection: { agentId: 'agent_a', fileIds: ['biology'] },
    });
    expect(mockSubmitMessage.mock.calls[0][0].text).toContain('use File Search');
    expect(screen.getByRole('button', { name: /Biology.pdf/ })).toHaveAttribute(
      'aria-pressed',
      'true',
    );
  });

  it('deduplicates own copies using agent knowledge without changing its storage namespace', () => {
    mockAccountFiles = [{ ...sample, ...biology }];
    renderWorkspace();
    expect(screen.getAllByRole('button', { name: /Biology.pdf/ })).toHaveLength(1);
    fireEvent.click(screen.getByRole('button', { name: /Biology.pdf/ }));
    expect(mockAttachExisting).not.toHaveBeenCalled();
    expect(mockCurrentFiles.size).toBe(0);
  });

  it('keeps sample context attached alongside selected indexed books', () => {
    mockAccountFiles = [sample];
    renderWorkspace();
    fireEvent.click(screen.getByRole('button', { name: /Biology.pdf/ }));
    fireEvent.click(screen.getByRole('button', { name: /Sample lesson plan/ }));
    chooseTopic();
    fireEvent.click(screen.getByRole('button', { name: 'Create daily lesson plan' }));
    expect(mockAttachExisting).toHaveBeenCalledWith(sample);
    expect(mockCurrentFiles.has('sample')).toBe(true);
    expect(mockSubmitMessage).toHaveBeenCalledWith({
      text: expect.stringContaining('Sample lesson plan.txt'),
      fileSearchSelection: { agentId: 'agent_a', fileIds: ['biology'] },
    });
  });

  it('isolates stored selections when the active agent or teacher changes', () => {
    const { rerenderWorkspace } = renderWorkspace();
    fireEvent.click(screen.getByRole('button', { name: /Biology.pdf/ }));
    chooseTopic();
    mockAgentId = 'agent_b';
    rerenderWorkspace();
    expect(screen.queryByRole('button', { name: /Biology.pdf/ })).not.toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Create daily lesson plan' })).toBeDisabled();
    fireEvent.click(screen.getByRole('button', { name: /Mathematics.pdf/ }));
    fireEvent.click(screen.getByRole('button', { name: 'Create daily lesson plan' }));
    expect(mockSubmitMessage).toHaveBeenLastCalledWith({
      text: expect.stringContaining('Mathematics.pdf'),
      fileSearchSelection: { agentId: 'agent_b', fileIds: ['mathematics'] },
    });
    mockUserId = 'teacher-b';
    rerenderWorkspace();
    expect(screen.getByRole('button', { name: /Mathematics.pdf/ })).toHaveAttribute(
      'aria-pressed',
      'false',
    );
    expect(screen.getByRole('button', { name: 'Create daily lesson plan' })).toBeDisabled();
  });

  it('attaches an indexed personal book and includes its ID in the lesson search scope', () => {
    mockAccountFiles = [{ ...sample, ...mathematics }];
    renderWorkspace();
    fireEvent.click(screen.getByRole('button', { name: /Mathematics.pdf/ }));
    chooseTopic();
    fireEvent.click(screen.getByRole('button', { name: 'Create daily lesson plan' }));
    expect(mockAttachExisting).toHaveBeenCalledWith(mockAccountFiles[0]);
    expect(mockCurrentFiles.has('mathematics')).toBe(true);
    expect(mockSubmitMessage).toHaveBeenCalledWith({
      text: expect.stringContaining('Mathematics.pdf'),
      fileSearchSelection: { agentId: 'agent_a', fileIds: ['mathematics'] },
    });
  });

  it('restores the same teacher’s selected agent books after remounting', () => {
    const { unmount } = renderWorkspace();
    fireEvent.click(screen.getByRole('button', { name: /Biology.pdf/ }));
    unmount();
    renderWorkspace();
    expect(screen.getByRole('button', { name: /Biology.pdf/ })).toHaveAttribute(
      'aria-pressed',
      'true',
    );
    expect(mockCurrentFiles.size).toBe(0);
  });

  it('reports a failed lesson request without losing the selected textbook', () => {
    mockSubmitMessage.mockReturnValueOnce(false);
    renderWorkspace();
    fireEvent.click(screen.getByRole('button', { name: /Biology.pdf/ }));
    chooseTopic();
    fireEvent.click(screen.getByRole('button', { name: 'Create daily lesson plan' }));
    expect(screen.getByRole('alert')).toHaveTextContent('The lesson-plan request was not sent');
    expect(screen.getByRole('button', { name: /Biology.pdf/ })).toHaveAttribute(
      'aria-pressed',
      'true',
    );
  });

  it('selects a textbook added through the agent knowledge list without a sidebar upload', () => {
    const { rerenderWorkspace, container } = renderWorkspace();
    expect(screen.queryByRole('button', { name: /Mathematics.pdf/ })).not.toBeInTheDocument();
    mockKnowledge.agent_a = { enabled: true, files: [biology, mathematics] };
    rerenderWorkspace();
    fireEvent.click(screen.getByRole('button', { name: /Mathematics.pdf/ }));
    chooseTopic();
    fireEvent.click(screen.getByRole('button', { name: 'Create daily lesson plan' }));
    expect(mockSubmitMessage).toHaveBeenCalledWith({
      text: expect.stringContaining('Selected textbooks: Mathematics.pdf'),
      fileSearchSelection: { agentId: 'agent_a', fileIds: ['mathematics'] },
    });
    expect(mockCurrentFiles.size).toBe(0);
    expect(container.querySelector('input[type="file"]')).not.toBeInTheDocument();
  });

  it('disables indexed books when the agent lacks File Search and surfaces query failure', () => {
    mockKnowledge['agent_a'].enabled = false;
    const { rerenderWorkspace } = renderWorkspace();
    expect(screen.getByRole('button', { name: /Biology.pdf/ })).toBeDisabled();
    mockKnowledgeFailed = true;
    rerenderWorkspace();
    expect(screen.getByRole('alert')).toHaveTextContent(
      'This agent’s textbooks could not be loaded',
    );
    fireEvent.click(screen.getByRole('button', { name: 'Retry' }));
    expect(mockKnowledgeRefetch).toHaveBeenCalledTimes(1);
  });

  it('retains the readable attachment flow outside saved agents', () => {
    mockEndpoint = 'Ollama';
    mockAgentId = '';
    mockAccountFiles = [sample];
    renderWorkspace();
    fireEvent.click(screen.getByRole('button', { name: /Sample lesson plan/ }));
    chooseTopic();
    fireEvent.click(screen.getByRole('button', { name: 'Create daily lesson plan' }));
    expect(mockSubmitMessage).toHaveBeenCalledWith({
      text: expect.stringContaining('Sample lesson plan.txt'),
      fileSearchSelection: undefined,
    });
  });
});
