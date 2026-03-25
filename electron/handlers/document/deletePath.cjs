const fs = require('node:fs/promises');
const path = require('node:path');

function registerDeletePathHandler(ipcMain) {
  ipcMain.handle('document:delete-path', async (_event, filePath) => {
    const absolutePath = path.resolve(String(filePath || ''));
    if (!absolutePath) {
      return { ok: false };
    }
    try {
      await fs.unlink(absolutePath);
      return { ok: true, filePath: absolutePath };
    } catch {
      return { ok: false, filePath: absolutePath };
    }
  });
}

module.exports = {
  registerDeletePathHandler,
};
