const { ipcMain, shell, app } = require('electron');
const path = require('node:path');
const fs = require('node:fs/promises');
const { getDb } = require('../lib/dbEngine.cjs');
const { prepareTrainingFromAutoApproved } = require('../lib/mlPairTraining.cjs');
const { resetAllDatasetRelatedData } = require('../lib/datasetReset.cjs');

function resolveDatasetRoot() {
  return path.join(app.getPath('userData'), 'ml_dataset');
}

function resolveMlArtifactsRoot() {
  return path.join(__dirname, '..', '..', 'scripts', 'LightGBM_ML', 'artifacts');
}

async function exists(targetPath) {
  try {
    await fs.access(targetPath);
    return true;
  } catch {
    return false;
  }
}

async function countNonEmptyLines(filePath) {
  try {
    const raw = await fs.readFile(filePath, 'utf8');
    return raw.split(/\r?\n/).filter((line) => line.trim().length > 0).length;
  } catch {
    return 0;
  }
}

async function tailJsonlObjects(filePath, limit) {
  try {
    const raw = await fs.readFile(filePath, 'utf8');
    const lines = raw
      .split(/\r?\n/)
      .map((line) => line.trim())
      .filter(Boolean);
    const tail = lines.slice(Math.max(0, lines.length - limit));
    const items = [];
    for (const line of tail) {
      try {
        items.push(JSON.parse(line));
      } catch {
        // ignore malformed line
      }
    }
    return items.reverse();
  } catch {
    return [];
  }
}

async function collectRootStats(rootPath) {
  const imageExt = new Set(['.png', '.jpg', '.jpeg', '.webp', '.gif', '.bmp', '.tif', '.tiff']);
  let totalSizeBytes = 0;
  let imageCount = 0;
  const stack = [rootPath];
  while (stack.length) {
    const current = stack.pop();
    let entries = [];
    try {
      entries = await fs.readdir(current, { withFileTypes: true });
    } catch {
      continue;
    }
    for (const entry of entries) {
      const fullPath = path.join(current, entry.name);
      if (entry.isDirectory()) {
        stack.push(fullPath);
        continue;
      }
      if (!entry.isFile()) {
        continue;
      }
      try {
        const stat = await fs.stat(fullPath);
        totalSizeBytes += stat.size;
      } catch {
        // ignore unreadable files
      }
      if (imageExt.has(path.extname(entry.name).toLowerCase())) {
        imageCount += 1;
      }
    }
  }
  return { totalSizeBytes, imageCount };
}

function getSentenceEditStats() {
  const db = getDb();
  const row = db.prepare(`
    SELECT
      COUNT(*) AS totalEdits,
      SUM(CASE WHEN content_kind = 'txt_reference_replace' THEN 1 ELSE 0 END) AS txtReferenceReplaceCount,
      SUM(CASE WHEN final_action = 'auto_txt_replace' THEN 1 ELSE 0 END) AS autoTxtReplaceCount,
      SUM(CASE WHEN content_kind = 'txt_reference_replace' AND original_text <> edited_text THEN 1 ELSE 0 END) AS txtChangedCount,
      MAX(CASE WHEN final_action = 'auto_txt_replace' THEN updated_at ELSE NULL END) AS lastAutoTxtReplaceAt
    FROM sentence_edits
  `).get();
  return {
    totalEdits: Number(row?.totalEdits || 0),
    txtReferenceReplaceCount: Number(row?.txtReferenceReplaceCount || 0),
    autoTxtReplaceCount: Number(row?.autoTxtReplaceCount || 0),
    txtChangedCount: Number(row?.txtChangedCount || 0),
    lastAutoTxtReplaceAt: row?.lastAutoTxtReplaceAt || null,
  };
}

function registerDatasetHandlers(mainWindow) {
  // ML 데이터셋 통계 조회
  ipcMain.handle('dataset:get-stats', async () => {
    const rootPath = resolveDatasetRoot();
    const rootExists = await exists(rootPath);
    const rootStats = rootExists
      ? await collectRootStats(rootPath)
      : { totalSizeBytes: 0, imageCount: 0 };
    const labelsCount = await countNonEmptyLines(path.join(rootPath, 'labels.jsonl'));
    const featureLines = await countNonEmptyLines(path.join(rootPath, 'train_features.csv'));
    const featureRowCount = featureLines > 0 ? featureLines - 1 : 0;
    const sentenceEditStats = getSentenceEditStats();
    const artifactRoot = resolveMlArtifactsRoot();
    const userLineBreakPairsCount = await countNonEmptyLines(path.join(artifactRoot, 'user_line_break_pairs.jsonl'));
    const trainLineBreakPairsCount = await countNonEmptyLines(path.join(artifactRoot, 'line_break_train.jsonl'));

    return {
      rootPath,
      exists: rootExists,
      totalSizeBytes: rootStats.totalSizeBytes,
      imageCount: rootStats.imageCount,
      labelsCount,
      featureRowCount,
      runCount: 0,
      usedImageCount: 0,
      reviewFileCount: 0,
      runs: [],
      totalEdits: sentenceEditStats.totalEdits,
      txtReferenceReplaceCount: sentenceEditStats.txtReferenceReplaceCount,
      autoTxtReplaceCount: sentenceEditStats.autoTxtReplaceCount,
      txtChangedCount: sentenceEditStats.txtChangedCount,
      lastAutoTxtReplaceAt: sentenceEditStats.lastAutoTxtReplaceAt,
      userLineBreakPairsCount,
      trainLineBreakPairsCount,
    };
  });

  ipcMain.handle('dataset:open-root', async () => {
    const rootPath = resolveDatasetRoot();
    await fs.mkdir(rootPath, { recursive: true });
    await shell.openPath(rootPath);
    return { ok: true, path: rootPath };
  });

  ipcMain.handle('dataset:export-zip', async () => {
    return { ok: false, error: 'cancelled' };
  });

  ipcMain.handle('dataset:cleanup-artifacts', async () => {
    return { ok: true, removedDirCount: 0, freedBytes: 0 };
  });

  ipcMain.handle('dataset:confirm-reset-flow', async () => {
    return { action: 'cancel' };
  });

  ipcMain.handle('dataset:prepare-training', async (_event, minPairs = 500) => {
    return prepareTrainingFromAutoApproved(Number(minPairs || 500));
  });

  ipcMain.handle('dataset:reset-all-data', async () => {
    return resetAllDatasetRelatedData();
  });

  ipcMain.handle('dataset:get-preview', async () => {
    const db = getDb();
    const autoTxtRows = db.prepare(`
      SELECT
        file_name AS fileName,
        line_start AS lineStart,
        substr(replace(original_text, char(10), ' '), 1, 180) AS beforePreview,
        substr(replace(edited_text, char(10), ' '), 1, 180) AS afterPreview,
        updated_at AS updatedAt
      FROM sentence_edits
      WHERE final_action = 'auto_txt_replace'
      ORDER BY updated_at DESC
      LIMIT 30
    `).all();
    const recentDocuments = db.prepare(`
      SELECT file_name AS fileName, updated_at AS updatedAt
      FROM documents
      ORDER BY updated_at DESC
      LIMIT 10
    `).all();
    const artifactRoot = resolveMlArtifactsRoot();
    const userPairs = await tailJsonlObjects(path.join(artifactRoot, 'user_line_break_pairs.jsonl'), 20);
    const trainPairs = await tailJsonlObjects(path.join(artifactRoot, 'line_break_train.jsonl'), 20);
    const pickPair = (row) => ({
      label: String(row?.label || ''),
      left: String(row?.left || '').replace(/\s+/g, ' ').trim().slice(0, 120),
      right: String(row?.right || '').replace(/\s+/g, ' ').trim().slice(0, 120),
      sourceId: String(row?.source_id || ''),
    });

    return {
      autoTxtRows: autoTxtRows.map((row) => ({
        fileName: String(row.fileName || ''),
        lineStart: Number(row.lineStart || 0),
        beforePreview: String(row.beforePreview || ''),
        afterPreview: String(row.afterPreview || ''),
        updatedAt: row.updatedAt || null,
      })),
      recentDocuments: recentDocuments.map((row) => ({
        fileName: String(row.fileName || ''),
        updatedAt: row.updatedAt || null,
      })),
      userPairs: userPairs.map(pickPair),
      trainPairs: trainPairs.map(pickPair),
    };
  });
}

module.exports = { registerDatasetHandlers };
