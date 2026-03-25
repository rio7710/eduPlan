const { dialog } = require('electron');

function registerOpenFileDialogHandler(ipcMain, mainWindow) {
  ipcMain.handle('dialog:open-file', async () => {
    const { canceled, filePaths } = await dialog.showOpenDialog(mainWindow, {
      properties: ['openFile'],
      filters: [
        { name: 'Documents', extensions: ['pdf', 'md', 'txt', 'srt'] },
        { name: 'All Files', extensions: ['*'] },
      ],
    });
    if (canceled) return null;
    return filePaths[0];
  });
}

module.exports = {
  registerOpenFileDialogHandler,
};
