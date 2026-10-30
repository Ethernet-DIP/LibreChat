import { isTextbook } from '../model';

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
});
