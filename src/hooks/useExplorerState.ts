import { useEffect, useState } from 'react';
import { isPdfPath } from '@/utils/textUtils';

const LAST_EXPLORER_FOLDER_PATH_STORAGE_KEY = 'eduplan-last-explorer-folder-path';
const EXPLORER_INCLUDE_SUBFOLDERS_STORAGE_KEY = 'eduplan-explorer-include-subfolders';

type UseExplorerStateOptions = {
  onOpenView: (view: 'welcome' | 'upload' | 'editor' | 'review' | 'dataset' | 'settings', tabId?: string) => void;
  onSetActivePanel: (panel: 'explorer' | 'md-menu' | 'search' | 'review' | 'dataset' | 'settings') => void;
  onOpenRecent: (filePath: string) => Promise<void>;
  onOpenShellDocument: (doc: ShellDocument, options?: { initialLine?: number }) => void;
  onOpenUploadForPath: (filePath: string, fileSize?: string | null) => void;
  onRemoveDocumentByPath: (filePath: string) => void;
};

export function useExplorerState({
  onOpenView,
  onSetActivePanel,
  onOpenRecent,
  onOpenShellDocument,
  onOpenUploadForPath,
  onRemoveDocumentByPath,
}: UseExplorerStateOptions) {
  const [includeExplorerSubfolders, setIncludeExplorerSubfolders] = useState<boolean>(() => {
    return window.localStorage.getItem(EXPLORER_INCLUDE_SUBFOLDERS_STORAGE_KEY) !== 'off';
  });
  const [explorerFolder, setExplorerFolder] = useState<OpenFolderResult | null>(null);

  useEffect(() => {
    window.localStorage.setItem(EXPLORER_INCLUDE_SUBFOLDERS_STORAGE_KEY, includeExplorerSubfolders ? 'on' : 'off');
  }, [includeExplorerSubfolders]);

  useEffect(() => {
    if (explorerFolder?.path) {
      window.localStorage.setItem(LAST_EXPLORER_FOLDER_PATH_STORAGE_KEY, explorerFolder.path);
    }
  }, [explorerFolder?.path]);

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

  async function handleOpenFolder() {
    const folder = await window.eduFixerApi?.openFolder();
    if (!folder) return;
    window.localStorage.setItem(LAST_EXPLORER_FOLDER_PATH_STORAGE_KEY, folder.path);
    const refreshedFolder = await window.eduFixerApi?.openFolderPath(folder.path, includeExplorerSubfolders);
    setExplorerFolder(refreshedFolder ?? folder);
    onSetActivePanel('explorer');
  }

  async function handleToggleExplorerSubfolders() {
    const next = !includeExplorerSubfolders;
    setIncludeExplorerSubfolders(next);
    await refreshPersistedExplorerFolder(next);
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
    onRemoveDocumentByPath(filePath);
  }

  async function handleDeleteExplorerFile(entry: FolderEntry | ShellDocument) {
    const filePath = 'path' in entry ? entry.path : entry.filePath;
    const fileName = 'name' in entry ? entry.name : entry.fileName;
    if (!filePath) return;

    const confirmed = window.confirm(`이 파일을 실제로 삭제할까요?\n\n${fileName}`);
    if (!confirmed) return;

    const result = await window.eduFixerApi?.deleteDocumentPath(filePath);
    if (!result?.ok) return;

    removeDocumentReferences(filePath);
    await refreshPersistedExplorerFolder();
  }

  async function handleOpenExplorerFile(entry: FolderEntry | ShellDocument) {
    if ('fileName' in entry) {
      if (!entry.filePath) return;
      await onOpenRecent(entry.filePath);
      return;
    }

    if (entry.ext === '.pdf' || isPdfPath(entry.path)) {
      onOpenUploadForPath(entry.path, entry.size);
      onOpenView('upload');
      return;
    }

    const doc = await window.eduFixerApi?.openRecent(entry.path);
    if (!doc) return;
    onOpenShellDocument(doc);
  }

  return {
    explorerFolder,
    includeExplorerSubfolders,
    refreshPersistedExplorerFolder,
    setExplorerFolder,
    handleDeleteExplorerFile,
    handleOpenExplorerFile,
    handleOpenFolder,
    handleToggleExplorerSubfolders,
  };
}
