import { atom } from 'jotai';
import { atomFamily } from 'jotai/utils';
import { createStorageAtom } from '~/store/jotai-utils';

export type LessonDetails = {
  topic: string;
  section: string;
  grade: string;
  duration: string;
  date: string;
};

export const desktopOpen = createStorageAtom('textbooks-panel-open', true);
export const mobileOpen = atom(false);
export const search = atom('');
export const details = atom<LessonDetails>({
  topic: '',
  section: '',
  grade: '',
  duration: '40',
  date: '',
});
export const operationError = atom<'send' | null>(null);

export const selectedKnowledge = atomFamily((scope: string) =>
  createStorageAtom<string[]>(`textbooks-selected-${encodeURIComponent(scope)}`, []),
);
