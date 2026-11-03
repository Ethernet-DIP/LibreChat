import React, { useState } from 'react';
import { createInstance } from 'i18next';
import { I18nextProvider } from 'react-i18next';
import { render, screen, fireEvent } from '@testing-library/react';
import type { TFile } from 'librechat-data-provider';
import type { TextbookPanelProps } from '../Panel';
import translation from '~/locales/en/translation.json';
import TextbookPanel from '../Panel';

const i18n = createInstance();
void i18n.init({
  lng: 'en',
  fallbackLng: 'en',
  resources: { en: { translation } },
  interpolation: { escapeValue: false },
});

const books: TFile[] = [
  {
    file_id: 'biology',
    user: 'teacher',
    filename: 'Grade 9 Biology.pdf',
    filepath: '/uploads/biology.pdf',
    bytes: 2048,
    embedded: false,
    object: 'file',
    type: 'application/pdf',
    usage: 1,
  },
  {
    file_id: 'english',
    user: 'teacher',
    filename: 'Grade 10 English.docx',
    filepath: '/uploads/english.docx',
    bytes: 4096,
    embedded: false,
    object: 'file',
    type: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
    usage: 1,
  },
];

function renderPanel(overrides: Partial<TextbookPanelProps> = {}) {
  const callbacks = {
    onRetry: jest.fn(),
    onToggle: jest.fn(),
    onGenerate: jest.fn(),
    onClose: jest.fn(),
  };
  function Harness() {
    const [search, setSearch] = useState('');
    const [details, setDetails] = useState({ topic: '', grade: '', duration: '40', date: '' });
    const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
    return (
      <I18nextProvider i18n={i18n}>
        <TextbookPanel
          files={books}
          selectedIds={selectedIds}
          loading={false}
          failed={false}
          uploading={false}
          canAttach={true}
          busy={false}
          error={null}
          search={search}
          details={details}
          onSearch={setSearch}
          onDetails={setDetails}
          {...callbacks}
          onToggle={(file) => {
            callbacks.onToggle(file);
            setSelectedIds((current) => {
              const next = new Set(current);
              if (next.has(file.file_id)) {
                next.delete(file.file_id);
              } else {
                next.add(file.file_id);
              }
              return next;
            });
          }}
          {...overrides}
        />
      </I18nextProvider>
    );
  }
  return { ...render(<Harness />), ...callbacks };
}

describe('textbook panel', () => {
  it('selects and deselects actual documents and announces the selection count', () => {
    const { onToggle } = renderPanel();
    const biology = screen.getByRole('button', { name: /Grade 9 Biology/ });
    expect(biology).toHaveAttribute('aria-pressed', 'false');
    fireEvent.click(biology);
    expect(onToggle).toHaveBeenCalledWith(books[0]);
    expect(biology).toHaveAttribute('aria-pressed', 'true');
    expect(screen.getByText('1 textbook selected for lesson planning')).toBeInTheDocument();
    fireEvent.click(biology);
    expect(biology).toHaveAttribute('aria-pressed', 'false');
  });

  it('filters by book title without clearing a selected book', () => {
    renderPanel();
    fireEvent.click(screen.getByRole('button', { name: /Grade 9 Biology/ }));
    fireEvent.change(screen.getByRole('searchbox'), { target: { value: 'ENGLISH' } });
    expect(screen.queryByRole('button', { name: /Grade 9 Biology/ })).not.toBeInTheDocument();
    expect(screen.getByRole('button', { name: /Grade 10 English/ })).toBeInTheDocument();
    expect(screen.getByText('1 textbook selected for lesson planning')).toBeInTheDocument();
  });

  it('offers selection of available books without an upload control', () => {
    const { container } = renderPanel();
    expect(screen.getByRole('button', { name: /Grade 9 Biology/ })).toBeEnabled();
    expect(screen.getByRole('button', { name: /Grade 10 English/ })).toBeEnabled();
    expect(screen.queryByRole('button', { name: /Upload.*textbook/i })).not.toBeInTheDocument();
    expect(container.querySelector('input[type="file"]')).not.toBeInTheDocument();
  });

  it('requires a selected textbook and topic before generating a plan', () => {
    const { onGenerate } = renderPanel();
    const generate = screen.getByRole('button', { name: 'Create daily lesson plan' });
    expect(generate).toBeDisabled();
    fireEvent.change(screen.getByLabelText('Topic, unit, or section'), {
      target: { value: 'Microscope and its uses' },
    });
    expect(generate).toBeDisabled();
    fireEvent.click(screen.getByRole('button', { name: /Grade 9 Biology/ }));
    expect(generate).toBeEnabled();
    fireEvent.click(generate);
    expect(onGenerate).toHaveBeenCalledTimes(1);
  });

  it.each([{ busy: true }, { uploading: true }, { canAttach: false }])(
    'prevents generation when the chat cannot accept attachments: %p',
    (flags) => {
      renderPanel({
        ...flags,
        selectedIds: new Set(['biology']),
        details: { topic: 'Cells', grade: '9', duration: '40', date: '' },
      });
      expect(screen.getByRole('button', { name: 'Create daily lesson plan' })).toBeDisabled();
    },
  );

  it('keeps unreadable documents out of the selection', () => {
    renderPanel({ files: [{ ...books[0], llmDeliveryPath: 'none' }] });
    expect(screen.getByRole('button', { name: /Grade 9 Biology/ })).toBeDisabled();
    expect(screen.getByText('This file cannot be used as model context.')).toBeInTheDocument();
  });

  it('selects indexed tool-only books and announces their ready status', () => {
    const { onToggle } = renderPanel({
      files: [{ ...books[0], embedded: true, llmDeliveryPath: 'none' }],
      canSearch: true,
    });
    const biology = screen.getByRole('button', { name: /Grade 9 Biology/ });
    expect(biology).toBeEnabled();
    expect(screen.getByText('Indexed · ready for File Search')).toBeInTheDocument();
    fireEvent.click(biology);
    expect(onToggle).toHaveBeenCalledTimes(1);
  });

  it('keeps agent books selectable while chat activity blocks personal attachments and generation', () => {
    const agentBook = {
      ...books[0],
      agentId: 'agent-a',
      embedded: true,
      llmDeliveryPath: 'none' as const,
    };
    const { onToggle, onGenerate } = renderPanel({
      files: [agentBook, books[1]],
      canSearch: true,
      busy: true,
      details: { topic: 'Cells', grade: '9', duration: '40', date: '' },
    });
    const textbook = screen.getByRole('button', { name: /Grade 9 Biology/ });
    const personal = screen.getByRole('button', { name: /Grade 10 English/ });
    expect(textbook).toBeEnabled();
    expect(personal).toBeDisabled();
    fireEvent.click(textbook);
    expect(textbook).toHaveAttribute('aria-pressed', 'true');
    expect(screen.getByRole('button', { name: 'Create daily lesson plan' })).toBeDisabled();
    fireEvent.click(personal);
    expect(onToggle).toHaveBeenCalledTimes(1);
    expect(onToggle).toHaveBeenCalledWith(agentBook);
    expect(onGenerate).not.toHaveBeenCalled();
    fireEvent.click(textbook);
    expect(textbook).toHaveAttribute('aria-pressed', 'false');
  });

  it('blocks all book selections during route navigation', () => {
    const { onToggle } = renderPanel({
      files: [
        { ...books[0], agentId: 'agent-a', embedded: true, llmDeliveryPath: 'none' },
        books[1],
      ],
      canSearch: true,
      selectionDisabled: true,
    });
    const textbook = screen.getByRole('button', { name: /Grade 9 Biology/ });
    const personal = screen.getByRole('button', { name: /Grade 10 English/ });
    expect(textbook).toBeDisabled();
    expect(personal).toBeDisabled();
    fireEvent.click(textbook);
    fireEvent.click(personal);
    expect(onToggle).not.toHaveBeenCalled();
  });

  it('uses agent knowledge without requiring attachment support or uploading its content', () => {
    renderPanel({
      files: [{ ...books[0], agentId: 'agent-a', embedded: true, llmDeliveryPath: 'none' }],
      selectedIds: new Set(['biology']),
      canSearch: true,
      canAttach: false,
      details: { topic: 'Cells', grade: '9', duration: '40', date: '' },
    });
    expect(screen.getByRole('button', { name: /Grade 9 Biology/ })).toBeEnabled();
    expect(screen.getByRole('button', { name: 'Create daily lesson plan' })).toBeEnabled();
    expect(screen.queryByRole('button', { name: 'Upload textbook' })).not.toBeInTheDocument();
    expect(screen.queryByText(translation.com_ui_textbooks_unsupported)).not.toBeInTheDocument();
  });

  it('requires File Search for an indexed textbook', () => {
    renderPanel({ files: [{ ...books[0], embedded: true, llmDeliveryPath: 'none' }] });
    expect(screen.getByRole('button', { name: /Grade 9 Biology/ })).toBeDisabled();
    expect(
      screen.getByText('Enable File Search for this agent to use indexed textbooks.'),
    ).toBeInTheDocument();
  });

  it('keeps own books visible when agent knowledge cannot load and offers retry', () => {
    const { onRetry } = renderPanel({ knowledgeFailed: true });
    expect(screen.getByRole('button', { name: /Grade 9 Biology/ })).toBeEnabled();
    expect(screen.getByRole('alert')).toHaveTextContent(
      'This agent’s textbooks could not be loaded',
    );
    fireEvent.click(screen.getByRole('button', { name: 'Retry' }));
    expect(onRetry).toHaveBeenCalledTimes(1);
  });

  it('offers retry after a file-list error', () => {
    const { onRetry } = renderPanel({ failed: true });
    expect(screen.getByRole('alert')).toHaveTextContent('Textbooks could not be loaded');
    fireEvent.click(screen.getByRole('button', { name: 'Retry' }));
    expect(onRetry).toHaveBeenCalledTimes(1);
  });

  it.each([{ failed: true }, { knowledgeFailed: true }])(
    'does not claim the library is empty when loading failed: %p',
    (failure) => {
      renderPanel({ ...failure, files: [] });
      expect(screen.getByRole('alert')).toBeInTheDocument();
      expect(screen.queryByText('No textbooks yet')).not.toBeInTheDocument();
      expect(
        screen.queryByText(translation.com_ui_textbooks_empty_description),
      ).not.toBeInTheDocument();
      expect(screen.queryByRole('list', { name: 'Available textbooks' })).not.toBeInTheDocument();
    },
  );

  it('shows no matching results when the successfully loaded books do not match the search', () => {
    renderPanel({ search: 'Mathematics' });
    expect(screen.getByText('No matching textbooks')).toBeInTheDocument();
    expect(screen.queryByText('No textbooks yet')).not.toBeInTheDocument();
  });

  it('does not present a failed library request as a search without results', () => {
    renderPanel({ knowledgeFailed: true, files: [], search: 'Mathematics' });
    expect(screen.getByRole('alert')).toBeInTheDocument();
    expect(screen.queryByText('No matching textbooks')).not.toBeInTheDocument();
  });

  it('announces loading and directs an empty library to the agent File Search settings', () => {
    const { unmount } = renderPanel({ loading: true, files: [] });
    expect(screen.getByText(translation.com_ui_loading)).toBeInTheDocument();
    unmount();
    renderPanel({ files: [] });
    expect(screen.getByText('No textbooks yet')).toBeInTheDocument();
    expect(
      screen.getByText(
        'Upload textbooks in the agent’s File Search settings, then select them here.',
      ),
    ).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Upload textbook' })).not.toBeInTheDocument();
  });

  it('closes the panel using its labeled control', () => {
    const { onClose } = renderPanel();
    fireEvent.click(screen.getByRole('button', { name: 'Close textbook panel' }));
    expect(onClose).toHaveBeenCalledTimes(1);
  });
});
