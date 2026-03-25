const { ipcMain } = require('electron');
const fs = require('node:fs/promises');
const path = require('node:path');
const { getDb } = require('../lib/dbEngine.cjs');
const { extractEditPatches, walkFiles } = require('../lib/utils.cjs');
const { upsertDocumentRecord } = require('./document/shared.cjs');

function isTextLikeFile(filePath) {
  const ext = path.extname(filePath).toLowerCase();
  return ['.md', '.txt', '.srt'].includes(ext);
}

function makeFolderSearchMatches(filePath, content, query) {
  const matches = [];
  const lines = String(content || '').split(/\r?\n/);
  for (let lineIndex = 0; lineIndex < lines.length; lineIndex += 1) {
    const lineText = lines[lineIndex];
    let cursor = 0;
    while (cursor <= lineText.length - query.length) {
      const found = lineText.indexOf(query, cursor);
      if (found === -1) break;
      matches.push({
        filePath,
        fileName: path.basename(filePath),
        lineNumber: lineIndex + 1,
        lineText,
        start: found,
        end: found + query.length,
      });
      cursor = found + Math.max(1, query.length);
    }
  }
  return matches;
}

function registerFolderHandlers() {
  const db = getDb();

  ipcMain.handle('folder:search-text', async (_event, payload) => {
    const folderPath = String(payload?.folderPath || '').trim();
    const query = String(payload?.query || '');
    if (!folderPath || !query) {
      return [];
    }

    const files = await walkFiles(folderPath);
    const textFiles = files.filter(isTextLikeFile);
    const allMatches = [];

    for (const filePath of textFiles) {
      try {
        // eslint-disable-next-line no-await-in-loop
        const content = await fs.readFile(filePath, 'utf8');
        allMatches.push(...makeFolderSearchMatches(filePath, content, query));
      } catch {
        // 읽기 실패 파일은 건너뜀
      }
    }

    return allMatches;
  });

  ipcMain.handle('folder:replace-text', async (_event, payload) => {
    const folderPath = String(payload?.folderPath || '').trim();
    const query = String(payload?.query || '');
    const replaceValue = String(payload?.replaceValue ?? '');
    if (!folderPath || !query) {
      return { changedFiles: [], changedFileCount: 0, replacementCount: 0 };
    }

    const files = await walkFiles(folderPath);
    const textFiles = files.filter(isTextLikeFile);
    const changedDocs = [];
    let replacementCount = 0;

    for (const filePath of textFiles) {
      let content = '';
      try {
        // eslint-disable-next-line no-await-in-loop
        content = await fs.readFile(filePath, 'utf8');
      } catch {
        continue;
      }

      const occurrences = content.split(query).length - 1;
      if (occurrences <= 0) {
        continue;
      }

      const nextContent = content.split(query).join(replaceValue);
      replacementCount += occurrences;
      // eslint-disable-next-line no-await-in-loop
      await fs.writeFile(filePath, nextContent, 'utf8');
      extractEditPatches(content, nextContent); // side-effect free; kept for compatibility mindset

      const doc = upsertDocumentRecord(db, {
        filePath,
        fileName: path.basename(filePath),
        content: nextContent,
        markSaved: true,
      });
      changedDocs.push(doc);
    }

    return {
      changedFiles: changedDocs,
      changedFileCount: changedDocs.length,
      replacementCount,
    };
  });
}

module.exports = {
  registerFolderHandlers,
};
