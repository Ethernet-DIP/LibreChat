import React from 'react';
import { createInstance } from 'i18next';
import { I18nextProvider } from 'react-i18next';
import { render, screen, fireEvent, within } from '@testing-library/react';
import type { ExtendedFile } from '~/common';
import translation from '~/locales/en/translation.json';
import Knowledge from '../Knowledge';

jest.mock('~/hooks', () => ({
  useLocalize: jest.requireActual('~/hooks/useLocalize').default,
}));

const i18n = createInstance();
void i18n.init({
  lng: 'en',
  fallbackLng: 'en',
  resources: { en: { translation } },
  interpolation: { escapeValue: false },
});

const biology: ExtendedFile = {
  file_id: 'biology',
  filename: 'Grade 9 Biology Student Textbook.pdf',
  type: 'application/pdf',
  size: 40_000_000,
  progress: 1,
};
const mathematics: ExtendedFile = {
  ...biology,
  file_id: 'mathematics',
  filename: 'Mathematics.pdf',
};

function renderKnowledge(overrides: Partial<React.ComponentProps<typeof Knowledge>> = {}) {
  const props: React.ComponentProps<typeof Knowledge> = {
    files: [[biology.file_id, biology]],
    loading: false,
    failed: false,
    canSearch: true,
    onRetry: jest.fn(),
    onManage: jest.fn(),
    ...overrides,
  };
  const content = (values: typeof props) => (
    <I18nextProvider i18n={i18n}>
      <Knowledge {...values} />
    </I18nextProvider>
  );
  const result = render(content(props));
  return {
    ...result,
    ...props,
    update: (values: Partial<typeof props>) => result.rerender(content({ ...props, ...values })),
  };
}

describe('agent textbook list', () => {
  it('shows every uploaded textbook with its full name and ready status', () => {
    renderKnowledge({
      files: [
        [biology.file_id, biology],
        [mathematics.file_id, mathematics],
      ],
    });
    const books = screen.getByRole('list', { name: 'Available textbooks' });
    expect(within(books).getAllByRole('listitem')).toHaveLength(2);
    expect(within(books).getByText(biology.filename!)).toBeInTheDocument();
    expect(within(books).getByText(mathematics.filename!)).toBeInTheDocument();
    expect(within(books).getAllByText('Indexed · ready for File Search')).toHaveLength(2);
    expect(screen.getByText('2 textbooks uploaded to this agent')).toBeInTheDocument();
  });

  it('updates the visible books and count after upload or removal', () => {
    const { update } = renderKnowledge();
    expect(screen.getByText('1 textbook uploaded to this agent')).toBeInTheDocument();
    update({ files: [[mathematics.file_id, mathematics]] });
    expect(screen.queryByText(biology.filename!)).not.toBeInTheDocument();
    expect(screen.getByText(mathematics.filename!)).toBeInTheDocument();
    update({ files: [] });
    expect(screen.getByText('No textbooks yet')).toBeInTheDocument();
    expect(screen.queryByRole('list')).not.toBeInTheDocument();
  });

  it('shows loading and recoverable failure without claiming the library is empty', () => {
    const { update, onRetry } = renderKnowledge({ files: [], loading: true });
    expect(screen.getByRole('region', { name: 'Textbooks' })).toHaveAttribute('aria-busy', 'true');
    expect(screen.getByRole('status')).toHaveTextContent('Loading agent textbooks');
    expect(screen.queryByText('No textbooks yet')).not.toBeInTheDocument();
    update({ files: [], loading: false, failed: true });
    expect(screen.getByRole('alert')).toHaveTextContent(
      'This agent’s textbooks could not be loaded',
    );
    expect(screen.queryByText('No textbooks yet')).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Retry' }));
    expect(onRetry).toHaveBeenCalledTimes(1);
  });

  it('opens the existing textbook manager and keeps the list visible during refresh errors', () => {
    const { onManage } = renderKnowledge({ failed: true });
    expect(screen.getByText(biology.filename!)).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Manage textbooks' }));
    expect(onManage).toHaveBeenCalledTimes(1);
  });

  it('identifies a pending upload without marking it ready for search', () => {
    renderKnowledge({ files: [[biology.file_id, { ...biology, progress: 0.4 }]] });
    expect(screen.getByText('Uploading and indexing textbook…')).toBeInTheDocument();
    expect(screen.queryByText('Indexed · ready for File Search')).not.toBeInTheDocument();
  });

  it('keeps uploaded books visible when File Search is unavailable without marking them ready', () => {
    renderKnowledge({ canSearch: false, onManage: undefined });
    expect(screen.getByText(biology.filename!)).toBeInTheDocument();
    expect(
      screen.getByText('Enable File Search for this agent to use indexed textbooks.'),
    ).toBeInTheDocument();
    expect(screen.queryByText('Indexed · ready for File Search')).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Manage textbooks' })).not.toBeInTheDocument();
  });
});
