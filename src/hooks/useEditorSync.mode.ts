import type { EditorMode, ScrollRequestTarget, SplitSurface } from './useEditorSync.types';
import type { Dispatch, MutableRefObject, SetStateAction } from 'react';

type ApplyEditorModeTransitionOptions = {
  currentMode: EditorMode;
  nextMode: EditorMode;
  resolveMenuLineFromSurface: (surface: SplitSurface) => number;
  splitStoredLinesRef: MutableRefObject<{ editorLine: number; previewLine: number }>;
  setCurrentPreviewLine: Dispatch<SetStateAction<number | null>>;
  setCurrentEditorLine: Dispatch<SetStateAction<number | null>>;
  issueScrollSyncRequest: (payload: {
    target: ScrollRequestTarget;
    line: number;
    editorLine?: number;
    previewLine?: number;
    startColumn?: number;
    endColumn?: number;
  }) => void;
};

function isEditPanelMode(mode: EditorMode) {
  return mode === 'markdown' || mode === 'html' || mode === 'wysiwyg';
}

export function applyEditorModeTransition({
  currentMode,
  nextMode,
  resolveMenuLineFromSurface,
  splitStoredLinesRef,
  setCurrentPreviewLine,
  setCurrentEditorLine,
  issueScrollSyncRequest,
}: ApplyEditorModeTransitionOptions) {
  const prevIsEdit = isEditPanelMode(currentMode);
  const nextIsEdit = isEditPanelMode(nextMode);

  if (currentMode === 'split') {
    splitStoredLinesRef.current = {
      editorLine: resolveMenuLineFromSurface('Edit'),
      previewLine: resolveMenuLineFromSurface('Render'),
    };

    if (nextMode === 'render') {
      const targetLine = splitStoredLinesRef.current.previewLine;
      issueScrollSyncRequest({ target: 'Render', line: targetLine });
      setCurrentPreviewLine(targetLine);
    } else if (nextMode === 'markdown' || nextMode === 'html' || nextMode === 'wysiwyg') {
      const targetLine = splitStoredLinesRef.current.editorLine;
      issueScrollSyncRequest({ target: 'Edit', line: targetLine });
      setCurrentEditorLine(targetLine);
    }
    return;
  }

  if (nextMode === 'split') {
    let editorLine = resolveMenuLineFromSurface('Edit');
    let previewLine = resolveMenuLineFromSurface('Render');

    if (prevIsEdit) {
      editorLine = resolveMenuLineFromSurface('Edit');
      previewLine = editorLine;
    } else if (currentMode === 'render') {
      previewLine = resolveMenuLineFromSurface('Render');
      editorLine = previewLine;
    }

    issueScrollSyncRequest({
      target: 'Both',
      line: previewLine,
      editorLine,
      previewLine,
    });
    splitStoredLinesRef.current = { editorLine, previewLine };
    return;
  }

  if (prevIsEdit && nextMode === 'render') {
    const targetLine = resolveMenuLineFromSurface('Edit');
    setCurrentPreviewLine(targetLine);
    issueScrollSyncRequest({ target: 'Render', line: targetLine });
    return;
  }

  if (currentMode === 'render' && nextIsEdit) {
    const targetLine = resolveMenuLineFromSurface('Render');
    setCurrentEditorLine(targetLine);
    issueScrollSyncRequest({ target: 'Edit', line: targetLine });
    return;
  }

  if (prevIsEdit && nextIsEdit && currentMode !== nextMode) {
    const targetLine = resolveMenuLineFromSurface('Edit');
    issueScrollSyncRequest({ target: 'Edit', line: targetLine });
  }
}
