const { ipcMain, dialog, shell, app } = require('electron');
const path = require('node:path');
const fs = require('node:fs/promises');
const { getDb } = require('../lib/dbEngine.cjs');
const { toIsoNow } = require('../lib/utils.cjs');

function registerMainHandlers(mainWindow) {
  const db = getDb();

  // 앱 상태 조회
  ipcMain.handle('app:get-shell-state', () => {
    const rows = db.prepare(`
      SELECT id, file_name, file_path, content, block_count, last_opened_at, last_saved_at, updated_at
      FROM documents
      ORDER BY COALESCE(last_opened_at, updated_at) DESC
      LIMIT 30
    `).all();

    return {
      isDesktop: true,
      recentDocuments: rows.map(row => ({
        id: row.id,
        fileName: row.file_name,
        filePath: row.file_path || '',
        content: row.content,
        blockCount: row.block_count,
        lastOpenedAt: row.last_opened_at,
        lastSavedAt: row.last_saved_at,
      })),
    };
  });

  // 누락된 싱크 상태 조회 핸들러 추가
  ipcMain.handle('app:get-sync-status', () => {
    return {
      sqliteConnected: Boolean(db),
      pendingCount: 0,
      ollamaAvailable: false,
      externalApiLabel: '외부 API 대기',
    };
  });

  // 시스템 폰트 조회 (Windows 전용 로직은 필요 시 utils로 이동)
  ipcMain.handle('app:get-system-fonts', () => {
    return []; // 임시 빈 배열 반환
  });

  // 이미지 데이터 URL 변환
  ipcMain.handle('app:read-image-data-url', async (_event, filePath) => {
    if (typeof filePath !== 'string' || !filePath) return null;
    try {
      const stat = await fs.stat(filePath);
      if (!stat.isFile()) return null;
      const ext = path.extname(filePath).toLowerCase();
      const mimeType = ext === '.png' ? 'image/png' : 'image/jpeg';
      const buffer = await fs.readFile(filePath);
      return `data:${mimeType};base64,${buffer.toString('base64')}`;
    } catch {
      return null;
    }
  });

  ipcMain.handle('app:filter-existing-paths', async (_event, paths) => {
    if (!Array.isArray(paths)) {
      return [];
    }

    const resolved = await Promise.all(paths.map(async (value) => {
      try {
        await fs.access(String(value));
        return String(value);
      } catch {
        return null;
      }
    }));

    return resolved.filter(Boolean);
  });

  ipcMain.handle('app:open-path', async (_event, targetPath) => {
    if (typeof targetPath !== 'string' || !targetPath.trim()) {
      return { ok: false, error: '경로가 비어 있습니다.' };
    }

    try {
      const resolvedPath = path.resolve(targetPath);
      const result = await shell.openPath(resolvedPath);
      if (result) {
        return { ok: false, error: result };
      }
      return { ok: true, path: resolvedPath };
    } catch (error) {
      return { ok: false, error: String(error?.message || error) };
    }
  });

  // 윈도우 제어
  ipcMain.handle('window:minimize', () => mainWindow?.minimize());
  ipcMain.handle('window:maximize-toggle', () => {
    if (!mainWindow) return false;
    if (mainWindow.isMaximized()) {
      mainWindow.unmaximize();
      return false;
    }
    mainWindow.maximize();
    return true;
  });
  ipcMain.handle('window:close', () => mainWindow?.close());
}

module.exports = {
  registerMainHandlers,
};
