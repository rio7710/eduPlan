const { dialog } = require('electron');
const path = require('node:path');
const { walkFiles } = require('../../lib/utils.cjs');

function mapFolderFiles(folderPath, files) {
  return files.map((filePath) => ({
    name: path.relative(folderPath, filePath),
    path: filePath,
    ext: path.extname(filePath),
  }));
}

function registerOpenFolderDialogHandler(ipcMain, mainWindow) {
  ipcMain.handle('dialog:open-folder', async (_event, folderPath) => {
    if (!folderPath) {
      const { canceled, filePaths } = await dialog.showOpenDialog(mainWindow, {
        properties: ['openDirectory'],
      });
      if (canceled) return null;
      folderPath = filePaths[0];
    }

    const files = await walkFiles(folderPath);
    return {
      path: folderPath,
      files: mapFolderFiles(folderPath, files),
    };
  });
}

module.exports = {
  mapFolderFiles,
  registerOpenFolderDialogHandler,
};
