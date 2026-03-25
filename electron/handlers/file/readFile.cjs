const fs = require('node:fs/promises');

function registerReadFileHandler(ipcMain) {
  ipcMain.handle('app:read-file', async (_event, filePath) => {
    try {
      const content = await fs.readFile(filePath, 'utf8');
      return content;
    } catch (error) {
      console.error('File Read Error:', error);
      throw error;
    }
  });
}

module.exports = {
  registerReadFileHandler,
};
