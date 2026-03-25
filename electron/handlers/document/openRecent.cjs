const fs = require('node:fs/promises');
const path = require('node:path');
const { upsertDocumentRecord } = require('./shared.cjs');

function registerOpenRecentHandler(ipcMain, db) {
  ipcMain.handle('document:open-recent', async (_event, filePath) => {
    if (!filePath) return null;
    try {
      const absolutePath = path.resolve(filePath);
      const content = await fs.readFile(absolutePath, 'utf8');
      return upsertDocumentRecord(db, {
        filePath: absolutePath,
        fileName: path.basename(absolutePath),
        content,
        markSaved: true,
      });
    } catch (error) {
      console.error('Open Recent Error:', error);
      return null;
    }
  });
}

module.exports = {
  registerOpenRecentHandler,
};
