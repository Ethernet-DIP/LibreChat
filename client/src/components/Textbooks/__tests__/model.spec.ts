import type { TFile, TAgentKnowledgeFile } from 'librechat-data-provider';
import { isTextbook, isIndexed, canUseTextbook, mergeTextbooks } from '../model';

describe('textbook library eligibility', () => {
  it.each([
    { filename: 'Biology.pdf', type: 'application/pdf' },
    { filename: 'English.DOCX', type: 'application/octet-stream' },
    { filename: 'Lesson plan', type: 'text/plain' },
    { filename: 'Mathematics.odt', type: 'application/vnd.oasis.opendocument.text' },
  ])('includes readable document formats: $filename', (file) => {
    expect(isTextbook(file)).toBe(true);
  });

  it.each([
    { filename: 'photo.png', type: 'image/png' },
    { filename: 'audio.mp3', type: 'audio/mpeg' },
    { filename: 'archive.zip', type: 'application/zip' },
    { filename: 'Biology.pdf', type: 'application/pdf', expiredAt: '2026-10-30' },
  ])('excludes media, archives, and expired books: $filename', (file) => {
    expect(isTextbook(file)).toBe(false);
  });

  it.each(['', ' ', '\t\n'])('excludes empty or whitespace-only document names: %j', (filename) => {
    expect(isTextbook({ filename, type: 'application/pdf' })).toBe(false);
  });

  it.each(['2999-01-01T00:00:00.000Z', new Date('2999-01-01T00:00:00.000Z'), null])(
    'includes books before their retention deadline: %s',
    (expiredAt) => {
      expect(isTextbook({ filename: 'Biology.pdf', type: 'application/pdf', expiredAt })).toBe(
        true,
      );
    },
  );

  it.each(['2000-01-01T00:00:00.000Z', 'invalid-date', new Date('invalid-date')])(
    'excludes past or invalid retention deadlines: %s',
    (expiredAt) => {
      expect(isTextbook({ filename: 'Biology.pdf', type: 'application/pdf', expiredAt })).toBe(
        false,
      );
    },
  );

  it('expires books when their retention deadline is reached', () => {
    const expiredAt = '2026-11-03T12:00:00.000Z';
    jest.spyOn(Date, 'now').mockReturnValue(new Date(expiredAt).getTime());
    expect(isTextbook({ filename: 'Biology.pdf', type: 'application/pdf', expiredAt })).toBe(false);
  });
});

const accountBook: TFile = {
  file_id: 'biology',
  user: 'teacher',
  filename: 'Biology.pdf',
  type: 'application/pdf',
  bytes: 40_000_000,
  embedded: true,
  filepath: '/uploads/biology.pdf',
  object: 'file',
  usage: 0,
  llmDeliveryPath: 'none',
};
const knowledgeBook: TAgentKnowledgeFile = {
  file_id: 'biology',
  filename: 'Biology.pdf',
  type: 'application/pdf',
  bytes: 40_000_000,
  embedded: true,
  llmDeliveryPath: 'none',
};

describe('indexed textbook sources', () => {
  it('deduplicates agent knowledge and own files while retaining the agent namespace', () => {
    const books = mergeTextbooks([accountBook], [knowledgeBook], 'agent-a');
    expect(books).toEqual([{ ...knowledgeBook, agentId: 'agent-a' }]);
    expect(books[0]).not.toHaveProperty('accountFile');
    expect(books[0]).not.toHaveProperty('filepath');
  });

  it('omits expired books and ignores knowledge without its active agent', () => {
    expect(mergeTextbooks([{ ...accountBook, expiredAt: '2026-01-01' }], [], 'agent-a')).toEqual(
      [],
    );
    expect(mergeTextbooks([], [knowledgeBook])).toEqual([]);
  });

  it('omits unnamed books from personal files and agent knowledge', () => {
    expect(
      mergeTextbooks(
        [{ ...accountBook, filename: '' }],
        [{ ...knowledgeBook, filename: '  ' }],
        'agent-a',
      ),
    ).toEqual([]);
  });

  it('allows indexed metadata without model attachment support', () => {
    const [book] = mergeTextbooks([], [knowledgeBook], 'agent-a');
    expect(canUseTextbook(book, false, true)).toBe(true);
    expect(canUseTextbook(book, true, false)).toBe(false);
  });

  it('recognizes namespace embeddings and rejects unindexed tool-only books', () => {
    expect(isIndexed({ embedded: false, metadata: { embeddedEntities: ['agent-a'] } })).toBe(true);
    expect(canUseTextbook({ ...accountBook, embedded: false }, true, true)).toBe(false);
  });
});
