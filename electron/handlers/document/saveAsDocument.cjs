const fs = require('node:fs/promises');
const path = require('node:path');
const { dialog } = require('electron');
const { upsertDocumentRecord } = require('./shared.cjs');

function registerSaveAsDocumentHandler(ipcMain, mainWindow, db) {
  ipcMain.handle('document:save-as', async (_event, payload) => {
    const { canceled, filePath: savePath } = await dialog.showSaveDialog(mainWindow, {
      title: '다른 이름으로 저장',
      defaultPath: payload.fileName || '새 문서.md',
      filters: [
        { name: 'Markdown', extensions: ['md'] },
        { name: 'Text', extensions: ['txt'] },
      ],
    });

    if (canceled || !savePath) return null;

    const absolutePath = path.resolve(savePath);
    await fs.writeFile(absolutePath, payload.content, 'utf8');

    const doc = upsertDocumentRecord(db, {
      filePath: absolutePath,
      fileName: path.basename(absolutePath),
      content: payload.content,
      markSaved: true,
    });

    return { doc, editPatchCount: 0, reviewItems: [] };
  });
}

module.exports = {
  registerSaveAsDocumentHandler,
};
