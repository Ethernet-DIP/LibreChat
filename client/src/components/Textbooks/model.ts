import type { TFile } from 'librechat-data-provider';

export const textbookAccept = '.pdf,.doc,.docx,.txt,.md,.rtf,.odt';

const documentTypes = new Set([
  'application/pdf',
  'application/msword',
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
  'application/rtf',
  'application/vnd.oasis.opendocument.text',
]);

export function isTextbook(file: Pick<TFile, 'filename' | 'type' | 'expiredAt'>): boolean {
  return (
    !file.expiredAt &&
    (file.type.startsWith('text/') ||
      documentTypes.has(file.type) ||
      /\.(pdf|docx?|txt|md|rtf|odt)$/i.test(file.filename))
  );
}
