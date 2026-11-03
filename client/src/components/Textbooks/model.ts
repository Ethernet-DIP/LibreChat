import type { TAgentKnowledgeFile, TFile } from 'librechat-data-provider';

export type Textbook = Pick<
  TFile,
  | 'file_id'
  | 'filename'
  | 'type'
  | 'bytes'
  | 'embedded'
  | 'expiredAt'
  | 'llmDeliveryPath'
  | 'metadata'
> & {
  accountFile?: TFile;
  agentId?: string;
};

const documentTypes = new Set([
  'application/pdf',
  'application/msword',
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
  'application/rtf',
  'application/vnd.oasis.opendocument.text',
]);

export function isTextbook(file: Pick<TFile, 'filename' | 'type' | 'expiredAt'>): boolean {
  if (!file.filename?.trim()) {
    return false;
  }
  if (file.expiredAt != null) {
    const expiry = new Date(file.expiredAt).getTime();
    if (!Number.isFinite(expiry) || expiry <= Date.now()) {
      return false;
    }
  }
  return (
    file.type.startsWith('text/') ||
    documentTypes.has(file.type) ||
    /\.(pdf|docx?|txt|md|rtf|odt)$/i.test(file.filename)
  );
}

export function isIndexed(file: Pick<Textbook, 'embedded' | 'metadata'>): boolean {
  return file.embedded === true || (file.metadata?.embeddedEntities?.length ?? 0) > 0;
}

export function canUseTextbook(file: Textbook, canAttach: boolean, canSearch: boolean): boolean {
  if (!isTextbook(file)) {
    return false;
  }
  if (isIndexed(file)) {
    return canSearch && (file.agentId != null || canAttach);
  }
  return file.agentId == null && canAttach && file.llmDeliveryPath !== 'none';
}

export function mergeTextbooks(
  accountFiles: TFile[],
  knowledgeFiles: TAgentKnowledgeFile[],
  agentId?: string,
): Textbook[] {
  const files = new Map<string, Textbook>();
  for (const file of accountFiles) {
    if (isTextbook(file)) {
      files.set(file.file_id, { ...file, accountFile: file });
    }
  }
  for (const file of knowledgeFiles) {
    if (agentId != null && isTextbook(file)) {
      files.set(file.file_id, { ...file, agentId });
    }
  }
  return [...files.values()];
}
