import {
  selectFileSearchFiles,
  getSelectedFileSearchIds,
  persistedFileSearchSelectionFields,
} from './selection';

describe('File Search selection', () => {
  const files = [
    { file_id: 'knowledge-a', fromAgent: true, filename: 'A.pdf' },
    { file_id: 'knowledge-b', fromAgent: true, filename: 'B.pdf' },
    { file_id: 'attachment', fromAgent: false, filename: 'Attached.pdf' },
  ];

  it('preserves the authorized search set when no selection was provided', () => {
    expect(selectFileSearchFiles(files, undefined, 'agent')).toEqual(files);
    expect(getSelectedFileSearchIds(undefined, 'agent')).toBeUndefined();
  });

  it('narrows authorized files without changing their namespace or record identity', () => {
    const selected = selectFileSearchFiles(
      files,
      { agentId: 'agent', fileIds: ['knowledge-b', 'untrusted-file'] },
      'agent',
    );

    expect(selected).toEqual([files[1]]);
    expect(selected[0]).toBe(files[1]);
    expect(selected[0].fromAgent).toBe(true);
  });

  it('retains the user namespace when selecting an authorized user attachment', () => {
    const selected = selectFileSearchFiles(
      files,
      { agentId: 'agent', fileIds: ['attachment'] },
      'agent',
    );
    expect(selected).toEqual([files[2]]);
    expect(selected[0].fromAgent).toBe(false);
  });

  it('treats an explicit empty selection as no searchable files', () => {
    expect(selectFileSearchFiles(files, { agentId: 'agent', fileIds: [] }, 'agent')).toEqual([]);
  });

  it('does not apply one agent’s selection to a handoff agent', () => {
    expect(
      selectFileSearchFiles(files, { agentId: 'agent', fileIds: ['knowledge-b'] }, 'handoff'),
    ).toEqual(files);
    expect(getSelectedFileSearchIds({ agentId: 'agent', fileIds: [] }, 'handoff')).toBeUndefined();
  });

  it.each([
    null,
    'knowledge-a',
    {},
    { fileIds: [] },
    { agentId: 'agent' },
    { agentId: 'agent', fileIds: [1] },
  ])('fails closed for malformed selection %j', (selection) => {
    expect(selectFileSearchFiles(files, selection, 'agent')).toEqual([]);
    expect(getSelectedFileSearchIds(selection, 'agent')).toEqual([]);
  });

  it('queries duplicate file IDs only once and preserves the first namespace classification', () => {
    const input = [...files, { ...files[0], fromAgent: false }];
    expect(selectFileSearchFiles(input, undefined, 'agent')).toEqual(files);
    expect(
      getSelectedFileSearchIds(
        { agentId: 'agent', fileIds: ['knowledge-a', 'knowledge-a'] },
        'agent',
      ),
    ).toEqual(['knowledge-a']);
  });

  it('skips absent records without changing the other authorized files', () => {
    expect(selectFileSearchFiles([null, ...files, undefined], undefined, 'agent')).toEqual(files);
  });

  it('makes a separate copy for message persistence', () => {
    const selection = { agentId: 'agent', fileIds: ['knowledge-a'] };
    const stored = persistedFileSearchSelectionFields(selection);

    expect(stored).toEqual({ fileSearchSelection: selection });
    expect(stored.fileSearchSelection?.fileIds).not.toBe(selection.fileIds);
    selection.fileIds.push('knowledge-b');
    expect(stored.fileSearchSelection?.fileIds).toEqual(['knowledge-a']);
  });

  it.each([undefined, null, {}, { agentId: 'agent', fileIds: false }])(
    'does not persist malformed or missing selection %j',
    (selection) => {
      expect(persistedFileSearchSelectionFields(selection)).toEqual({});
    },
  );
});
