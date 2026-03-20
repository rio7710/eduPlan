import { useEffect, useState } from 'react';
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
export type EditorMode = 'wysiwyg' | 'markdown' | 'html' | 'preview';
export type PreviewSelectionMode = 'block' | 'line' | 'text';
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

type UiTab = {
  id: string;
  label: string;
  icon: string;
};

type SearchSelection = {
  lineNumber: number;
  start: number;
  end: number;
  query: string;
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
  const [editorMode, setEditorMode] = useState<EditorMode>('markdown');
  const [previewSelectionMode, setPreviewSelectionMode] = useState<PreviewSelectionMode>(() => {
    const savedMode = window.localStorage.getItem(PREVIEW_SELECTION_MODE_STORAGE_KEY);
    return savedMode === 'block' || savedMode === 'line' || savedMode === 'text' ? savedMode : 'block';
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
  const [scrollRequest, setScrollRequest] = useState<{ line: number; endLine?: number; startColumn?: number; endColumn?: number; token: number } | null>(null);
  const [selectedPreviewLine, setSelectedPreviewLine] = useState<{ line: number; endLine?: number; activeLine?: number; label: string } | null>(null);
  const [searchSelection, setSearchSelection] = useState<SearchSelection | null>(null);
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
  const [mlDatasetStats, setMlDatasetStats] = useState<MlDatasetStats | null>(null);
  const [syncStatus, setSyncStatus] = useState<SyncStatus | null>(null);
  const [toastMessage, setToastMessage] = useState<string | null>(null);
  const [isTrainingAccessOpen, setIsTrainingAccessOpen] = useState(false);
  const [trainingPassword, setTrainingPassword] = useState('');
  const [currentEditorLine, setCurrentEditorLine] = useState<number | null>(null);
  const [collapsedHeadingLines, setCollapsedHeadingLines] = useState<number[]>([]);
  const [tabs, setTabs] = useState<UiTab[]>([{ id: 'welcome', label: '시작', icon: '🏠' }]);

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

  function handleSubmitTrainingAccess() {
    if (trainingPassword !== TRAINING_ACCESS_PASSWORD) {
      handleCloseTrainingAccess();
      window.alert('학습담당자만 학습이 가능합니다.');
      return;
    }

    handleCloseTrainingAccess();
    window.alert('학습 담당자 인증이 완료되었습니다.\n\n실제 학습 실행 연결은 다음 단계에서 붙입니다.');
  }

  function changeEditorMode(nextMode: EditorMode) {
    setEditorMode(nextMode);
    if (currentEditorLine) {
      setScrollRequest({ line: currentEditorLine, token: Date.now() });
      if (nextMode === 'preview') {
        setSelectedPreviewLine((current) => current ?? {
          line: currentEditorLine,
          endLine: currentEditorLine,
          activeLine: currentEditorLine,
          label: `${currentEditorLine}행 선택`,
        });
      }
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
    if (!currentDocument?.filePath) {
      return;
    }

    const payload: StoredEditorSession = {
      filePath: currentDocument.filePath,
      line: currentEditorLine,
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
    void refreshPersistedExplorerFolder(includeExplorerSubfolders);
    void refreshPersistedLogoReviewItems();
    void refreshMlDatasetStats();
    void refreshSyncStatus();
  }, []);

  useEffect(() => {
    window.eduFixerApi?.getShellState().then((shellState) => {
      setRecentDocuments(shellState.recentDocuments);
    });
  }, []);

  useEffect(() => {
    const handleKeyDown = (event: KeyboardEvent) => {
      if (!(event.ctrlKey || event.metaKey) || event.key.toLowerCase() !== 's') {
        return;
      }

      event.preventDefault();
      if (event.shiftKey) {
        void handleSaveAsCurrentDocument();
        return;
      }

      void handleSaveCurrentDocument();
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => {
      window.removeEventListener('keydown', handleKeyDown);
    };
  }, [currentDocument]);

  useEffect(() => {
    const handleWindowFocus = () => {
      refreshPersistedExplorerFolder();
      refreshPersistedLogoReviewItems();
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

  function openView(view: ViewId, tabId: string = view) {
    if (view !== 'upload') {
      setUploadSelection(null);
    }
    setActiveView(view);
    setActiveTab(tabId);
  }

  function ensureTab(tab: UiTab) {
    setTabs((current) => {
      if (current.some((item) => item.id === tab.id)) {
        return current;
      }
      return [...current, tab];
    });
  }

  function openShellDocument(doc: ShellDocument) {
    setOpenDocuments((current) => ({ ...current, [doc.id]: doc }));
    setCurrentDocument(doc);
    setCollapsedHeadingLines([]);
    setScrollRequest(null);
    setSelectedPreviewLine(null);
    setCurrentEditorLine(null);
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

  function jumpToSearchMatch(match: { lineNumber: number; start: number; end: number }, query: string) {
    setActiveView('editor');
    setCurrentEditorLine(match.lineNumber);
    setSearchSelection({
      lineNumber: match.lineNumber,
      start: match.start,
      end: match.end,
      query,
    });
    setSelectedPreviewLine(null);
    setScrollRequest({
      line: match.lineNumber,
      startColumn: match.start,
      endColumn: match.end,
      token: Date.now(),
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
      jumpToSearchMatch(match, match.lineText.slice(match.start, match.end));
    }, 0);
  }

  const reviewItems: ReviewItem[] = [...logoReviewItems, ...hierarchyReviewItems];
  const showMdMenu = Boolean(currentDocument?.fileName.toLowerCase().endsWith('.md'));
  const activeSearchFolderPath = explorerFolder?.path ?? getParentFolderPath(currentDocument?.filePath);
  const normalizedCurrentLine = getCollapsedHeadingOwnerLine(
    currentDocument?.content ?? '',
    currentEditorLine,
    collapsedHeadingLines,
  );

  return (
    <div className="app">
      <TitleBar
        onOpenUpload={() => openView('upload')}
        onOpenFile={handleOpenFile}
        onOpenFolder={handleOpenFolder}
        onSave={() => { void handleSaveCurrentDocument(); }}
        onSaveAs={() => { void handleSaveAsCurrentDocument(); }}
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
            />
          ) : null}
          {activePanel === 'md-menu' ? (
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
                setActiveView('editor');
                setCurrentEditorLine(lineNumber);
                setSelectedPreviewLine({ line: lineNumber, endLine: lineNumber, activeLine: lineNumber, label: `${lineNumber}행 선택` });
                setScrollRequest({ line: lineNumber, token: Date.now() });
              }}
            />
          ) : null}
          {activePanel === 'search' ? (
            <SearchPanel
              document={currentDocument}
              folderPath={activeSearchFolderPath}
              activeLine={normalizedCurrentLine}
              mode={searchPanelState.mode}
              scope={searchPanelState.scope}
              query={searchPanelState.query}
              replaceValue={searchPanelState.replaceValue}
              selectedIndex={searchPanelState.selectedIndex}
              onModeChange={(mode) => setSearchPanelState((current) => ({ ...current, mode }))}
              onScopeChange={(scope) => setSearchPanelState((current) => ({ ...current, scope }))}
              onQueryChange={(query) => setSearchPanelState((current) => ({ ...current, query }))}
              onReplaceValueChange={(replaceValue) => setSearchPanelState((current) => ({ ...current, replaceValue }))}
              onSelectedIndexChange={(selectedIndex) => setSearchPanelState((current) => ({ ...current, selectedIndex }))}
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
                document={currentDocument}
                theme={theme}
                activeLine={normalizedCurrentLine}
                scrollRequest={scrollRequest}
                selectedPreviewLine={selectedPreviewLine}
                searchSelection={searchSelection}
                collapsedHeadingLines={collapsedHeadingLines}
                onToggleCollapsedHeading={(lineNumber) => {
                  setCollapsedHeadingLines((current) => current.filter((value) => value !== lineNumber));
                }}
                onSelectPreviewLine={(selection) => {
                  setSelectedPreviewLine(selection);
                  setCurrentEditorLine(selection?.activeLine ?? selection?.line ?? null);
                }}
                onActiveLineChange={setCurrentEditorLine}
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

      <StatusBar />
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
