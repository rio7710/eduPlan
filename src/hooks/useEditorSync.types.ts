export type EditorMode = 'wysiwyg' | 'markdown' | 'html' | 'render' | 'split';
export type ScrollRequestTarget = 'Edit' | 'Render' | 'Both';
export type LocationSurface = 'Edit' | 'Render' | 'Menu' | null;
export type SplitSurface = 'Edit' | 'Render';

export type ScrollRequest = {
  line: number;
  endLine?: number;
  startColumn?: number;
  endColumn?: number;
  token: number;
  target?: ScrollRequestTarget;
  editorLine?: number;
  previewLine?: number;
};

export type SelectionRequest = {
  line: number;
  token: number;
};

export type SelectedPreviewLine = {
  line: number;
  endLine?: number;
  activeLine?: number;
  label: string;
};

export type EditorSyncViewId = 'welcome' | 'upload' | 'editor' | 'review' | 'dataset' | 'settings';

export function normalizeLine(line: number | null | undefined) {
  const numeric = Number(line);
  if (!Number.isFinite(numeric)) {
    return 1;
  }
  return Math.max(1, Math.floor(numeric));
}
