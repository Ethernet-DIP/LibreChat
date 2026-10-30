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
    onUpload: jest.fn(),
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
    expect(screen.getByText('1 textbook selected for your next message')).toBeInTheDocument();
    fireEvent.click(biology);
    expect(biology).toHaveAttribute('aria-pressed', 'false');
  });

  it('filters by book title without clearing a selected book', () => {
    renderPanel();
    fireEvent.click(screen.getByRole('button', { name: /Grade 9 Biology/ }));
    fireEvent.change(screen.getByRole('searchbox'), { target: { value: 'ENGLISH' } });
    expect(screen.queryByRole('button', { name: /Grade 9 Biology/ })).not.toBeInTheDocument();
    expect(screen.getByRole('button', { name: /Grade 10 English/ })).toBeInTheDocument();
    expect(screen.getByText('1 textbook selected for your next message')).toBeInTheDocument();
  });

  it('passes multiple selected documents to the upload flow and resets the picker', () => {
    const { container, onUpload } = renderPanel();
    const input = container.querySelector<HTMLInputElement>('input[type="file"]')!;
    const files = [new File(['book'], 'Biology.pdf', { type: 'application/pdf' })];
    expect(input).toHaveAttribute('multiple');
    expect(input.accept).toContain('.pdf');
    fireEvent.change(input, { target: { files } });
    expect(onUpload).toHaveBeenCalledWith(files);
    expect(input.value).toBe('');
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
      expect(
        screen.getByRole('button', { name: /Upload.*textbook|Uploading textbook/ }),
      ).toBeDisabled();
    },
  );

  it('keeps unreadable documents out of the selection', () => {
    renderPanel({ files: [{ ...books[0], llmDeliveryPath: 'none' }] });
    expect(screen.getByRole('button', { name: /Grade 9 Biology/ })).toBeDisabled();
    expect(screen.getByText('This file cannot be used as model context.')).toBeInTheDocument();
  });

  it('offers retry after a file-list error', () => {
    const { onRetry } = renderPanel({ failed: true });
    expect(screen.getByRole('alert')).toHaveTextContent('Textbooks could not be loaded');
    fireEvent.click(screen.getByRole('button', { name: 'Retry' }));
    expect(onRetry).toHaveBeenCalledTimes(1);
  });

  it('announces loading and shows an upload entry point for an empty library', () => {
    const { unmount } = renderPanel({ loading: true });
    expect(screen.getByText(translation.com_ui_loading)).toBeInTheDocument();
    unmount();
    renderPanel({ files: [] });
    expect(screen.getByText('No textbooks yet')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Upload textbook' })).toBeEnabled();
  });

  it('closes the panel using its labeled control', () => {
    const { onClose } = renderPanel();
    fireEvent.click(screen.getByRole('button', { name: 'Close textbook panel' }));
    expect(onClose).toHaveBeenCalledTimes(1);
  });
});
