import { useEffect, useRef, useState, type DragEvent } from 'react';
import { ActivityBar } from '@/components/mirror/ActivityBar';
import { ComponentMap } from '@/components/mirror/ComponentMap';
import { ExplorerPanel } from '@/components/mirror/panels/ExplorerPanel';
import { DatasetPanel } from '@/components/mirror/panels/DatasetPanel';
import { MdMenuPanel } from '@/components/mirror/panels/MdMenuPanel';
import { ReviewPanel } from '@/components/mirror/panels/ReviewPanel';
import { SearchPanel, type SearchMode, type SearchScope } from '@/components/mirror/panels/SearchPanel';
import { SettingsPanel } from '@/components/mirror/panels/SettingsPanel';
import { ModalOverlay } from '@/components/mirror/ModalOverlay';
import { StatusBar } from '@/components/mirror/StatusBar';
import { TabsBar } from '@/components/mirror/TabsBar';
import { TitleBar } from '@/components/mirror/TitleBar';
import { ToastLayer } from '@/components/mirror/ToastLayer';
import { EditorView } from '@/components/mirror/views/EditorView';
import { DatasetView } from '@/components/mirror/views/DatasetView';
import { ReviewView } from '@/components/mirror/views/ReviewView';
import { SettingsView } from '@/components/mirror/views/SettingsView';
import { UploadView } from '@/components/mirror/views/UploadView';
import { WelcomeView } from '@/components/mirror/views/WelcomeView';
import { defaultFontSettings, readStoredFontSettings, resolveFontColor, type FontSettings } from '@/lib/fontSettings';
import { getCollapsedHeadingOwnerLine } from '@/lib/headingSections';
import { getFileIcon } from '@/utils/fileIcon';

export type PanelId = 'explorer' | 'md-menu' | 'search' | 'review' | 'dataset' | 'settings';
export type ViewId = 'welcome' | 'upload' | 'editor' | 'review' | 'dataset' | 'settings';
export type EditorMode = 'wysiwyg' | 'markdown' | 'html' | 'preview' | 'split';
export type PreviewSelectionMode = 'block' | 'line' | 'text';
type ScrollRequestTarget = 'Edit' | 'View' | 'Both';
const TRAINING_ACCESS_PASSWORD = 'jung25)(';
const PREVIEW_SELECTION_MODE_STORAGE_KEY = 'eduplan-preview-selection-mode';
const LAST_EDITOR_SESSION_STORAGE_KEY = 'eduplan-last-editor-session';
const SIDEBAR_WIDTH_STORAGE_KEY = 'eduplan-sidebar-width';
const LAST_EXPLORER_FOLDER_PATH_STORAGE_KEY = 'eduplan-last-explorer-folder-path';
const EXPLORER_INCLUDE_SUBFOLDERS_STORAGE_KEY = 'eduplan-explorer-include-subfolders';

type StoredEditorSession = {
  filePath: string;
  line: number | null;
  editorMode: EditorMode;
};

function isEditableMode(mode: EditorMode) {
  return mode === 'markdown' || mode === 'html' || mode === 'wysiwyg' || mode === 'split';
}

function normalizeSessionLine(line: unknown) {
  const numeric = Number(line);
  if (!Number.isFinite(numeric)) {
    return 1;
  }
  return Math.max(1, Math.floor(numeric));
}

function normalizeSessionEditorMode(mode: unknown): EditorMode {
  if (mode === 'markdown' || mode === 'html' || mode === 'wysiwyg' || mode === 'split') {
    return mode;
  }
  return 'markdown';
}

type UiTab = {
  id: string;
  label: string;
  icon: string;
};

type SearchPanelState = {
  mode: SearchMode;
  scope: SearchScope;
  query: string;
  replaceValue: string;
  selectedIndex: number;
};

type UploadSelection = {
  fileName: string;
  filePath: string;
  fileSize?: string | null;
};

type UploadModel = 'local' | 'python' | 'claude' | 'gpt';

function getParentFolderPath(filePath: string | null | undefined) {
  if (!filePath) {
    return null;
  }

  const normalized = filePath.replace(/[\\/]+$/, '');
  const separators = [...normalized.matchAll(/[\\/]/g)];
  const lastSeparator = separators.at(-1);
  if (!lastSeparator) {
    return null;
  }

  return normalized.slice(0, lastSeparator.index);
}

function isPdfPath(filePath: string | null | undefined) {
  return String(filePath || '').toLowerCase().endsWith('.pdf');
}

function upsertRecentDocument(current: ShellDocument[], doc: ShellDocument) {
  const existingIndex = current.findIndex((item) => item.id === doc.id);
  if (existingIndex === -1) {
    return [...current, doc].slice(-30);
  }

  return current.map((item) => (item.id === doc.id ? doc : item));
}

export function App() {
  const [sidebarWidth, setSidebarWidth] = useState<number>(() => {
    const saved = Number(window.localStorage.getItem(SIDEBAR_WIDTH_STORAGE_KEY));
    return Number.isFinite(saved) && saved >= 220 ? saved : 340;
  });
  const [isSidebarResizing, setIsSidebarResizing] = useState(false);
  const [activePanel, setActivePanel] = useState<PanelId>('explorer');
  const [activeView, setActiveView] = useState<ViewId>('welcome');
  const [activeTab, setActiveTab] = useState('welcome');
  const [editorMode, setEditorMode] = useState<EditorMode>('preview');
  const [previewSelectionMode, setPreviewSelectionMode] = useState<PreviewSelectionMode>(() => {
    const savedMode = window.localStorage.getItem(PREVIEW_SELECTION_MODE_STORAGE_KEY);
    return savedMode === 'block' || savedMode === 'line' || savedMode === 'text' ? savedMode : 'text';
  });
  const [autoWrap, setAutoWrap] = useState<boolean>(() => window.localStorage.getItem('eduplan-auto-wrap') !== 'off');
  const [fontSettings, setFontSettings] = useState<FontSettings>(() => readStoredFontSettings());
  const [theme, setTheme] = useState<'dark' | 'light'>(() => {
    const savedTheme = window.localStorage.getItem('eduplan-theme');
    return savedTheme === 'light' || savedTheme === 'dark' ? savedTheme : 'dark';
  });
  const [recentDocuments, setRecentDocuments] = useState<ShellDocument[]>([]);
  const [includeExplorerSubfolders, setIncludeExplorerSubfolders] = useState<boolean>(() => {
    return window.localStorage.getItem(EXPLORER_INCLUDE_SUBFOLDERS_STORAGE_KEY) !== 'off';
  });
  const [explorerFolder, setExplorerFolder] = useState<OpenFolderResult | null>(null);
  const [currentDocument, setCurrentDocument] = useState<ShellDocument | null>(null);
  const [openDocuments, setOpenDocuments] = useState<Record<string, ShellDocument>>({});
  const [scrollRequest, setScrollRequest] = useState<{ line: number; endLine?: number; startColumn?: number; endColumn?: number; token: number; target?: ScrollRequestTarget; editorLine?: number; previewLine?: number } | null>(null);
  const [selectionRequest, setSelectionRequest] = useState<{ line: number; token: number } | null>(null);
  const [selectedPreviewLine, setSelectedPreviewLine] = useState<{ line: number; endLine?: number; activeLine?: number; label: string } | null>(null);
  const [searchPanelState, setSearchPanelState] = useState<SearchPanelState>({
    mode: 'find',
    scope: 'document',
    query: '',
    replaceValue: '',
    selectedIndex: 0,
  });
  const [uploadSelection, setUploadSelection] = useState<UploadSelection | null>(null);
  const [logoReviewItems, setLogoReviewItems] = useState<LogoReviewItem[]>([]);
  const [hierarchyReviewItems, setHierarchyReviewItems] = useState<HierarchyPatternReviewItem[]>([]);
  const [sentenceReviewItems, setSentenceReviewItems] = useState<SentenceEditReviewItem[]>([]);
  const [mlDatasetStats, setMlDatasetStats] = useState<MlDatasetStats | null>(null);
  const [syncStatus, setSyncStatus] = useState<SyncStatus | null>(null);
  const [toastMessage, setToastMessage] = useState<string | null>(null);
  const [isTrainingAccessOpen, setIsTrainingAccessOpen] = useState(false);
  const [isUnimplementedModalOpen, setIsUnimplementedModalOpen] = useState(false);
  const [isFileDragOverApp, setIsFileDragOverApp] = useState(false);
  const [trainingPassword, setTrainingPassword] = useState('');
  const [locationSurface, setLocationSurface] = useState<'Edit' | 'View' | 'Menu' | null>('View');
  const [currentEditorLine, setCurrentEditorLine] = useState<number | null>(null);
  const [currentPreviewLine, setCurrentPreviewLine] = useState<number | null>(null);
  const [collapsedHeadingLines, setCollapsedHeadingLines] = useState<number[]>([]);
  const [tabs, setTabs] = useState<UiTab[]>([{ id: 'welcome', label: '시작', icon: '🏠' }]);
  const splitSyncKeyRef = useRef<string>('');
  const locationTriggerRef = useRef<{ surface: 'Edit' | 'View'; kind: 'scroll' | 'keyboard'; at: number } | null>(null);
  const splitStoredLinesRef = useRef<{ editorLine: number; previewLine: number }>({ editorLine: 1, previewLine: 1 });
  const splitStoreSignalRef = useRef<{ surface: 'Edit' | 'View'; at: number } | null>(null);

  async function refreshPersistedExplorerFolder(includeSubfolders = includeExplorerSubfolders) {
    const savedFolderPath = window.localStorage.getItem(LAST_EXPLORER_FOLDER_PATH_STORAGE_KEY);
    if (!savedFolderPath) {
      setExplorerFolder(null);
      return;
    }

    const folder = await window.eduFixerApi?.openFolderPath(savedFolderPath, includeSubfolders);
    if (folder) {
      setExplorerFolder(folder);
      return;
    }

    setExplorerFolder(null);
  }

  async function refreshPersistedLogoReviewItems() {
    const savedFolderPath = window.localStorage.getItem(LAST_EXPLORER_FOLDER_PATH_STORAGE_KEY);
    if (!savedFolderPath || !window.eduFixerApi?.scanLogoReviewItems) {
      setLogoReviewItems([]);
      return;
    }

    const items = await window.eduFixerApi.scanLogoReviewItems(savedFolderPath, 'py_lgbm');
    setLogoReviewItems(items);
  }

  async function refreshSentenceReviewItems() {
    const items = await window.eduFixerApi?.getSentenceReviewItems();
    setSentenceReviewItems(items ?? []);
  }

  function mergeSavedReviewItems(items: ReviewItem[]) {
    if (!items.length) {
      return;
    }

    const hierarchyItems = items.filter(
      (item): item is HierarchyPatternReviewItem => item.type === 'hierarchy_pattern',
    );
    const sentenceItems = items.filter(
      (item): item is SentenceEditReviewItem => item.type === 'sentence_edit',
    );

    if (hierarchyItems.length) {
      setHierarchyReviewItems((current) => {
        const next = new Map(current.map((item) => [item.id, item]));
        hierarchyItems.forEach((item) => next.set(item.id, item));
        return [...next.values()];
      });
    }

    if (sentenceItems.length) {
      setSentenceReviewItems((current) => {
        const next = new Map(current.map((item) => [item.id, item]));
        sentenceItems.forEach((item) => next.set(item.id, item));
        return [...next.values()];
      });
    }
  }

  async function refreshMlDatasetStats() {
    const stats = await window.eduFixerApi?.getMlDatasetStats();
    setMlDatasetStats(stats ?? null);
  }

  async function refreshSyncStatus() {
    const status = await window.eduFixerApi?.getSyncStatus();
    setSyncStatus(status ?? null);
  }

  async function handleOpenMlDatasetRoot() {
    const result = await window.eduFixerApi?.openMlDatasetRoot();
    if (!result?.ok && result?.error) {
      window.alert(`저장 위치 열기 실패\n\n${result.error}`);
    }
  }

  async function handleExportMlDatasetZip() {
    const result = await window.eduFixerApi?.exportMlDatasetZip();
    if (!result || (result.error && result.error !== 'cancelled')) {
      window.alert(`ZIP 내보내기 실패\n\n${result?.error ?? '알 수 없는 오류'}`);
      return;
    }

    if (result.ok && result.zipPath) {
      window.alert(`ZIP 내보내기 완료\n\n${result.zipPath}`);
    }
  }

  async function handleQueueMlDatasetUpload() {
    const result = await window.eduFixerApi?.confirmMlDatasetResetFlow();
    if (!result) {
      return;
    }

    if (result.action === 'upload') {
      await refreshSyncStatus();
      window.alert('서버 이관 대상으로 예약했습니다.\n\n로컬 데이터는 유지되고 SQLite 큐에만 적재됩니다.');
      return;
    }

    if (result.error && result.error !== 'cancelled') {
      window.alert(`서버 이관 예약 실패\n\n${result.error}`);
    }
  }

  async function handleRunHierarchyCheck() {
    if (!currentDocument?.filePath?.toLowerCase().endsWith('.md')) {
      return;
    }

    try {
      const items = await window.eduFixerApi?.analyzeHierarchyPatterns(currentDocument.filePath);
      if (!items?.length) {
        window.alert('위계 패턴 후보를 찾지 못했습니다.');
        return;
      }

      setHierarchyReviewItems(items);
      setActivePanel('review');
      openView('review');
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      window.alert(`위계 패턴 분석 실패\n\n${message}`);
    }
  }

  function handleOpenTrainingAccess() {
    setTrainingPassword('');
    setIsTrainingAccessOpen(true);
  }

  function handleCloseTrainingAccess() {
    setTrainingPassword('');
    setIsTrainingAccessOpen(false);
  }

  function handleOpenUnimplementedModal() {
    setIsUnimplementedModalOpen(true);
  }

  function handleCloseUnimplementedModal() {
    setIsUnimplementedModalOpen(false);
  }

  async function handleDropOpenFiles(paths: string[]) {
    const uniquePaths = [...new Set(paths.map((value) => String(value || '').trim()).filter(Boolean))];
    if (!uniquePaths.length) {
      return;
    }

    for (const filePath of uniquePaths) {
      // eslint-disable-next-line no-await-in-loop
      await handleOpenRecent(filePath);
    }
    setToastMessage(uniquePaths.length > 1 ? `${uniquePaths.length}개 파일을 열었습니다.` : '파일을 열었습니다.');
  }

  function parseDroppedFilePaths(event: DragEvent<HTMLDivElement>) {
    const fromFiles = Array.from(event.dataTransfer.files ?? [])
      .map((file) => (file as File & { path?: string }).path)
      .filter((value): value is string => Boolean(value));

    if (fromFiles.length) {
      return fromFiles;
    }

    const uriList = event.dataTransfer.getData('text/uri-list');
    if (!uriList) {
      return [];
    }

    return uriList
      .split(/\r?\n/)
      .map((item) => item.trim())
      .filter(Boolean)
      .filter((item) => item.startsWith('file://'))
      .map((item) => {
        try {
          return decodeURIComponent(item.replace(/^file:\/+/, '').replace(/\//g, '\\'));
        } catch {
          return '';
        }
      })
      .filter(Boolean);
  }

  function handleSubmitTrainingAccess() {
    if (trainingPassword !== TRAINING_ACCESS_PASSWORD) {
      handleCloseTrainingAccess();
      window.alert('학습담당자만 학습이 가능합니다.');
      return;
    }

    handleCloseTrainingAccess();
    window.alert('학습 담당자 인증이 완료되었습니다.\n\n실제 학습 실행 연결은 다음 단계에서 붙입니다.');
  }

  function isEditPanelMode(mode: EditorMode) {
    return mode === 'markdown' || mode === 'html' || mode === 'wysiwyg';
  }

  function resolveLine(...candidates: Array<number | null | undefined>) {
    for (const candidate of candidates) {
      if (typeof candidate === 'number' && Number.isFinite(candidate) && candidate > 0) {
        return normalizeSessionLine(candidate);
      }
    }
    return 1;
  }

  function resolveSurfaceLine(surface: 'Edit' | 'View') {
    if (surface === 'Edit') {
      return resolveLine(currentEditorLine, splitStoredLinesRef.current.editorLine, currentPreviewLine);
    }
    return resolveLine(currentPreviewLine, splitStoredLinesRef.current.previewLine, currentEditorLine);
  }

  function resolveMenuLineFromSurface(surface: 'Edit' | 'View') {
    const base = resolveSurfaceLine(surface);
    const owner = getCollapsedHeadingOwnerLine(
      currentDocument?.content ?? '',
      base,
      collapsedHeadingLines,
    );
    return resolveLine(owner, base);
  }

  function issueScrollSyncRequest(payload: {
    target: ScrollRequestTarget;
    line: number;
    editorLine?: number;
    previewLine?: number;
    startColumn?: number;
    endColumn?: number;
  }) {
    setScrollRequest({
      line: payload.line,
      token: Date.now() + Math.random(),
      target: payload.target,
      editorLine: payload.editorLine,
      previewLine: payload.previewLine,
      startColumn: payload.startColumn,
      endColumn: payload.endColumn,
    });
  }

  function changeEditorMode(nextMode: EditorMode) {
    const prevMode = editorMode;
    const prevIsEdit = isEditPanelMode(prevMode);
    const nextIsEdit = isEditPanelMode(nextMode);

    if (prevMode === 'split') {
      splitStoredLinesRef.current = {
        editorLine: resolveMenuLineFromSurface('Edit'),
        previewLine: resolveMenuLineFromSurface('View'),
      };

      if (nextMode === 'preview') {
        const targetLine = splitStoredLinesRef.current.previewLine;
        issueScrollSyncRequest({ target: 'View', line: targetLine });
        setCurrentPreviewLine(targetLine);
      } else if (nextMode === 'markdown' || nextMode === 'html' || nextMode === 'wysiwyg') {
        const targetLine = splitStoredLinesRef.current.editorLine;
        issueScrollSyncRequest({ target: 'Edit', line: targetLine });
        setCurrentEditorLine(targetLine);
      }
    } else if (nextMode === 'split') {
      let editorLine = resolveMenuLineFromSurface('Edit');
      let previewLine = resolveMenuLineFromSurface('View');

      // When entering split from a single active mode, prefer that mode's live line
      // and mirror it to the other pane if counterpart line is missing/stale.
      if (prevIsEdit) {
        editorLine = resolveMenuLineFromSurface('Edit');
        previewLine = editorLine;
      } else if (prevMode === 'preview') {
        previewLine = resolveMenuLineFromSurface('View');
        editorLine = previewLine;
      }

      issueScrollSyncRequest({
        target: 'Both',
        line: previewLine,
        editorLine,
        previewLine,
      });
      splitStoredLinesRef.current = { editorLine, previewLine };
    } else if (prevIsEdit && nextMode === 'preview') {
      const targetLine = resolveMenuLineFromSurface('Edit');
      setCurrentPreviewLine(targetLine);
      issueScrollSyncRequest({ target: 'View', line: targetLine });
    } else if (prevMode === 'preview' && nextIsEdit) {
      const targetLine = resolveMenuLineFromSurface('View');
      setCurrentEditorLine(targetLine);
      issueScrollSyncRequest({ target: 'Edit', line: targetLine });
    } else if (prevIsEdit && nextIsEdit && prevMode !== nextMode) {
      const targetLine = resolveMenuLineFromSurface('Edit');
      issueScrollSyncRequest({ target: 'Edit', line: targetLine });
    }
    setEditorMode(nextMode);
    if (nextMode === 'preview') {
      setPreviewSelectionMode('block');
    }
  }

  useEffect(() => {
    document.body.classList.toggle('light-theme', theme === 'light');
    window.localStorage.setItem('eduplan-theme', theme);
  }, [theme]);

  useEffect(() => {
    window.localStorage.setItem('eduplan-auto-wrap', autoWrap ? 'on' : 'off');
  }, [autoWrap]);

  useEffect(() => {
    window.localStorage.setItem(PREVIEW_SELECTION_MODE_STORAGE_KEY, previewSelectionMode);
  }, [previewSelectionMode]);

  useEffect(() => {
    window.localStorage.setItem(SIDEBAR_WIDTH_STORAGE_KEY, String(Math.round(sidebarWidth)));
  }, [sidebarWidth]);

  useEffect(() => {
    window.localStorage.setItem(EXPLORER_INCLUDE_SUBFOLDERS_STORAGE_KEY, includeExplorerSubfolders ? 'on' : 'off');
  }, [includeExplorerSubfolders]);

  useEffect(() => {
    if (explorerFolder?.path) {
      window.localStorage.setItem(LAST_EXPLORER_FOLDER_PATH_STORAGE_KEY, explorerFolder.path);
    }
  }, [explorerFolder?.path]);

  useEffect(() => {
    if (!isSidebarResizing) {
      document.body.classList.remove('is-resizing');
      return;
    }

    document.body.classList.add('is-resizing');

    const handleMouseMove = (event: MouseEvent) => {
      const nextWidth = Math.max(220, Math.min(620, event.clientX - 60));
      setSidebarWidth(nextWidth);
    };

    const handleMouseUp = () => {
      setIsSidebarResizing(false);
    };

    window.addEventListener('mousemove', handleMouseMove);
    window.addEventListener('mouseup', handleMouseUp);
    return () => {
      document.body.classList.remove('is-resizing');
      window.removeEventListener('mousemove', handleMouseMove);
      window.removeEventListener('mouseup', handleMouseUp);
    };
  }, [isSidebarResizing]);

  useEffect(() => {
    if (!currentDocument?.filePath || !isEditableMode(editorMode)) {
      return;
    }

    const payload: StoredEditorSession = {
      filePath: currentDocument.filePath,
      line: normalizeSessionLine(currentEditorLine),
      editorMode,
    };
    window.localStorage.setItem(LAST_EDITOR_SESSION_STORAGE_KEY, JSON.stringify(payload));
  }, [currentDocument?.filePath, currentEditorLine, editorMode]);

  useEffect(() => {
    window.localStorage.setItem('eduplan-font-settings', JSON.stringify(fontSettings));

    const root = document.documentElement;
    const headingEntries = Object.entries(fontSettings.headings) as Array<[keyof FontSettings['headings'], FontSettings['headings'][keyof FontSettings['headings']]]>;
    headingEntries.forEach(([key, value]) => {
      root.style.setProperty(`--preview-${key}-font-family`, value.fontFamily);
      root.style.setProperty(`--preview-${key}-font-size`, `${value.fontSize}px`);
      root.style.setProperty(`--preview-${key}-color`, resolveFontColor(value.color, theme));
    });

    root.style.setProperty('--preview-ul-font-family', fontSettings.bullets.unordered.fontFamily);
    root.style.setProperty('--preview-ul-font-size', `${fontSettings.bullets.unordered.fontSize}px`);
    root.style.setProperty('--preview-ul-color', resolveFontColor(fontSettings.bullets.unordered.color, theme));
    root.style.setProperty('--preview-ol-font-family', fontSettings.bullets.ordered.fontFamily);
    root.style.setProperty('--preview-ol-font-size', `${fontSettings.bullets.ordered.fontSize}px`);
    root.style.setProperty('--preview-ol-color', resolveFontColor(fontSettings.bullets.ordered.color, theme));
  }, [fontSettings, theme]);

  useEffect(() => {
    const runStartupRefresh = () => {
      void refreshPersistedExplorerFolder(includeExplorerSubfolders);
      void refreshPersistedLogoReviewItems();
      void refreshSentenceReviewItems();
      void refreshMlDatasetStats();
      void refreshSyncStatus();
    };

    runStartupRefresh();
    const retryTimers = [
      window.setTimeout(runStartupRefresh, 300),
      window.setTimeout(runStartupRefresh, 1200),
    ];
    return () => {
      retryTimers.forEach((timer) => window.clearTimeout(timer));
    };
  }, []);

  useEffect(() => {
    let disposed = false;

    async function loadShellStateAndRestoreEditorSession() {
      const shellState = await window.eduFixerApi?.getShellState();
      if (disposed || !shellState) {
        return;
      }
      setRecentDocuments(shellState.recentDocuments);

      const raw = window.localStorage.getItem(LAST_EDITOR_SESSION_STORAGE_KEY);
      if (!raw) {
        return;
      }

      let session: StoredEditorSession | null = null;
      try {
        session = JSON.parse(raw) as StoredEditorSession;
      } catch {
        session = null;
      }

      if (!session?.filePath) {
        return;
      }

      const reopened = await window.eduFixerApi?.openRecent(session.filePath);
      if (disposed || !reopened) {
        return;
      }

      const restoreMode = normalizeSessionEditorMode(session.editorMode);
      const restoreLine = normalizeSessionLine(session.line);
      setEditorMode(restoreMode);
      openShellDocument(reopened, { initialLine: restoreLine });
    }

    void loadShellStateAndRestoreEditorSession();
    return () => {
      disposed = true;
    };
  }, []);

  useEffect(() => {
    const handleKeyDown = (event: KeyboardEvent) => {
      const isCommand = event.ctrlKey || event.metaKey;
      if (!isCommand) {
        return;
      }
      const key = event.key.toLowerCase();

      if (key === 'n') {
        event.preventDefault();
        openView('upload');
        return;
      }

      if (key === 'o') {
        event.preventDefault();
        if (event.shiftKey) {
          void handleOpenFolder();
          return;
        }
        void handleOpenFile();
        return;
      }

      if (activeView !== 'editor' || !currentDocument) {
        return;
      }

      if (key === 's') {
        event.preventDefault();
        if (event.shiftKey) {
          void handleSaveAsCurrentDocument();
          return;
        }
        void handleSaveCurrentDocument();
        return;
      }

      if (key === 'z') {
        event.preventDefault();
        if (event.shiftKey) {
          handleRedoCommand();
          return;
        }
        handleUndoCommand();
        return;
      }

      if (key === 'y') {
        event.preventDefault();
        handleRedoCommand();
        return;
      }

      if (key === 'f') {
        event.preventDefault();
        handleFindCommand();
        return;
      }

      if (key === 'h') {
        event.preventDefault();
        handleReplaceCommand();
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => {
      window.removeEventListener('keydown', handleKeyDown);
    };
  }, [activeView, currentDocument, editorMode]);

  useEffect(() => {
    const handleWindowFocus = () => {
      refreshPersistedExplorerFolder();
      refreshPersistedLogoReviewItems();
      refreshSentenceReviewItems();
      refreshMlDatasetStats();
      refreshSyncStatus();
    };

    window.addEventListener('focus', handleWindowFocus);
    return () => {
      window.removeEventListener('focus', handleWindowFocus);
    };
  }, []);

  useEffect(() => {
    if (!toastMessage) {
      return;
    }

    const timeout = window.setTimeout(() => setToastMessage(null), 2200);
    return () => window.clearTimeout(timeout);
  }, [toastMessage]);

  useEffect(() => {
    if (!scrollRequest) {
      return;
    }

    const token = scrollRequest.token;
    const timer = window.setTimeout(() => {
      setScrollRequest((current) => (current?.token === token ? null : current));
    }, 0);

    return () => window.clearTimeout(timer);
  }, [scrollRequest]);

  useEffect(() => {
    if (!selectionRequest) {
      return;
    }

    const token = selectionRequest.token;
    const timer = window.setTimeout(() => {
      setSelectionRequest((current) => (current?.token === token ? null : current));
    }, 0);

    return () => window.clearTimeout(timer);
  }, [selectionRequest]);

  function openView(view: ViewId, tabId: string = view) {
    if (view !== 'upload') {
      setUploadSelection(null);
    }
    setActiveView(view);
    setActiveTab(tabId);
  }

  function handleLocationSurfaceChange(next: 'Edit' | 'View' | 'Menu' | null) {
    setLocationSurface((current) => (current === next ? current : next));
  }

  useEffect(() => {
    if (activeView !== 'editor' || editorMode !== 'split' || !currentDocument) {
      splitSyncKeyRef.current = '';
      return;
    }

    if (locationSurface !== 'Edit' && locationSurface !== 'View') {
      return;
    }

    const trigger = locationTriggerRef.current;
    if (!trigger || trigger.surface !== locationSurface) {
      return;
    }
    if (Date.now() - trigger.at > 500) {
      return;
    }

    const sourceLine = resolveMenuLineFromSurface(locationSurface);
    if (!sourceLine || Number.isNaN(sourceLine)) {
      return;
    }

    const syncKey = `${currentDocument.id}:${locationSurface}:${sourceLine}`;
    if (splitSyncKeyRef.current === syncKey) {
      return;
    }
    splitSyncKeyRef.current = syncKey;

    setScrollRequest({
      line: sourceLine,
      token: Date.now() + Math.random(),
      target: locationSurface === 'View' ? 'Edit' : 'View',
    });
    locationTriggerRef.current = null;
  }, [activeView, currentDocument, currentEditorLine, currentPreviewLine, editorMode, locationSurface]);

  useEffect(() => {
    const signal = splitStoreSignalRef.current;
    if (!signal || Date.now() - signal.at > 700) {
      return;
    }
    if (signal.surface === 'Edit' && currentEditorLine) {
      splitStoredLinesRef.current.editorLine = normalizeSessionLine(currentEditorLine);
      splitStoreSignalRef.current = null;
      return;
    }
    if (signal.surface === 'View' && currentPreviewLine) {
      splitStoredLinesRef.current.previewLine = normalizeSessionLine(currentPreviewLine);
      splitStoreSignalRef.current = null;
    }
  }, [currentEditorLine, currentPreviewLine]);

  useEffect(() => {
    if (editorMode === 'preview') {
      setLocationSurface((current) => (current === 'View' ? current : 'View'));
      return;
    }
    if (editorMode === 'markdown' || editorMode === 'html' || editorMode === 'wysiwyg') {
      setLocationSurface((current) => (current === 'Edit' ? current : 'Edit'));
    }
  }, [editorMode]);

  useEffect(() => {
    if (activePanel !== 'md-menu') {
      return;
    }

    const hasMarkdownEditor =
      activeView === 'editor' &&
      Boolean(currentDocument?.fileName.toLowerCase().endsWith('.md'));
    if (!hasMarkdownEditor) {
      setActivePanel('explorer');
    }
  }, [activePanel, activeView, currentDocument?.fileName]);

  function ensureTab(tab: UiTab) {
    setTabs((current) => {
      if (current.some((item) => item.id === tab.id)) {
        return current;
      }
      return [...current, tab];
    });
  }

  function openShellDocument(doc: ShellDocument, options?: { initialLine?: number }) {
    const initialLine = normalizeSessionLine(options?.initialLine ?? 1);
    setOpenDocuments((current) => ({ ...current, [doc.id]: doc }));
    setCurrentDocument(doc);
    setCollapsedHeadingLines([]);
    setScrollRequest({ line: initialLine, token: Date.now() + Math.random() });
    setSelectionRequest(null);
    setSelectedPreviewLine(null);
    setCurrentEditorLine(initialLine);
    setCurrentPreviewLine(initialLine);
    splitStoredLinesRef.current = { editorLine: initialLine, previewLine: initialLine };
    setRecentDocuments((current) => upsertRecentDocument(current, doc));
    ensureTab({ id: doc.id, label: doc.fileName, icon: getFileIcon(doc.fileName) });
    openView('editor', doc.id);
  }

  function selectTab(tabId: string) {
    setActiveTab(tabId);
    if (tabId === 'welcome') {
      setActiveView('welcome');
      setCurrentDocument(null);
      return;
    }

    setActiveView('editor');
    const nextDoc =
      openDocuments[tabId] ??
      recentDocuments.find((doc) => doc.id === tabId) ??
      null;
    setCurrentDocument(nextDoc);
  }

  function handleCloseTab(tabId: string) {
    if (tabId === 'welcome') {
      return;
    }

    setTabs((current) => {
      const closingIndex = current.findIndex((tab) => tab.id === tabId);
      if (closingIndex === -1) {
        return current;
      }

      const nextTabs = current.filter((tab) => tab.id !== tabId);
      if (activeTab === tabId) {
        const fallbackTab =
          nextTabs[closingIndex] ??
          nextTabs[closingIndex - 1] ??
          nextTabs[0] ??
          null;

        if (fallbackTab) {
          selectTab(fallbackTab.id);
        }
      }

      return nextTabs;
    });

    setOpenDocuments((current) => {
      if (!(tabId in current)) {
        return current;
      }

      const next = { ...current };
      delete next[tabId];
      return next;
    });
  }

  async function handleOpenFile() {
    setUploadSelection(null);
    const doc = await window.eduFixerApi?.openFile();
    if (!doc) return;
    openShellDocument(doc);
  }

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

  function handleFindCommand() {
    if (activeView !== 'editor') {
      return;
    }
    setActivePanel('search');
    setSearchPanelState((current) => (current.mode === 'find' ? current : { ...current, mode: 'find' }));
  }

  function handleReplaceCommand() {
    if (activeView !== 'editor') {
      return;
    }
    setActivePanel('search');
    setSearchPanelState((current) => (current.mode === 'replace' ? current : { ...current, mode: 'replace' }));
  }

  async function handleSaveCurrentDocument() {
    if (!currentDocument) {
      return;
    }

    const saved = await window.eduFixerApi?.saveDocument({
      filePath: currentDocument.filePath,
      fileName: currentDocument.fileName,
      content: currentDocument.content,
    });
    if (!saved?.doc) {
      return;
    }
    const doc = saved.doc;

    applyUpdatedDocuments([doc]);
    ensureTab({ id: doc.id, label: doc.fileName, icon: getFileIcon(doc.fileName) });
    setActiveView('editor');
    setActiveTab(doc.id);
    mergeSavedReviewItems(saved.reviewItems);
    await refreshMlDatasetStats();
    setToastMessage(saved.editPatchCount > 0 ? `ML 데이터 패치 ${saved.editPatchCount}건 저장` : '저장됨');
  }

  async function handleSaveAsCurrentDocument() {
    if (!currentDocument) {
      return;
    }

    const saved = await window.eduFixerApi?.saveDocumentAs({
      filePath: currentDocument.filePath,
      fileName: currentDocument.fileName,
      content: currentDocument.content,
    });
    if (!saved?.doc) {
      return;
    }
    const doc = saved.doc;

    setOpenDocuments((current) => ({ ...current, [doc.id]: doc }));
    setRecentDocuments((current) => upsertRecentDocument(current, doc));
    setCurrentDocument(doc);
    ensureTab({ id: doc.id, label: doc.fileName, icon: getFileIcon(doc.fileName) });
    setActiveView('editor');
    setActiveTab(doc.id);
    mergeSavedReviewItems(saved.reviewItems);
    await refreshMlDatasetStats();
    setToastMessage(saved.editPatchCount > 0 ? `ML 데이터 패치 ${saved.editPatchCount}건 저장` : '다른 이름으로 저장됨');
  }

  function removeDocumentReferences(filePath: string) {
    setExplorerFolder((current) => {
      if (!current) {
        return current;
      }

      return {
        ...current,
        files: current.files.filter((file) => file.path !== filePath),
      };
    });

    setRecentDocuments((current) => current.filter((doc) => doc.filePath !== filePath));

    setOpenDocuments((current) => {
      const nextEntries = Object.entries(current).filter(([, doc]) => doc.filePath !== filePath);
      return Object.fromEntries(nextEntries);
    });

    setTabs((current) => {
      const nextTabs = current.filter((tab) => {
        const doc = openDocuments[tab.id];
        return tab.id === 'welcome' || (doc?.filePath ?? tab.id) !== filePath;
      });

      if (!nextTabs.some((tab) => tab.id === activeTab)) {
        setActiveTab('welcome');
        setActiveView('welcome');
      }

      return nextTabs.length ? nextTabs : [{ id: 'welcome', label: '시작', icon: '🏠' }];
    });

    setCurrentDocument((current) => (current?.filePath === filePath ? null : current));
  }

  async function handleOpenFolder() {
    const folder = await window.eduFixerApi?.openFolder();
    if (!folder) return;
    window.localStorage.setItem(LAST_EXPLORER_FOLDER_PATH_STORAGE_KEY, folder.path);
    const refreshedFolder = await window.eduFixerApi?.openFolderPath(folder.path, includeExplorerSubfolders);
    setExplorerFolder(refreshedFolder ?? folder);
    setActivePanel('explorer');
  }

  async function handleToggleExplorerSubfolders() {
    const next = !includeExplorerSubfolders;
    setIncludeExplorerSubfolders(next);
    await refreshPersistedExplorerFolder(next);
  }

  async function handleOpenRecent(filePath: string) {
    if (isPdfPath(filePath)) {
      setUploadSelection({
        fileName: filePath.split(/[\\/]/).pop() || filePath,
        filePath,
      });
      openView('upload');
      return;
    }

    const doc = await window.eduFixerApi?.openRecent(filePath);
    if (!doc) return;
    openShellDocument(doc);
  }

  async function handleDeleteExplorerFile(entry: FolderEntry | ShellDocument) {
    const filePath = 'path' in entry ? entry.path : entry.filePath;
    const fileName = 'name' in entry ? entry.name : entry.fileName;
    if (!filePath) {
      return;
    }

    const confirmed = window.confirm(`이 파일을 실제로 삭제할까요?\n\n${fileName}`);
    if (!confirmed) {
      return;
    }

    const result = await window.eduFixerApi?.deleteDocumentPath(filePath);
    if (!result?.ok) {
      return;
    }

    removeDocumentReferences(filePath);
    await refreshPersistedExplorerFolder();
  }

  async function handleOpenExplorerFile(entry: FolderEntry | ShellDocument) {
    if ('fileName' in entry) {
      if (!entry.filePath) return;
      await handleOpenRecent(entry.filePath);
      return;
    }

    if (entry.ext === '.pdf') {
      setUploadSelection({
        fileName: entry.name.split(/[\\/]/).pop() || entry.name,
        filePath: entry.path,
        fileSize: entry.size,
      });
      openView('upload');
      return;
    }

    const doc = await window.eduFixerApi?.openRecent(entry.path);
    if (!doc) return;
    openShellDocument(doc);
  }

  async function handleStartSelectedUploadFile(payload: { filePath: string; model: UploadModel; inferenceEngine: 'py_only' | 'py_lgbm'; sensitivity: 'low' | 'default' | 'high' }) {
    if (payload.model !== 'python') {
      return;
    }

    try {
      const result = await window.eduFixerApi?.convertPdfWithPython(payload.filePath, payload.inferenceEngine, payload.sensitivity);
      if (result?.error) {
        window.alert(`Python 변환 실패\n\n${result.error}`);
        return;
      }
      if (!result?.doc) {
        window.alert('Python 변환 결과를 찾지 못했습니다.');
        return;
      }

      await refreshPersistedExplorerFolder();
      await refreshPersistedLogoReviewItems();
      await refreshMlDatasetStats();
      await refreshSyncStatus();
      openShellDocument(result.doc);
      if (result.reviewItems.length) {
        setLogoReviewItems((current) => {
          const next = new Map(current.map((item) => [item.id, item]));
          result.reviewItems.forEach((item) => next.set(item.id, item));
          return [...next.values()];
        });
        setActivePanel('review');
        openView('review');
      }
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      window.alert(`Python 변환 실패\n\n${message}`);
    }
  }

  async function handleResolveLogoReviewItem(item: LogoReviewItem, action: 'approve' | 'reject') {
    const result = await window.eduFixerApi?.resolveLogoReviewItem({
      id: item.id,
      sourcePdfName: item.sourcePdfName,
      sourcePdfPath: item.sourcePdfPath,
      markdownPath: item.markdownPath,
      reviewDir: item.reviewDir,
      candidateCount: item.candidateCount,
      memberPaths: item.memberPaths,
      action,
    });
    if (!result?.ok) {
      return;
    }

    setLogoReviewItems((current) => {
      if (result.finalized) {
        return current.filter((entry) => entry.reviewDir !== item.reviewDir);
      }

      return current.filter((entry) => entry.id !== item.id);
    });

    if (result.finalized) {
      await refreshPersistedExplorerFolder();
      await refreshPersistedLogoReviewItems();
      await refreshMlDatasetStats();
      await refreshSyncStatus();
      setActivePanel('dataset');
      openView('dataset');
    }
  }

  async function handleResolveReviewItem(item: ReviewItem, action: 'approve' | 'reject') {
    if (item.type === 'hierarchy_pattern') {
      const result = await window.eduFixerApi?.resolveHierarchyReviewItem({
        id: item.id,
        markdownPath: item.markdownPath,
        patternKind: item.patternKind,
        candidateText: item.candidateText,
        recommendationLabel: item.recommendationLabel,
        finalLabel: item.finalLabel,
        sampleTexts: item.sampleTexts,
        sampleLines: item.sampleLines,
        action,
      });
      if (!result?.ok) {
        if (result?.error === 'final_label_required') {
          window.alert('적용할 위계 라벨을 먼저 선택하세요.');
        }
        return;
      }

      if (result.doc) {
        applyUpdatedDocuments([result.doc]);
      }
      setHierarchyReviewItems((current) => current.filter((entry) => entry.id !== item.id));
      return;
    }

    if (item.type === 'sentence_edit') {
      const result = await window.eduFixerApi?.resolveSentenceReviewItem({
        id: item.id,
        action,
      });
      if (!result?.ok) {
        return;
      }
      setSentenceReviewItems((current) => current.filter((entry) => entry.id !== item.id));
      return;
    }

    await handleResolveLogoReviewItem(item, action);
  }

  async function handleApproveAllReviewItems(items: ReviewItem[]) {
    for (const item of items) {
      if (item.status !== 'pending') {
        continue;
      }
      await handleResolveReviewItem(item, 'approve');
    }
  }

  function handleContentChange(content: string) {
    setCurrentDocument((current) => {
      if (!current) {
        return current;
      }
      if (current.content !== content) {
        const monitorPayload = buildAppMonitorPayload({
          beforeContent: current.content,
          afterContent: content,
          documentPath: current.filePath,
          documentName: current.fileName,
          mode: editorMode,
        });
        if (monitorPayload) {
          console.info('[js_change_monitor]', monitorPayload);
        }
      }
      const next = { ...current, content };
      setOpenDocuments((docs) => ({ ...docs, [next.id]: next }));
      return next;
    });
  }

  function applyUpdatedDocuments(updatedDocs: ShellDocument[]) {
    if (!updatedDocs.length) {
      return;
    }

    const docByPath = new Map(
      updatedDocs
        .filter((doc) => Boolean(doc.filePath))
        .map((doc) => [doc.filePath, doc] as const),
    );

    setOpenDocuments((current) => {
      const next = { ...current };
      Object.entries(next).forEach(([key, doc]) => {
        const updated = docByPath.get(doc.filePath);
        if (updated) {
          next[key] = updated;
        }
      });
      return next;
    });

    setRecentDocuments((current) =>
      current.map((doc) => docByPath.get(doc.filePath) ?? doc),
    );

    setCurrentDocument((current) => {
      if (!current?.filePath) {
        return current;
      }
      return docByPath.get(current.filePath) ?? current;
    });
  }

  function navigateToDocumentLine(
    lineNumber: number,
    options?: {
      startColumn?: number;
      endColumn?: number;
      previewLabel?: string;
      selectPreviewLine?: boolean;
    },
  ) {
    setActiveView('editor');
    setCurrentEditorLine(lineNumber);
    setCurrentPreviewLine(lineNumber);
    splitStoredLinesRef.current = {
      editorLine: normalizeSessionLine(lineNumber),
      previewLine: normalizeSessionLine(lineNumber),
    };
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
    setScrollRequest({
      line: lineNumber,
      startColumn: options?.startColumn,
      endColumn: options?.endColumn,
      token: Date.now(),
    });
  }

  function jumpToSearchMatch(match: { lineNumber: number; start: number; end: number }, query: string) {
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

  async function handleOpenEditorReviewItem(item: ReviewItem) {
    if (item.type === 'logo_candidate') {
      return;
    }

    const filePath = item.markdownPath || item.sourcePdfPath;
    if (!filePath) {
      return;
    }

    const doc =
      Object.values(openDocuments).find((entry) => entry.filePath === filePath) ??
      (await window.eduFixerApi?.openRecent(filePath)) ??
      null;
    if (!doc) {
      return;
    }

    openShellDocument(doc);
    const targetLine = item.type === 'sentence_edit'
      ? item.lineStart
      : item.sampleLines[0] ?? 1;

    setTimeout(() => {
      navigateToDocumentLine(targetLine);
    }, 0);
  }

  const reviewItems: ReviewItem[] = [...logoReviewItems, ...hierarchyReviewItems, ...sentenceReviewItems];
  const selectionModeLabel =
    previewSelectionMode === 'block'
      ? '현재: 블록 선택'
      : previewSelectionMode === 'line'
        ? '현재: 라인 선택'
        : '현재: 문자 선택';
  const selectionStatusLabel = `상태: 블록 ${currentDocument?.blockCount ?? 0}개 · 잠시대기`;
  const showMdMenu = activeView === 'editor' && Boolean(currentDocument?.fileName.toLowerCase().endsWith('.md'));
  const canEdit = activeView === 'editor' && Boolean(currentDocument);
  const activeSearchFolderPath = explorerFolder?.path ?? getParentFolderPath(currentDocument?.filePath);
  const locationBaseLine = locationSurface === 'View' ? currentPreviewLine : currentEditorLine;
  const normalizedCurrentLine = getCollapsedHeadingOwnerLine(
    currentDocument?.content ?? '',
    locationBaseLine,
    collapsedHeadingLines,
  );

  return (
    <div
      className={`app ${isFileDragOverApp ? 'is-file-drag-over' : ''}`}
      onDragOver={(event) => {
        event.preventDefault();
        event.dataTransfer.dropEffect = 'copy';
        setIsFileDragOverApp(true);
      }}
      onDragLeave={(event) => {
        if (event.currentTarget.contains(event.relatedTarget as Node | null)) {
          return;
        }
        setIsFileDragOverApp(false);
      }}
      onDrop={(event) => {
        event.preventDefault();
        setIsFileDragOverApp(false);
        const filePaths = parseDroppedFilePaths(event);
        void handleDropOpenFiles(filePaths);
      }}
    >
      <TitleBar
        onOpenUpload={() => openView('upload')}
        onOpenFile={handleOpenFile}
        onOpenFolder={handleOpenFolder}
        onSave={() => { void handleSaveCurrentDocument(); }}
        onSaveAs={() => { void handleSaveAsCurrentDocument(); }}
        onUndo={handleUndoCommand}
        onRedo={handleRedoCommand}
        onFind={handleFindCommand}
        onReplace={handleReplaceCommand}
        canSave={activeView === 'editor' && Boolean(currentDocument)}
        canEdit={canEdit}
      />

      <div className="workbench">
        <ActivityBar
          activePanel={activePanel}
          showMdMenu={showMdMenu}
          onSelectPanel={(panel) => {
            setActivePanel(panel);
            if (panel === 'settings') {
              openView('settings');
            }
            if (panel === 'review') {
              openView('review');
            }
            if (panel === 'dataset') {
              openView('dataset');
            }
          }}
        />

        <div className="sidebar" id="sidebar" style={{ width: `${sidebarWidth}px` }}>
          {activePanel === 'explorer' ? (
            <ExplorerPanel
              onOpenView={openView}
              onOpenFolder={handleOpenFolder}
              onOpenExplorerFile={handleOpenExplorerFile}
              onDeleteExplorerFile={handleDeleteExplorerFile}
              includeSubfolders={includeExplorerSubfolders}
              onToggleIncludeSubfolders={handleToggleExplorerSubfolders}
              explorerFolder={explorerFolder}
              recentDocuments={recentDocuments}
              activeDocumentId={currentDocument?.id ?? null}
              activeDocumentPath={currentDocument?.filePath ?? null}
              openDocumentIds={Object.keys(openDocuments)}
              openDocumentPaths={Object.values(openDocuments).map((doc) => doc.filePath).filter((path): path is string => Boolean(path))}
              onOpenUnimplementedModal={handleOpenUnimplementedModal}
            />
          ) : null}
          {activePanel === 'md-menu' ? (
            <div>
              <MdMenuPanel
                key={currentDocument?.id ?? 'md-menu'}
                document={currentDocument}
                activeLine={normalizedCurrentLine}
                collapsedLineNumbers={collapsedHeadingLines}
                onToggleHeadingCollapse={(lineNumber) => {
                  setCollapsedHeadingLines((current) =>
                    current.includes(lineNumber)
                      ? current.filter((value) => value !== lineNumber)
                      : [...current, lineNumber],
                  );
                }}
                onSelectHeading={(lineNumber) => {
                  navigateToDocumentLine(lineNumber, { selectPreviewLine: false });
                }}
              />
            </div>
          ) : null}
          {activePanel === 'search' ? (
            <SearchPanel
              document={currentDocument}
              folderPath={activeSearchFolderPath}
              activeLine={null}
              searchSelection={null}
              mode={searchPanelState.mode}
              scope={searchPanelState.scope}
              query={searchPanelState.query}
              replaceValue={searchPanelState.replaceValue}
              selectedIndex={searchPanelState.selectedIndex}
              onModeChange={(mode) => setSearchPanelState((current) => (current.mode === mode ? current : { ...current, mode }))}
              onScopeChange={(scope) => setSearchPanelState((current) => (current.scope === scope ? current : { ...current, scope }))}
              onQueryChange={(query) => setSearchPanelState((current) => (current.query === query ? current : { ...current, query }))}
              onReplaceValueChange={(replaceValue) => setSearchPanelState((current) => (current.replaceValue === replaceValue ? current : { ...current, replaceValue }))}
              onSelectedIndexChange={(selectedIndex) => setSearchPanelState((current) => (current.selectedIndex === selectedIndex ? current : { ...current, selectedIndex }))}
              onSelectResult={(match) => jumpToSearchMatch(match, match.lineText.slice(match.start, match.end))}
              onSelectFolderResult={openFileAndJumpToSearchMatch}
              onReplaceContent={handleContentChange}
              onApplyFolderReplace={applyUpdatedDocuments}
            />
          ) : null}
          {activePanel === 'review' ? <ReviewPanel onOpenReview={() => openView('review')} items={reviewItems} /> : null}
          {activePanel === 'dataset' ? <DatasetPanel onOpenDataset={() => openView('dataset')} stats={mlDatasetStats} syncStatus={syncStatus} /> : null}
          {activePanel === 'settings' ? <SettingsPanel onOpenSettings={() => openView('settings')} /> : null}
        </div>

        <div
          className="sidebar-resizer"
          role="separator"
          aria-orientation="vertical"
          aria-label="사이드바 너비 조절"
          onMouseDown={() => setIsSidebarResizing(true)}
        />

        <div className="editor-shell">
          <TabsBar
            tabs={tabs}
            activeTab={activeTab}
            onSelectTab={selectTab}
            onCloseTab={handleCloseTab}
          />

          <div className="editor-container">
            <div className={`view ${activeView === 'welcome' ? 'active' : ''}`} id="view-welcome">
              <WelcomeView
                onOpenUpload={() => openView('upload')}
                onOpenEditor={handleOpenFile}
                onOpenReview={() => openView('review')}
                recentDocuments={recentDocuments}
                onOpenRecent={(doc) => handleOpenRecent(doc.filePath)}
              />
            </div>

            <div className={`view ${activeView === 'upload' ? 'active' : ''}`} id="view-upload">
              <UploadView
                selectedFile={uploadSelection}
                onStartSelectedFile={handleStartSelectedUploadFile}
              />
            </div>

            <div className={`view ${activeView === 'editor' ? 'active' : ''}`} id="view-editor">
              <EditorView
                editorMode={editorMode}
                onChangeMode={changeEditorMode}
                autoWrap={autoWrap}
                onToggleAutoWrap={() => setAutoWrap((current) => !current)}
                previewSelectionMode={previewSelectionMode}
                onChangePreviewSelectionMode={(mode) => {
                  setPreviewSelectionMode(mode);
                  if (mode !== 'block') {
                    setSelectedPreviewLine(null);
                  }
                }}
                locationSurface={locationSurface}
                onLocationSurfaceChange={handleLocationSurfaceChange}
                document={currentDocument}
                theme={theme}
                activeLine={locationBaseLine}
                scrollRequest={scrollRequest}
                selectionRequest={selectionRequest}
                onSelectionRequestApplied={() => setSelectionRequest(null)}
                selectedPreviewLine={selectedPreviewLine}
                searchSelection={null}
                collapsedHeadingLines={collapsedHeadingLines}
                onToggleCollapsedHeading={(lineNumber) => {
                  setCollapsedHeadingLines((current) => current.filter((value) => value !== lineNumber));
                }}
                onSelectPreviewLine={() => {}}
                onEditorActiveLineChange={(line) => setCurrentEditorLine((current) => (current === line ? current : line))}
                onPreviewActiveLineChange={(line) => setCurrentPreviewLine((current) => (current === line ? current : line))}
                onEditorLocationTrigger={(kind) => {
                  locationTriggerRef.current = { surface: 'Edit', kind, at: Date.now() };
                  splitStoreSignalRef.current = { surface: 'Edit', at: Date.now() };
                }}
                onPreviewLocationTrigger={(kind) => {
                  locationTriggerRef.current = { surface: 'View', kind, at: Date.now() };
                  splitStoreSignalRef.current = { surface: 'View', at: Date.now() };
                }}
                focusOwner="none"
                splitSyncEnabled={false}
                splitScrollSyncMode="none"
                onChangeContent={handleContentChange}
                actionLabel={showMdMenu ? 'ML 위계체크' : null}
                onAction={showMdMenu ? handleRunHierarchyCheck : null}
                actionDisabled={!currentDocument?.filePath}
              />
            </div>

            <div className={`view ${activeView === 'review' ? 'active' : ''}`} id="view-review">
              <ReviewView
                items={reviewItems}
                onResolveItem={handleResolveReviewItem}
                onApproveAll={handleApproveAllReviewItems}
                onOpenEditorItem={handleOpenEditorReviewItem}
              />
            </div>

            <div className={`view ${activeView === 'dataset' ? 'active' : ''}`} id="view-dataset">
              <DatasetView
                stats={mlDatasetStats}
                syncStatus={syncStatus}
                onOpenRoot={handleOpenMlDatasetRoot}
                onExportZip={handleExportMlDatasetZip}
                onQueueUpload={handleQueueMlDatasetUpload}
                onOpenTrainingAccess={handleOpenTrainingAccess}
              />
            </div>

            <div className={`view ${activeView === 'settings' ? 'active' : ''}`} id="view-settings">
              <SettingsView
                theme={theme}
                onToggleTheme={() => setTheme((current) => (current === 'dark' ? 'light' : 'dark'))}
                fontSettings={fontSettings}
                onChangeFontSettings={setFontSettings}
                onResetFontSettings={() => setFontSettings(defaultFontSettings)}
              />
            </div>
          </div>
        </div>
      </div>

      <StatusBar
        theme={theme}
        focusOwnerLabel="해제"
        selectionModeLabel={selectionModeLabel}
        selectionStatusLabel={selectionStatusLabel}
        onToggleTheme={() => setTheme((current) => (current === 'dark' ? 'light' : 'dark'))}
      />
      {isUnimplementedModalOpen ? (
        <div className="font-color-modal-backdrop" onClick={handleCloseUnimplementedModal}>
          <div className="font-color-modal training-access-modal" onClick={(event) => event.stopPropagation()}>
            <div className="font-color-modal-header">
              <div className="modal-title">미구현 안내</div>
            </div>
            <div className="modal-body">해당 기능은 아직 구현되지 않았습니다.</div>
            <div className="modal-footer">
              <button className="btn btn-primary" onClick={handleCloseUnimplementedModal}>확인</button>
            </div>
          </div>
        </div>
      ) : null}
      {isTrainingAccessOpen ? (
        <div className="font-color-modal-backdrop" onClick={handleCloseTrainingAccess}>
          <div className="font-color-modal training-access-modal" onClick={(event) => event.stopPropagation()}>
            <div className="font-color-modal-header">
              <div className="modal-title">학습 시키기</div>
            </div>
            <div className="modal-body">학습 담당자 비밀번호를 입력하세요.</div>
            <input
              className="training-access-input"
              type="password"
              value={trainingPassword}
              onChange={(event) => setTrainingPassword(event.target.value)}
              onKeyDown={(event) => {
                if (event.key === 'Enter') {
                  handleSubmitTrainingAccess();
                }
              }}
              autoFocus
              placeholder="비밀번호"
            />
            <div className="modal-footer">
              <button className="btn btn-ghost" onClick={handleCloseTrainingAccess}>취소</button>
              <button className="btn btn-primary" onClick={handleSubmitTrainingAccess}>확인</button>
            </div>
          </div>
        </div>
      ) : null}
      <ModalOverlay />
      <ToastLayer message={toastMessage} />
      <ComponentMap />
    </div>
  );
}

function buildAppMonitorPayload({
  beforeContent,
  afterContent,
  documentPath,
  documentName,
  mode,
}: {
  beforeContent: string;
  afterContent: string;
  documentPath?: string | null;
  documentName?: string | null;
  mode: EditorMode;
}) {
  const change = summarizeFirstTextChange(beforeContent, afterContent);
  if (!change) {
    return null;
  }

  return {
    task_type: 'editor_change_monitor',
    source: 'js',
    mode,
    document_path: documentPath ?? '',
    document_name: documentName ?? '',
    timestamp: new Date().toISOString(),
    recommendation_hint: change.looksLikeHierarchy ? 'hierarchy_candidate' : 'sentence_candidate',
    changes: [change],
  };
}

function summarizeFirstTextChange(beforeContent: string, afterContent: string) {
  if (beforeContent === afterContent) {
    return null;
  }

  const beforeLines = beforeContent.split(/\r?\n/);
  const afterLines = afterContent.split(/\r?\n/);
  let start = 0;
  while (
    start < beforeLines.length
    && start < afterLines.length
    && beforeLines[start] === afterLines[start]
  ) {
    start += 1;
  }

  let beforeEnd = beforeLines.length - 1;
  let afterEnd = afterLines.length - 1;
  while (
    beforeEnd >= start
    && afterEnd >= start
    && beforeLines[beforeEnd] === afterLines[afterEnd]
  ) {
    beforeEnd -= 1;
    afterEnd -= 1;
  }

  const beforeText = beforeLines.slice(start, beforeEnd + 1).join('\n');
  const afterText = afterLines.slice(start, afterEnd + 1).join('\n');
  const beforeTrimmed = beforeText.trim();
  const afterTrimmed = afterText.trim();
  const blankLineOnly = beforeTrimmed === '' && afterTrimmed === '';
  const mergeByLineJoin = beforeText.includes('\n') && afterText !== '' && !afterText.includes('\n');
  const splitByLineBreak = !beforeText.includes('\n') && beforeText !== '' && afterText.includes('\n');
  const changeKind = mergeByLineJoin
    ? 'merge'
    : splitByLineBreak
      ? 'split'
      : beforeTrimmed && !afterTrimmed
        ? 'delete'
        : !beforeTrimmed && afterTrimmed
          ? 'insert'
          : 'replace';
  const focusText = afterTrimmed || beforeTrimmed;
  const looksLikeHierarchy = /^(#{1,6}\s+|\[[^\]]+\]|\d+\)|\(\d+\)|[①-⑳]\s+|[-*+]\s+)/.test(focusText);

  if (blankLineOnly && !mergeByLineJoin && !splitByLineBreak) {
    return null;
  }

  return {
    fromLine: start + 1,
    toLine: Math.max(start + 1, beforeEnd + 1),
    insertedToLine: Math.max(start + 1, afterEnd + 1),
    changeKind,
    beforeText: clipMonitorText(beforeText),
    afterText: clipMonitorText(afterText),
    beforePreview: clipMonitorText(beforeTrimmed || '[empty]', 160),
    afterPreview: clipMonitorText(afterTrimmed || '[empty]', 160),
    leftContext: sliceMonitorContext(beforeLines.slice(Math.max(0, start - 2), start).join(' '), false),
    rightContext: sliceMonitorContext(afterLines.slice(afterEnd + 1, Math.min(afterLines.length, afterEnd + 3)).join(' '), true),
    blankLineOnly,
    looksLikeHierarchy,
    headingMarkerAdded: !beforeTrimmed.startsWith('#') && afterTrimmed.startsWith('#'),
    headingMarkerRemoved: beforeTrimmed.startsWith('#') && !afterTrimmed.startsWith('#'),
  };
}

function sliceMonitorContext(value: string, fromStart: boolean) {
  const words = String(value || '').trim().split(/\s+/).filter(Boolean);
  if (!words.length) {
    return '';
  }
  return fromStart ? words.slice(0, 5).join(' ') : words.slice(-5).join(' ');
}

function clipMonitorText(value: string, maxLength = 400) {
  const text = String(value || '');
  if (text.length <= maxLength) {
    return text;
  }
  return `${text.slice(0, maxLength)}...[${text.length - maxLength} more chars]`;
}
