const fs = require('node:fs/promises');
const path = require('node:path');
const { dialog } = require('electron');
const { extractEditPatches } = require('../../lib/utils.cjs');
const { upsertDocumentRecord } = require('./shared.cjs');

function registerSaveDocumentHandler(ipcMain, mainWindow, db) {
  ipcMain.handle('document:save', async (_event, { filePath, fileName, content }) => {
    let targetPath = filePath;

    if (!targetPath) {
      const { canceled, filePath: savePath } = await dialog.showSaveDialog(mainWindow, {
        title: '문서 저장',
        defaultPath: fileName || '새 문서.md',
        filters: [
          { name: 'Markdown', extensions: ['md'] },
          { name: 'Text', extensions: ['txt'] },
        ],
      });
      if (canceled || !savePath) return null;
      targetPath = savePath;
    }

    const absolutePath = path.resolve(targetPath);
    const previousContent = await fs.readFile(absolutePath, 'utf8').catch(() => '');
    const editPatches = extractEditPatches(previousContent, content);
    await fs.writeFile(absolutePath, content, 'utf8');

    const doc = upsertDocumentRecord(db, {
      filePath: absolutePath,
      fileName: path.basename(absolutePath),
      content,
      markSaved: true,
    });

    return {
      doc,
      editPatchCount: editPatches.length,
      reviewItems: [],
    };
  });
}

module.exports = {
  registerSaveDocumentHandler,
};
