import type { Dispatch, MutableRefObject, SetStateAction } from 'react';
import { useGlobalShortcuts } from '@/hooks/useGlobalShortcuts';
import type { EditorMode, LocationSurface, ScrollRequest, SelectedPreviewLine, SelectionRequest } from '@/hooks/useEditorSync.types';
import { nextIfChanged, patchIfChanged } from '@/utils/stateUtils';
type SearchMode = 'find' | 'replace';
type NavigateToLineOptions = {
  startColumn?: number;
  endColumn?: number;
  previewLabel?: string;
  selectPreviewLine?: boolean;
};

type ExplicitLocationSyncOptions = {
  lineNumber: number;
  startColumn?: number;
  endColumn?: number;
};

type UseAppCommandsParams = {
  activeView: string;
  editorMode: EditorMode;
  currentDocument: ShellDocument | null;
  openDocuments: Record<string, ShellDocument>;
  openView: (view: 'upload') => void;
  openShellDocument: (doc: ShellDocument) => void;
  updateCurrentDocumentContent: (content: string) => void;
  buildMonitorPayload: (params: {
    beforeContent: string;
    afterContent: string;
    documentPath?: string | null;
    documentName?: string | null;
    mode: EditorMode;
  }) => unknown;
  handleOpenFile: () => void | Promise<void>;
  handleOpenFolder: () => void | Promise<void>;
  handleSaveCurrentDocument: () => void | Promise<void>;
  handleSaveAsCurrentDocument: () => void | Promise<void>;
  setActivePanel: Dispatch<SetStateAction<'explorer' | 'md-menu' | 'search' | 'review' | 'dataset' | 'settings'>>;
  setSearchPanelState: Dispatch<SetStateAction<{ mode: SearchMode; scope: 'document' | 'folder'; query: string; replaceValue: string; selectedIndex: number }>>;
  setActiveView: Dispatch<SetStateAction<'welcome' | 'upload' | 'editor' | 'review' | 'dataset' | 'settings'>>;
  locationSurface: LocationSurface;
  setCurrentEditorLine: Dispatch<SetStateAction<number | null>>;
  setCurrentPreviewLine: Dispatch<SetStateAction<number | null>>;
  setCurrentRenderLocationLine: Dispatch<SetStateAction<number | null>>;
  splitStoredLinesRef: MutableRefObject<{ editorLine: number; previewLine: number }>;
  setSelectionRequest: Dispatch<SetStateAction<SelectionRequest | null>>;
  setSelectedPreviewLine: Dispatch<SetStateAction<SelectedPreviewLine | null>>;
  setScrollRequest: Dispatch<SetStateAction<ScrollRequest | null>>;
  normalizeSessionLine: (line: unknown) => number;
};
export function useAppCommands({
  activeView,
  editorMode,
  currentDocument,
  openDocuments,
  openView,
  openShellDocument,
  updateCurrentDocumentContent,
  buildMonitorPayload,
  handleOpenFile,
  handleOpenFolder,
  handleSaveCurrentDocument,
  handleSaveAsCurrentDocument,
  setActivePanel,
  setSearchPanelState,
  setActiveView,
  locationSurface,
  setCurrentEditorLine,
  setCurrentPreviewLine,
  setCurrentRenderLocationLine,
  splitStoredLinesRef,
  setSelectionRequest,
  setSelectedPreviewLine,
  setScrollRequest,
  normalizeSessionLine,
}: UseAppCommandsParams) {
  function emitEditorCommand(command: 'undo' | 'redo') {
    window.dispatchEvent(new CustomEvent('edufixer-editor-command', { detail: { command } }));
  }

  function handleUndoCommand() {
    if (activeView !== 'editor') {
      return;
    }
    if (editorMode === 'wysiwyg') {
      document.execCommand('undo');
      return;
    }
    emitEditorCommand('undo');
  }

  function handleRedoCommand() {
    if (activeView !== 'editor') {
      return;
    }
    if (editorMode === 'wysiwyg') {
      document.execCommand('redo');
      return;
    }
    emitEditorCommand('redo');
  }

  function openSearchPanel(mode: SearchMode) {
    if (activeView !== 'editor') {
      return;
    }
    setActivePanel('search');
    setSearchPanelState((current) => patchIfChanged(current, 'mode', mode));
  }
  const handleFindCommand = () => openSearchPanel('find');
  const handleReplaceCommand = () => openSearchPanel('replace');

  function handleContentChange(content: string) {
    if (currentDocument && currentDocument.content !== content) {
      const monitorPayload = buildMonitorPayload({
        beforeContent: currentDocument.content,
        afterContent: content,
        documentPath: currentDocument.filePath,
        documentName: currentDocument.fileName,
        mode: editorMode,
      });
      if (monitorPayload) {
        console.info('[js_change_monitor]', monitorPayload);
      }
    }
    updateCurrentDocumentContent(content);
  }

  function clearAllSelection() {
    setSelectionRequest(null);
    setSelectedPreviewLine(null);
    const browserSelection = window.getSelection();
    browserSelection?.removeAllRanges();
  }

  function syncExplicitLocationAcrossPanes({
    lineNumber,
    startColumn,
    endColumn,
  }: ExplicitLocationSyncOptions) {
    setCurrentEditorLine((current) => nextIfChanged(current, lineNumber));
    setCurrentPreviewLine((current) => nextIfChanged(current, lineNumber));
    setCurrentRenderLocationLine((current) => nextIfChanged(current, lineNumber));
    splitStoredLinesRef.current = {
      editorLine: normalizeSessionLine(lineNumber),
      previewLine: normalizeSessionLine(lineNumber),
    };

    if (editorMode === 'split') {
      setScrollRequest({
        line: lineNumber,
        startColumn,
        endColumn,
        token: Date.now(),
        target: 'Both',
        editorLine: lineNumber,
        previewLine: lineNumber,
      });
      return;
    }

    // Navigation-only changes in render mode should not force render-pane scrolling.
    // Keep render content stable until the user actually interacts with the render surface.
    if (editorMode === 'render') {
      return;
    }

    setScrollRequest({
      line: lineNumber,
      startColumn,
      endColumn,
      token: Date.now(),
      target: locationSurface === 'Render' ? 'Render' : 'Edit',
    });
  }

  function navigateToDocumentLine(lineNumber: number, options?: NavigateToLineOptions) {
    setActiveView('editor');
    setSelectionRequest({ line: lineNumber, token: Date.now() + Math.random() });
    if (options?.selectPreviewLine === false) {
      setSelectedPreviewLine(null);
    } else {
      setSelectedPreviewLine({
        line: lineNumber,
        endLine: lineNumber,
        activeLine: lineNumber,
        label: options?.previewLabel ?? `${lineNumber}행 선택`,
      });
    }

    syncExplicitLocationAcrossPanes({
      lineNumber,
      startColumn: options?.startColumn,
      endColumn: options?.endColumn,
    });
  }

  function jumpToSearchMatch(match: { lineNumber: number; start: number; end: number }) {
    navigateToDocumentLine(match.lineNumber, {
      startColumn: match.start,
      endColumn: match.end,
      previewLabel: `${match.lineNumber}행 검색 결과`,
      selectPreviewLine: false,
    });
  }

  async function openFileAndJumpToSearchMatch(match: FolderSearchMatch) {
    const doc =
      Object.values(openDocuments).find((item) => item.filePath === match.filePath) ??
      (await window.eduFixerApi?.openRecent(match.filePath)) ??
      null;
    if (!doc) {
      return;
    }

    openShellDocument(doc);
    setTimeout(() => {
      navigateToDocumentLine(match.lineNumber, {
        startColumn: match.start,
        endColumn: match.end,
        previewLabel: `${match.lineNumber}행 검색 결과`,
        selectPreviewLine: false,
      });
    }, 0);
  }

  useGlobalShortcuts({
    activeView,
    hasCurrentDocument: Boolean(currentDocument),
    onOpenUploadView: () => openView('upload'),
    onOpenFile: handleOpenFile,
    onOpenFolder: handleOpenFolder,
    onSave: handleSaveCurrentDocument,
    onSaveAs: handleSaveAsCurrentDocument,
    onUndo: handleUndoCommand,
    onRedo: handleRedoCommand,
    onFind: handleFindCommand,
    onReplace: handleReplaceCommand,
    onClearSelection: clearAllSelection,
  });

  return {
    handleUndoCommand,
    handleRedoCommand,
    handleFindCommand,
    handleReplaceCommand,
    handleContentChange,
    navigateToDocumentLine,
    syncExplicitLocationAcrossPanes,
    jumpToSearchMatch,
    openFileAndJumpToSearchMatch,
  };
}
