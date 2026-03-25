const { ipcMain, shell, app } = require('electron');
const path = require('node:path');
const fs = require('node:fs/promises');

function resolveDatasetRoot() {
  return path.join(app.getPath('userData'), 'ml_dataset');
}

function registerDatasetHandlers(mainWindow) {
  // ML 데이터셋 통계 조회
  ipcMain.handle('dataset:get-stats', async () => {
    const rootPath = resolveDatasetRoot();
    return { exists: false, totalSizeBytes: 0, imageCount: 0, labelsCount: 0, rootPath };
  });

  ipcMain.handle('dataset:open-root', async () => {
    const rootPath = resolveDatasetRoot();
    await fs.mkdir(rootPath, { recursive: true });
    await shell.openPath(rootPath);
    return { ok: true, path: rootPath };
  });

  ipcMain.handle('dataset:export-zip', async () => {
    return { ok: false, error: 'cancelled' };
  });

  ipcMain.handle('dataset:cleanup-artifacts', async () => {
    return { ok: true, removedDirCount: 0, freedBytes: 0 };
  });

  ipcMain.handle('dataset:confirm-reset-flow', async () => {
    return { action: 'cancel' };
  });
}

module.exports = { registerDatasetHandlers };
