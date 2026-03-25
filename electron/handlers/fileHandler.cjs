const { ipcMain } = require('electron');
const { registerOpenFileDialogHandler } = require('./file/openFileDialog.cjs');
const { registerReadFileHandler } = require('./file/readFile.cjs');
const { registerOpenFolderDialogHandler } = require('./file/openFolderDialog.cjs');
const { registerOpenFolderPathHandler } = require('./file/openFolderPath.cjs');

/**
 * 파일 핸들러 등록
 */
function registerFileHandlers(mainWindow) {
  registerOpenFileDialogHandler(ipcMain, mainWindow);
  registerReadFileHandler(ipcMain);
  registerOpenFolderDialogHandler(ipcMain, mainWindow);
  registerOpenFolderPathHandler(ipcMain);
}

module.exports = {
  registerFileHandlers,
};
