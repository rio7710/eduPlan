const { clipboard, contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('eduFixerApi', {
  isDesktop: true,
  getShellState: () => ipcRenderer.invoke('app:get-shell-state'),
  getSystemFonts: () => ipcRenderer.invoke('app:get-system-fonts'),
  getSyncStatus: () => ipcRenderer.invoke('app:get-sync-status'),
  filterExistingPaths: (paths) => ipcRenderer.invoke('app:filter-existing-paths', paths),
  readImageDataUrl: (filePath) => ipcRenderer.invoke('app:read-image-data-url', filePath),
  openFile: () => ipcRenderer.invoke('dialog:open-file'),
  openFolder: () => ipcRenderer.invoke('dialog:open-folder'),
  openFolderPath: (folderPath, includeSubfolders = true) => ipcRenderer.invoke('dialog:open-folder-path', folderPath, includeSubfolders),
  openRecent: (filePath) => ipcRenderer.invoke('document:open-recent', filePath),
  convertPdfWithPython: (filePath, inferenceEngine = 'py_only', sensitivity = 'default') => ipcRenderer.invoke('document:convert-pdf-python', filePath, inferenceEngine, sensitivity),
  analyzeHierarchyPatterns: (markdownPath) => ipcRenderer.invoke('document:analyze-hierarchy-patterns', markdownPath),
  getMlDatasetStats: () => ipcRenderer.invoke('dataset:get-stats'),
  openMlDatasetRoot: () => ipcRenderer.invoke('dataset:open-root'),
  exportMlDatasetZip: () => ipcRenderer.invoke('dataset:export-zip'),
  cleanupMlDatasetArtifacts: () => ipcRenderer.invoke('dataset:cleanup-artifacts'),
  confirmMlDatasetResetFlow: () => ipcRenderer.invoke('dataset:confirm-reset-flow'),
  deleteDocumentPath: (filePath) => ipcRenderer.invoke('document:delete-path', filePath),
  scanLogoReviewItems: (folderPath, inferenceEngine = 'py_lgbm') => ipcRenderer.invoke('review:scan-logo-items', folderPath, inferenceEngine),
  resolveHierarchyReviewItem: (payload) => ipcRenderer.invoke('review:resolve-hierarchy-item', payload),
  resolveLogoReviewItem: (payload) => ipcRenderer.invoke('review:resolve-logo-item', payload),
  saveDocument: (payload) => ipcRenderer.invoke('document:save', payload),
  saveDocumentAs: (payload) => ipcRenderer.invoke('document:save-as', payload),
  searchInFolder: (payload) => ipcRenderer.invoke('folder:search-text', payload),
  replaceInFolder: (payload) => ipcRenderer.invoke('folder:replace-text', payload),
  writeClipboard: ({ plain, html }) => {
    if (html) {
      clipboard.write({ text: plain ?? '', html });
      return;
    }
    clipboard.writeText(plain ?? '');
  },
  minimizeWindow: () => ipcRenderer.invoke('window:minimize'),
  maximizeToggle: () => ipcRenderer.invoke('window:maximize-toggle'),
  closeWindow: () => ipcRenderer.invoke('window:close'),
});
