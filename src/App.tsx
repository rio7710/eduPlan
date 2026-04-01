import { useCallback, useEffect, useEffectEvent, useRef, useState } from 'react';
import { ActivityBar } from '@/components/mirror/ActivityBar';
import { ComponentMap } from '@/components/mirror/ComponentMap';
import { ExplorerPanel } from '@/components/mirror/panels/ExplorerPanel';
import { DatasetPanel } from '@/components/mirror/panels/DatasetPanel';
import { MdMenuPanel } from '@/components/mirror/panels/MdMenuPanel';
import { ReportPanel } from '@/components/mirror/panels/ReportPanel';
import { ReviewPanel } from '@/components/mirror/panels/ReviewPanel';
import { SearchPanel, type SearchMode, type SearchScope } from '@/components/mirror/panels/SearchPanel';
import { SettingsPanel } from '@/components/mirror/panels/SettingsPanel';
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
import { getCollapsedHeadingOwnerLine } from '@/lib/headingSections';
import { useDocumentSession } from '@/hooks/useDocumentSession';
import { useEditorSync, type EditorMode } from '@/hooks/useEditorSync';
import { useReviewState } from '@/hooks/useReviewState';
import { useUploadFlow } from '@/hooks/useUploadFlow';
import { useExplorerState } from '@/hooks/useExplorerState';
import { useShellLayout } from '@/hooks/useShellLayout';
import { useAppCommands } from '@/hooks/useAppCommands';
import { useAppBootstrap } from '@/hooks/useAppBootstrap';
import { getParentFolderPath } from '@/utils/textUtils';
import { nextIfChanged, patchIfChanged } from '@/utils/stateUtils';

export type PanelId = 'explorer' | 'md-menu' | 'search' | 'report' | 'review' | 'dataset' | 'settings';
export type ViewId = 'welcome' | 'upload' | 'editor' | 'review' | 'dataset' | 'settings';
export type { EditorMode };
export type PreviewSelectionMode = 'block' | 'line' | 'text';
const TRAINING_ACCESS_PASSWORD = 'jung25)(';
const PREVIEW_SELECTION_MODE_STORAGE_KEY = 'eduplan-preview-selection-mode';
const SEARCH_PANEL_SCOPE_STORAGE_KEY = 'edufixer-search-panel-scope';
const EDITOR_SESSION_MAP_STORAGE_KEY = 'edufixer-editor-session-map';

function isEditableMode(mode: EditorMode) {
  return mode === 'render' || mode === 'markdown' || mode === 'html' || mode === 'wysiwyg' || mode === 'split';
}

function normalizeSessionLine(line: unknown) {
  const numeric = Number(line);
  if (!Number.isFinite(numeric)) {
    return 1;
  }
  return Math.max(1, Math.floor(numeric));
}

function normalizeSessionEditorMode(mode: unknown): EditorMode {
  if (mode === 'render' || mode === 'markdown' || mode === 'html' || mode === 'wysiwyg' || mode === 'split') {
    return mode;
  }
  return 'render';
}

type SearchPanelState = {
  mode: SearchMode;
  scope: SearchScope;
  query: string;
  replaceValue: string;
  selectedIndex: number;
};

type SearchSelectionState = {
  filePath?: string;
  lineNumber: number;
  start: number;
  end: number;
  query: string;
};

type StoredFileEditorSession = {
  editorMode: EditorMode;
  line: number;
};

type TabLocationSnapshot = {
  locationSurface: ReturnType<typeof useEditorSync>['locationSurface'];
  currentEditorLine: number | null;
  currentPreviewLine: number | null;
  currentRenderLocationLine: number | null;
  currentRenderMenuLine: number | null;
  splitEditorLine: number;
  splitPreviewLine: number;
};

export function App() {
  const {
    defaultFontSettings,
    fontSettings,
    handleCloseTrainingAccess,
    handleCloseUnimplementedModal,
    handleOpenTrainingAccess,
    handleOpenUnimplementedModal,
    isFileDragOverApp,
    isTrainingAccessOpen,
    isUnimplementedModalOpen,
    parseDroppedFilePaths,
    setFontSettings,
    setIsFileDragOverApp,
    setIsSidebarResizing,
    setTheme,
    setToastMessage,
    setTrainingPassword,
    sidebarWidth,
    theme,
    toastMessage,
    trainingPassword,
  } = useShellLayout();
  const [activePanel, setActivePanel] = useState<PanelId>('explorer');
  const [activeView, setActiveView] = useState<ViewId>('welcome');
  const [previewSelectionMode, setPreviewSelectionMode] = useState<PreviewSelectionMode>(() => {
    const savedMode = window.localStorage.getItem(PREVIEW_SELECTION_MODE_STORAGE_KEY);
    return savedMode === 'block' || savedMode === 'line' || savedMode === 'text' ? savedMode : 'line';
  });
  const [autoWrap, setAutoWrap] = useState<boolean>(() => window.localStorage.getItem('eduplan-auto-wrap') !== 'off');
  const [searchPanelState, setSearchPanelState] = useState<SearchPanelState>({
    mode: 'find',
    scope: 'folder',
    query: '',
    replaceValue: '',
    selectedIndex: 0,
  });
  const [searchSelection, setSearchSelection] = useState<SearchSelectionState | null>(null);
  const [mlDatasetStats, setMlDatasetStats] = useState<MlDatasetStats | null>(null);
  const [syncStatus, setSyncStatus] = useState<SyncStatus | null>(null);
  const resetEditorSyncForDocumentRef = useRef<(initialLine: number) => void>(() => {});
  const setEditorModeForDocumentRef = useRef<(mode: EditorMode) => void>(() => {});
  const editorSessionMapRef = useRef<Record<string, StoredFileEditorSession>>({});
  const hadDocumentRef = useRef(false);
  if (!Object.keys(editorSessionMapRef.current).length) {
    try {
      const raw = window.localStorage.getItem(EDITOR_SESSION_MAP_STORAGE_KEY);
      editorSessionMapRef.current = raw ? JSON.parse(raw) as Record<string, StoredFileEditorSession> : {};
    } catch {
      editorSessionMapRef.current = {};
    }
  }
  function openView(view: ViewId, tabId: string = view) {
    if (view !== 'upload') clearUploadSelection();
    setActiveView(view);
    setActiveTab(tabId);
  }

  function openShellDocumentState(doc: ShellDocument, options?: { initialLine?: number }) {
    const savedSession = doc.filePath ? editorSessionMapRef.current[doc.filePath] : null;
    const initialLine = normalizeSessionLine(options?.initialLine ?? savedSession?.line ?? 1);
    setEditorModeForDocumentRef.current(savedSession?.editorMode ?? 'render');
    resetEditorSyncForDocumentRef.current(initialLine);
  }

  const mergeSavedReviewItemsRef = useRef<(items: ReviewItem[]) => void>(() => {});

  const {
    clearUploadSelection,
    convertProgress,
    handleStartSelectedUploadFile,
    latestReport,
    openUploadForPath,
    setUploadSelection,
    uploadSelection,
  } = useUploadFlow({
    onAfterConvert: async () => {
      await refreshPersistedExplorerFolder();
      await refreshPersistedLogoReviewItems();
      await refreshMlDatasetStats();
      await refreshSyncStatus();
    },
    onOpenShellDocument: (doc) => openShellDocument(doc),
    onOpenView: openView,
    onSetActivePanel: setActivePanel,
    onAppendReviewItems: (items) => mergeSavedReviewItemsRef.current(items),
  });
  const {
    activeTab,
    hydrateRecentDocuments,
    currentDocument,
    openDocuments,
    recentDocuments,
    removeDocumentByPath,
    setActiveTab,
    tabs,
    applyUpdatedDocuments,
    handleCloseTab,
    handleOpenFile,
    handleOpenRecent,
    handleSaveAsCurrentDocument,
    handleSaveCurrentDocument,
    openShellDocument,
    selectTab,
    updateCurrentDocumentContent,
  } = useDocumentSession({
    onOpenView: openView,
    onActivateDocument: openShellDocumentState,
    onSelectUpload: setUploadSelection,
    onAfterSave: async (saved, toastMessage) => {
      mergeSavedReviewItemsRef.current(saved.reviewItems);
      await refreshMlDatasetStats();
      setToastMessage(toastMessage);
    },
    onCloseDocument: (doc) => {
      if (!doc.filePath) {
        return;
      }
      const nextSessions = { ...editorSessionMapRef.current };
      delete nextSessions[doc.filePath];
      editorSessionMapRef.current = nextSessions;
      window.localStorage.setItem(EDITOR_SESSION_MAP_STORAGE_KEY, JSON.stringify(nextSessions));
    },
  });
  const {
    appendLogoReviewItems,
    handleApproveAllReviewItems,
    handleOpenEditorReviewItem,
    handleResolveReviewItem,
    mergeSavedReviewItems,
    refreshPersistedLogoReviewItems,
    refreshSentenceReviewItems,
    reviewItems,
    setHierarchyReviewItems,
  } = useReviewState({
    onAfterDatasetMutation: async () => {
      await refreshPersistedExplorerFolder();
      await refreshMlDatasetStats();
      await refreshSyncStatus();
    },
    onOpenView: openView,
    onSetActivePanel: setActivePanel,
    onApplyUpdatedDocuments: applyUpdatedDocuments,
    onOpenShellDocument: openShellDocument,
    getOpenDocuments: () => openDocuments,
  });
  const {
    changeEditorMode,
    collapsedHeadingLines,
    currentEditorLine,
    currentPreviewLine,
    currentRenderLocationLine,
    currentRenderMenuLine,
    editorMode,
    handleLocationSurfaceChange,
    locationSurface,
    onEditorLocationTrigger,
    onPreviewLocationTrigger,
    onRenderActiveLineChange,
    renderSyncMode,
    scrollRequest,
    selectedPreviewLine,
    selectionRequest,
    setCollapsedHeadingLines,
    setCurrentEditorLine,
    setCurrentPreviewLine,
    setCurrentRenderLocationLine,
    setCurrentRenderMenuLine,
    setEditorMode,
    setSelectedPreviewLine,
    setSelectionRequest,
    setScrollRequest,
    splitStoredLinesRef,
    toggleRenderSyncMode,
    resetForOpenedDocument,
  } = useEditorSync({ activeView, currentDocument });
  const {
    explorerFolder,
    includeExplorerSubfolders,
    refreshPersistedExplorerFolder,
    handleDeleteExplorerFile,
    handleOpenExplorerFile,
    handleOpenFolder,
    handleToggleExplorerSubfolders,
  } = useExplorerState({
    onOpenView: openView,
    onSetActivePanel: setActivePanel,
    onOpenRecent: handleOpenRecent,
    onOpenShellDocument: openShellDocument,
    onOpenUploadForPath: openUploadForPath,
    onRemoveDocumentByPath: removeDocumentByPath,
  });

  useEffect(() => {
    mergeSavedReviewItemsRef.current = mergeSavedReviewItems;
  }, [mergeSavedReviewItems]);

  useEffect(() => {
    resetEditorSyncForDocumentRef.current = resetForOpenedDocument;
  }, [resetForOpenedDocument]);

  useEffect(() => {
    setEditorModeForDocumentRef.current = setEditorMode;
  }, [setEditorMode]);

  useEffect(() => {
    const hasDocument = Boolean(currentDocument);
    const savedScope = window.localStorage.getItem(SEARCH_PANEL_SCOPE_STORAGE_KEY);
    const resolvedSavedScope = savedScope === 'folder' || savedScope === 'document' ? savedScope : 'document';

    if (!hasDocument && hadDocumentRef.current) {
      setSearchPanelState((current) => patchIfChanged(current, 'scope', 'folder'));
    }

    if (hasDocument && !hadDocumentRef.current) {
      setSearchPanelState((current) => patchIfChanged(current, 'scope', resolvedSavedScope));
    }

    hadDocumentRef.current = hasDocument;
  }, [currentDocument]);

  useEffect(() => {
    if (currentDocument) {
      window.localStorage.setItem(SEARCH_PANEL_SCOPE_STORAGE_KEY, searchPanelState.scope);
    }
  }, [currentDocument, searchPanelState.scope]);

  useEffect(() => {
    if (!currentDocument?.filePath || !isEditableMode(editorMode)) {
      return;
    }

    const sessionLine = normalizeSessionLine(
      editorMode === 'render'
        ? currentRenderLocationLine
        : currentEditorLine,
    );
    const nextSessions = {
      ...editorSessionMapRef.current,
      [currentDocument.filePath]: {
        editorMode,
        line: sessionLine,
      },
    };
    editorSessionMapRef.current = nextSessions;
    window.localStorage.setItem(EDITOR_SESSION_MAP_STORAGE_KEY, JSON.stringify(nextSessions));
  }, [currentDocument?.filePath, currentEditorLine, currentRenderLocationLine, editorMode]);

  const tabLocationSnapshotsRef = useRef<Record<string, TabLocationSnapshot>>({});
  const previousActiveTabRef = useRef(activeTab);

  const buildCurrentTabSnapshot = useEffectEvent((): TabLocationSnapshot => ({
    locationSurface,
    currentEditorLine,
    currentPreviewLine,
    currentRenderLocationLine,
    currentRenderMenuLine,
    splitEditorLine: splitStoredLinesRef.current.editorLine,
    splitPreviewLine: splitStoredLinesRef.current.previewLine,
  }));

  const applyTabLocationSnapshot = useEffectEvent((snapshot: TabLocationSnapshot) => {
    handleLocationSurfaceChange(snapshot.locationSurface);
    setCurrentEditorLine((current) => nextIfChanged(current, snapshot.currentEditorLine));
    setCurrentPreviewLine((current) => nextIfChanged(current, snapshot.currentPreviewLine));
    setCurrentRenderLocationLine((current) => nextIfChanged(current, snapshot.currentRenderLocationLine));
    setCurrentRenderMenuLine((current) => nextIfChanged(current, snapshot.currentRenderMenuLine));
    splitStoredLinesRef.current = {
      editorLine: snapshot.splitEditorLine,
      previewLine: snapshot.splitPreviewLine,
    };
  });

  const handleTabPressStart = useCallback((tabId: string) => {
    const currentTabId = activeTab;
    if (!currentTabId || currentTabId === 'welcome') {
      return;
    }
    void tabId;
    tabLocationSnapshotsRef.current[currentTabId] = {
      locationSurface,
      currentEditorLine,
      currentPreviewLine,
      currentRenderLocationLine,
      currentRenderMenuLine,
      splitEditorLine: splitStoredLinesRef.current.editorLine,
      splitPreviewLine: splitStoredLinesRef.current.previewLine,
    };
  }, [
    activeTab,
    currentEditorLine,
    currentPreviewLine,
    currentRenderLocationLine,
    currentRenderMenuLine,
    locationSurface,
    splitStoredLinesRef,
  ]);

  useEffect(() => {
    const previousTab = previousActiveTabRef.current;
    const currentSnapshot = buildCurrentTabSnapshot();

    if (previousTab && previousTab !== activeTab) {
      tabLocationSnapshotsRef.current[previousTab] = currentSnapshot;
    }

    const nextSnapshot = tabLocationSnapshotsRef.current[activeTab];
    if (nextSnapshot) {
      applyTabLocationSnapshot(nextSnapshot);
    }

    previousActiveTabRef.current = activeTab;
  }, [activeTab]);

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

  async function handleResetAllDatasetData() {
    const confirmed = window.confirm('SQLite/ML 데이터 전체를 초기화합니다.\n이 작업은 되돌릴 수 없습니다.\n\n계속할까요?');
    if (!confirmed) {
      return;
    }
    const result = await window.eduFixerApi?.resetAllDatasetData();
    await refreshMlDatasetStats();
    await refreshSyncStatus();
    if (!result?.ok) {
      window.alert(`전체 초기화 실패\n\n${result?.error ?? '알 수 없는 오류'}`);
      return;
    }
    window.alert(
      `초기화 완료\n\n` +
      `DB 삭제 행: ${result.deletedDbRows ?? 0}\n` +
      `아티팩트 파일: ${result.removedArtifactCount ?? 0}\n` +
      `dataset 파일: ${result.removedDatasetFileCount ?? 0}\n` +
      `해제 용량: ${result.freedBytes ?? 0} bytes`,
    );
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

  async function handleDropOpenFiles(paths: string[]) {
    const uniquePaths = [...new Set(paths.map((value) => String(value || '').trim()).filter(Boolean))];
    if (!uniquePaths.length) {
      return;
    }

    for (const filePath of uniquePaths) {
      await handleOpenRecent(filePath);
    }
    setToastMessage(uniquePaths.length > 1 ? `${uniquePaths.length}개 파일을 열었습니다.` : '파일을 열었습니다.');
  }

  async function handleSubmitTrainingAccess() {
    if (trainingPassword !== TRAINING_ACCESS_PASSWORD) {
      handleCloseTrainingAccess();
      window.alert('학습담당자만 학습이 가능합니다.');
      return;
    }

    handleCloseTrainingAccess();
    const result = await window.eduFixerApi?.prepareMlTraining(500);
    await refreshMlDatasetStats();
    if (!result?.ok) {
      window.alert('학습 준비 중 오류가 발생했습니다.');
      return;
    }
    if (result.trainError) {
      window.alert(`학습 실행 실패\n\n${result.trainError}`);
      return;
    }
    const status = result.trained
      ? `학습 완료 (정확도 ${Math.round((result.trainResult?.validAccuracy ?? 0) * 100)}%)`
      : result.eligibleForTraining
        ? '신규 데이터가 없어 학습을 건너뛰었습니다.'
        : `최소 ${result.minPairs}건 필요 (현재 ${result.totalUserPairs}건)`;
    window.alert(
      `학습 데이터 갱신 완료\n\n` +
      `새 pair: ${result.exportedPairCount}건\n` +
      `라벨 JSONL: ${result.exportedLabeledCount}건\n` +
      `누적 user pair: ${result.totalUserPairs}건\n` +
      `${status}`,
    );
  }

  useAppBootstrap({
    autoWrap,
    previewSelectionMode,
    currentDocumentFilePath: currentDocument?.filePath,
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
  });

  const hasMarkdownEditor = activeView === 'editor' && Boolean(currentDocument?.fileName.toLowerCase().endsWith('.md'));
  const effectiveActivePanel = activePanel === 'md-menu' && !hasMarkdownEditor ? 'explorer' : activePanel;

  const {
    handleUndoCommand,
    handleRedoCommand,
    handleFindCommand,
    handleReplaceCommand,
    handleContentChange,
    navigateToDocumentLine,
    jumpToSearchMatch,
    openFileAndJumpToSearchMatch,
  } = useAppCommands({
    activeView,
    editorMode,
    currentDocument,
    openDocuments,
    openView: (view) => openView(view),
    openShellDocument,
    updateCurrentDocumentContent,
    buildMonitorPayload: buildAppMonitorPayload,
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
  });

  const selectionModeLabel = previewSelectionMode === 'block' ? '현재: 블록 선택' : previewSelectionMode === 'line' ? '현재: 라인 선택' : '현재: 문자 선택';
  const selectionStatusLabel = `상태: 블록 ${currentDocument?.blockCount ?? 0}개 · 잠시대기`;
  const showMdMenu = activeView === 'editor' && Boolean(currentDocument?.fileName.toLowerCase().endsWith('.md'));
  const canEdit = activeView === 'editor' && Boolean(currentDocument);
  const activeSearchFolderPath = explorerFolder?.path ?? getParentFolderPath(currentDocument?.filePath);
  const locationBaseLine = locationSurface === 'Render' ? currentPreviewLine : currentEditorLine;
  const normalizedCurrentLine = getCollapsedHeadingOwnerLine(
    currentDocument?.content ?? '',
    locationBaseLine,
    collapsedHeadingLines,
  );
  const isMdMenuActive = effectiveActivePanel === 'md-menu';
  const activeRenderMenuLineBase = isMdMenuActive ? currentRenderLocationLine : null;
  const renderMenuActiveLine = activeRenderMenuLineBase
    ? getCollapsedHeadingOwnerLine(
      currentDocument?.content ?? '',
      activeRenderMenuLineBase,
      collapsedHeadingLines,
    )
    : null;

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
          activePanel={effectiveActivePanel}
          activeView={activeView}
          onOpenUpload={() => openView('upload')}
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
          {effectiveActivePanel === 'explorer' ? (
            <ExplorerPanel
              onOpenView={openView}
              onOpenFolder={handleOpenFolder}
              onOpenExplorerFolderPath={(folderPath) => {
                void window.eduFixerApi?.openPath(folderPath);
              }}
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
          {effectiveActivePanel === 'md-menu' ? (
            <MdMenuPanel
              key={currentDocument?.id ?? 'md-menu'}
              document={currentDocument}
              activeLine={editorMode === 'render' ? renderMenuActiveLine : normalizedCurrentLine}
              directActiveLine={null}
              collapsedLineNumbers={collapsedHeadingLines}
              onToggleHeadingCollapse={(lineNumber) => {
                setCollapsedHeadingLines((current) =>
                  current.includes(lineNumber)
                    ? current.filter((value) => value !== lineNumber)
                    : [...current, lineNumber],
                );
              }}
              onSelectHeading={(lineNumber) => {
                if (editorMode === 'render') {
                  setCurrentRenderLocationLine((current) => nextIfChanged(current, lineNumber));
                  setCurrentRenderMenuLine((current) => nextIfChanged(current, lineNumber));
                }
                navigateToDocumentLine(lineNumber, { selectPreviewLine: false });
              }}
            />
          ) : null}
          {effectiveActivePanel === 'search' ? (
            <SearchPanel
              document={currentDocument}
              folderPath={activeSearchFolderPath}
              activeLine={null}
              searchSelection={searchSelection}
              mode={searchPanelState.mode}
              scope={searchPanelState.scope}
              query={searchPanelState.query}
              replaceValue={searchPanelState.replaceValue}
              selectedIndex={searchPanelState.selectedIndex}
              onModeChange={(mode) => setSearchPanelState((current) => patchIfChanged(current, 'mode', mode))}
              onScopeChange={(scope) => setSearchPanelState((current) => patchIfChanged(current, 'scope', scope))}
              onQueryChange={(query) => {
                setSearchSelection(null);
                setSearchPanelState((current) => patchIfChanged(current, 'query', query));
              }}
              onReplaceValueChange={(replaceValue) => setSearchPanelState((current) => patchIfChanged(current, 'replaceValue', replaceValue))}
              onSelectedIndexChange={(selectedIndex) => setSearchPanelState((current) => patchIfChanged(current, 'selectedIndex', selectedIndex))}
              onSelectResult={(match) => {
                setSearchSelection({
                  lineNumber: match.lineNumber,
                  start: match.start,
                  end: match.end,
                  query: searchPanelState.query,
                });
                jumpToSearchMatch(match);
              }}
              onSelectFolderResult={(match) => {
                setSearchSelection({
                  filePath: match.filePath,
                  lineNumber: match.lineNumber,
                  start: match.start,
                  end: match.end,
                  query: searchPanelState.query,
                });
                void openFileAndJumpToSearchMatch(match);
              }}
              onReplaceContent={handleContentChange}
              onApplyFolderReplace={applyUpdatedDocuments}
            />
          ) : null}
          {effectiveActivePanel === 'report' ? <ReportPanel report={latestReport} /> : null}
          {effectiveActivePanel === 'review' ? <ReviewPanel onOpenReview={() => openView('review')} items={reviewItems} report={latestReport} /> : null}
          {effectiveActivePanel === 'dataset' ? <DatasetPanel onOpenDataset={() => openView('dataset')} onResetAllData={handleResetAllDatasetData} stats={mlDatasetStats} syncStatus={syncStatus} report={latestReport} /> : null}
          {effectiveActivePanel === 'settings' ? <SettingsPanel onOpenSettings={() => openView('settings')} /> : null}
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
            onPressTab={handleTabPressStart}
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
                progress={convertProgress}
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
                renderLocationLine={currentRenderLocationLine}
                scrollRequest={scrollRequest}
                selectionRequest={selectionRequest}
                onSelectionRequestApplied={() => setSelectionRequest(null)}
                selectedPreviewLine={selectedPreviewLine}
                searchSelection={
                  searchSelection && (!searchSelection.filePath || searchSelection.filePath === currentDocument?.filePath)
                    ? {
                      lineNumber: searchSelection.lineNumber,
                      start: searchSelection.start,
                      end: searchSelection.end,
                      query: searchSelection.query,
                    }
                    : null
                }
                collapsedHeadingLines={collapsedHeadingLines}
                onToggleCollapsedHeading={(lineNumber) => {
                  setCollapsedHeadingLines((current) => current.filter((value) => value !== lineNumber));
                }}
                onSelectPreviewLine={() => {}}
                onEditorActiveLineChange={(line) => setCurrentEditorLine((current) => nextIfChanged(current, line))}
                onPreviewActiveLineChange={(line) => {
                  if (editorMode === 'render') {
                    setCurrentRenderLocationLine((current) => nextIfChanged(current, line));
                    if (isMdMenuActive) {
                      setCurrentRenderMenuLine((current) => nextIfChanged(current, line));
                    }
                    return;
                  }
                  setCurrentPreviewLine((current) => nextIfChanged(current, line));
                }}
                onRenderActiveLineChange={onRenderActiveLineChange}
                onEditorLocationTrigger={onEditorLocationTrigger}
                onPreviewLocationTrigger={onPreviewLocationTrigger}
                focusOwner="none"
                splitSyncEnabled={false}
                splitScrollSyncMode="none"
                onChangeContent={handleContentChange}
                actionLabel={showMdMenu ? 'ML 위계체크' : null}
                onAction={showMdMenu ? handleRunHierarchyCheck : null}
                actionDisabled={!currentDocument?.filePath}
                renderSyncMode={renderSyncMode}
                onToggleRenderSyncMode={toggleRenderSyncMode}
              />
            </div>

            <div className={`view ${activeView === 'review' ? 'active' : ''}`} id="view-review">
              <ReviewView
                items={reviewItems}
                onResolveItem={handleResolveReviewItem}
                onApproveAll={handleApproveAllReviewItems}
                onOpenEditorItem={(item) => handleOpenEditorReviewItem(item, (lineNumber) => navigateToDocumentLine(lineNumber))}
              />
            </div>

            <div className={`view ${activeView === 'dataset' ? 'active' : ''}`} id="view-dataset">
              <DatasetView
                stats={mlDatasetStats}
                syncStatus={syncStatus}
                report={latestReport}
                onOpenRoot={handleOpenMlDatasetRoot}
                onExportZip={handleExportMlDatasetZip}
                onQueueUpload={handleQueueMlDatasetUpload}
                onOpenTrainingAccess={handleOpenTrainingAccess}
                onResetAllData={handleResetAllDatasetData}
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
                    void handleSubmitTrainingAccess();
                  }
                }}
              autoFocus
              placeholder="비밀번호"
            />
            <div className="modal-footer">
              <button className="btn btn-ghost" onClick={handleCloseTrainingAccess}>취소</button>
              <button className="btn btn-primary" onClick={() => { void handleSubmitTrainingAccess(); }}>확인</button>
            </div>
          </div>
        </div>
      ) : null}
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
