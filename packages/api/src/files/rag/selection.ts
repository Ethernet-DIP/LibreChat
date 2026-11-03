import { fileSearchSelectionSchema } from 'librechat-data-provider';
import type { TFileSearchSelection } from 'librechat-data-provider';

/** An omitted scope preserves normal search; invalid input cannot widen it. */
export function getSelectedFileSearchIds(
  selection: unknown,
  agentId: string | undefined,
): string[] | undefined {
  if (selection === undefined) {
    return undefined;
  }
  const parsed = fileSearchSelectionSchema.safeParse(selection);
  if (!parsed.success) {
    return [];
  }
  if (parsed.data.agentId !== agentId) {
    return undefined;
  }
  return [...new Set(parsed.data.fileIds)];
}

/** Retains server-authorized records and their original namespace classification. */
export function selectFileSearchFiles<T extends { file_id: string }>(
  files: readonly (T | null | undefined)[],
  selection: unknown,
  agentId: string | undefined,
): T[] {
  const selectedIds = getSelectedFileSearchIds(selection, agentId);
  const allowedIds = selectedIds === undefined ? undefined : new Set(selectedIds);
  const seen = new Set<string>();
  return files.filter((file): file is T => {
    if (
      !file ||
      !file.file_id ||
      seen.has(file.file_id) ||
      (allowedIds && !allowedIds.has(file.file_id))
    ) {
      return false;
    }
    seen.add(file.file_id);
    return true;
  });
}

/** Copies validated scope into message persistence without retaining request-owned arrays. */
export function persistedFileSearchSelectionFields(raw: unknown): {
  fileSearchSelection?: TFileSearchSelection;
} {
  const parsed = fileSearchSelectionSchema.safeParse(raw);
  if (!parsed.success) {
    return {};
  }
  return {
    fileSearchSelection: { agentId: parsed.data.agentId, fileIds: [...parsed.data.fileIds] },
  };
}
