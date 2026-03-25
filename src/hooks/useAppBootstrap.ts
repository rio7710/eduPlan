import { useEffect, useEffectEvent } from 'react';
import type { EditorMode } from '@/hooks/useEditorSync.types';

type StoredEditorSession = {
  line: number | null;
  editorMode: EditorMode;
};

type UseAppBootstrapParams = {
  autoWrap: boolean;
  previewSelectionMode: 'block' | 'line' | 'text';
  currentDocumentFilePath?: string | null;
  currentEditorLine: number | null;
  editorMode: EditorMode;
  includeExplorerSubfolders: boolean;
  isEditableMode: (mode: EditorMode) => boolean;
  normalizeSessionLine: (line: unknown) => number;
  normalizeSessionEditorMode: (mode: unknown) => EditorMode;
  setEditorMode: (mode: EditorMode) => void;
  hydrateRecentDocuments: (docs: ShellDocument[]) => void;
  openShellDocument: (doc: ShellDocument, options?: { initialLine?: number }) => void;
  refreshPersistedExplorerFolder: (includeSubfolders?: boolean) => Promise<void> | void;
  refreshPersistedLogoReviewItems: () => Promise<void> | void;
  refreshSentenceReviewItems: () => Promise<void> | void;
  refreshMlDatasetStats: () => Promise<void> | void;
  refreshSyncStatus: () => Promise<void> | void;
};

const PREVIEW_SELECTION_MODE_STORAGE_KEY = 'eduplan-preview-selection-mode';
const LAST_ACTIVE_EDITOR_FILE_STORAGE_KEY = 'edufixer-last-active-editor-file';
const EDITOR_SESSION_MAP_STORAGE_KEY = 'edufixer-editor-session-map';

export function useAppBootstrap({
  autoWrap,
  previewSelectionMode,
  currentDocumentFilePath,
  currentEditorLine,
  editorMode,
  includeExplorerSubfolders,
  isEditableMode,
  normalizeSessionLine,
  normalizeSessionEditorMode,
  setEditorMode,
  hydrateRecentDocuments,
  openShellDocument,
  refreshPersistedExplorerFolder,
  refreshPersistedLogoReviewItems,
  refreshSentenceReviewItems,
  refreshMlDatasetStats,
  refreshSyncStatus,
}: UseAppBootstrapParams) {
  useEffect(() => {
    window.localStorage.setItem('eduplan-auto-wrap', autoWrap ? 'on' : 'off');
  }, [autoWrap]);

  useEffect(() => {
    window.localStorage.setItem(PREVIEW_SELECTION_MODE_STORAGE_KEY, previewSelectionMode);
  }, [previewSelectionMode]);

  useEffect(() => {
    if (!currentDocumentFilePath || !isEditableMode(editorMode)) {
      return;
    }
    window.localStorage.setItem(LAST_ACTIVE_EDITOR_FILE_STORAGE_KEY, currentDocumentFilePath);
  }, [currentDocumentFilePath, currentEditorLine, editorMode, isEditableMode, normalizeSessionLine]);

  const runRefreshEvent = useEffectEvent((includeSubfolders?: boolean) => {
    void refreshPersistedExplorerFolder(includeSubfolders);
    void refreshPersistedLogoReviewItems();
    void refreshSentenceReviewItems();
    void refreshMlDatasetStats();
    void refreshSyncStatus();
  });

  useEffect(() => {
    runRefreshEvent(includeExplorerSubfolders);
    const retryTimers = [
      window.setTimeout(() => runRefreshEvent(includeExplorerSubfolders), 300),
      window.setTimeout(() => runRefreshEvent(includeExplorerSubfolders), 1200),
    ];
    return () => {
      retryTimers.forEach((timer) => window.clearTimeout(timer));
    };
  }, [includeExplorerSubfolders]);

  const loadShellStateAndRestoreEditorSession = useEffectEvent(async (disposedRef: { current: boolean }) => {
    const shellState = await window.eduFixerApi?.getShellState();
    if (disposedRef.current || !shellState) {
      return;
    }
    hydrateRecentDocuments(shellState.recentDocuments);

    const lastActiveFilePath = window.localStorage.getItem(LAST_ACTIVE_EDITOR_FILE_STORAGE_KEY);
    if (!lastActiveFilePath) {
      return;
    }

    let sessionMap: Record<string, StoredEditorSession> | null = null;
    try {
      const rawMap = window.localStorage.getItem(EDITOR_SESSION_MAP_STORAGE_KEY);
      sessionMap = rawMap ? JSON.parse(rawMap) as Record<string, StoredEditorSession> : null;
    } catch {
      sessionMap = null;
    }

    const session = sessionMap?.[lastActiveFilePath] ?? null;
    if (!session) {
      return;
    }

    const reopened = await window.eduFixerApi?.openRecent(lastActiveFilePath);
    if (disposedRef.current || !reopened) {
      return;
    }

    const restoreMode = normalizeSessionEditorMode(session.editorMode);
    const restoreLine = normalizeSessionLine(session.line);
    setEditorMode(restoreMode);
    openShellDocument(reopened, { initialLine: restoreLine });
  });

  useEffect(() => {
    const disposedRef = { current: false };
    void loadShellStateAndRestoreEditorSession(disposedRef);
    return () => {
      disposedRef.current = true;
    };
  }, []);

  useEffect(() => {
    const handleWindowFocus = () => {
      runRefreshEvent();
    };

    window.addEventListener('focus', handleWindowFocus);
    return () => {
      window.removeEventListener('focus', handleWindowFocus);
    };
  }, []);
}
