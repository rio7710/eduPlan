const { walkFiles } = require('../../lib/utils.cjs');
const { mapFolderFiles } = require('./openFolderDialog.cjs');

function registerOpenFolderPathHandler(ipcMain) {
  ipcMain.handle('dialog:open-folder-path', async (_event, folderPath) => {
    if (!folderPath) return null;
    try {
      const files = await walkFiles(folderPath);
      return {
        path: folderPath,
        files: mapFolderFiles(folderPath, files),
      };
    } catch (error) {
      console.error('Open Folder Path Error:', error);
      return null;
    }
  });
}

module.exports = {
  registerOpenFolderPathHandler,
};
