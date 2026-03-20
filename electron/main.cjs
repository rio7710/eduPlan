const { app, BrowserWindow, dialog, ipcMain, shell } = require('electron');
const path = require('node:path');
const crypto = require('node:crypto');
const fs = require('node:fs/promises');
const { existsSync, mkdirSync } = require('node:fs');
const { execFile, execFileSync } = require('node:child_process');
const { DatabaseSync } = require('node:sqlite');

let mainWindow = null;
let db = null;
const rendererDevUrl = process.env.VITE_DEV_SERVER_URL;
const TEXT_FILE_EXTENSIONS = new Set(['.txt', '.md', '.markdown', '.srt', '.vtt', '.html', '.htm']);
const EXPLORER_FILE_EXTENSIONS = new Set([...TEXT_FILE_EXTENSIONS, '.pdf']);
const hasSingleInstanceLock = app.requestSingleInstanceLock();

if (!hasSingleInstanceLock) {
  app.quit();
}

function isPdfPath(filePath) {
  return path.extname(String(filePath || '')).toLowerCase() === '.pdf';
}

function toIsoNow() {
  return new Date().toISOString();
}

function countBlocks(content) {
  return content
    .split(/\n{2,}/)
    .map((chunk) => chunk.trim())
    .filter(Boolean).length;
}

function tokenizeWords(value) {
  return String(value || '')
    .trim()
    .split(/\s+/)
    .filter(Boolean);
}

function takeContextWindow(text, fromStart = false, wordCount = 3) {
  const words = tokenizeWords(text);
  if (!words.length) {
    return '';
  }

  return fromStart
    ? words.slice(0, wordCount).join(' ')
    : words.slice(Math.max(0, words.length - wordCount)).join(' ');
}

function extractWindowedChange(oldText, newText) {
  const oldLines = String(oldText || '').split(/\r?\n/).map((line) => line.trim()).filter(Boolean);
  const newLines = String(newText || '').split(/\r?\n/).map((line) => line.trim()).filter(Boolean);
  const oldJoined = oldLines.join(' ').trim();
  const newJoined = newLines.join(' ').trim();

  const oldWords = tokenizeWords(oldJoined);
  const newWords = tokenizeWords(newJoined);
  const sharedPrefix = [];
  let cursor = 0;
  while (cursor < oldWords.length && cursor < newWords.length && oldWords[cursor] === newWords[cursor]) {
    sharedPrefix.push(oldWords[cursor]);
    cursor += 1;
  }

  return {
    originalWindow: oldJoined || oldText.trim(),
    editedWindow: newJoined || newText.trim(),
    contextBefore: sharedPrefix.slice(Math.max(0, sharedPrefix.length - 3)).join(' '),
  };
}

function extractFocusedWordWindow(oldText, newText, contextWordCount = 4) {
  const oldWords = tokenizeWords(oldText);
  const newWords = tokenizeWords(newText);

  let prefixLength = 0;
  while (
    prefixLength < oldWords.length &&
    prefixLength < newWords.length &&
    oldWords[prefixLength] === newWords[prefixLength]
  ) {
    prefixLength += 1;
  }

  let oldSuffixLength = oldWords.length - 1;
  let newSuffixLength = newWords.length - 1;
  while (
    oldSuffixLength >= prefixLength &&
    newSuffixLength >= prefixLength &&
    oldWords[oldSuffixLength] === newWords[newSuffixLength]
  ) {
    oldSuffixLength -= 1;
    newSuffixLength -= 1;
  }

  const leftContext = oldWords.slice(Math.max(0, prefixLength - contextWordCount), prefixLength).join(' ');
  const rightContext = oldWords.slice(
    Math.max(prefixLength, oldSuffixLength + 1),
    Math.min(oldWords.length, oldSuffixLength + 1 + contextWordCount),
  ).join(' ');
  const originalFocus = oldWords.slice(prefixLength, Math.max(prefixLength, oldSuffixLength + 1)).join(' ');
  const editedFocus = newWords.slice(prefixLength, Math.max(prefixLength, newSuffixLength + 1)).join(' ');

  return {
    leftContext,
    rightContext,
    originalFocus: originalFocus || String(oldText || '').trim(),
    editedFocus: editedFocus || String(newText || '').trim(),
  };
}

function inferEditPatchType(oldChunk, newChunk) {
  const oldCompact = oldChunk.replace(/\s+/g, '');
  const newCompact = newChunk.replace(/\s+/g, '');
  if (oldCompact === newCompact && oldChunk !== newChunk) {
    return 'spacing';
  }

  const oldLineCount = oldChunk.split(/\r?\n/).filter(Boolean).length;
  const newLineCount = newChunk.split(/\r?\n/).filter(Boolean).length;
  if (oldLineCount > 1 && newLineCount === 1) {
    return 'merge';
  }
  if (oldLineCount === 1 && newLineCount > 1) {
    return 'split';
  }
  return 'typo';
}

function extractEditPatches(previousContent, nextContent) {
  const previousLines = String(previousContent || '').split(/\r?\n/);
  const nextLines = String(nextContent || '').split(/\r?\n/);
  const maxLength = Math.max(previousLines.length, nextLines.length);
  const changedLineIndexes = [];

  for (let index = 0; index < maxLength; index += 1) {
    if ((previousLines[index] ?? '') !== (nextLines[index] ?? '')) {
      changedLineIndexes.push(index);
    }
  }

  if (!changedLineIndexes.length) {
    return [];
  }

  const groups = [];
  let current = [changedLineIndexes[0]];
  for (let index = 1; index < changedLineIndexes.length; index += 1) {
    const lineIndex = changedLineIndexes[index];
    if (lineIndex - current[current.length - 1] <= 1) {
      current.push(lineIndex);
      continue;
    }
    groups.push(current);
    current = [lineIndex];
  }
  groups.push(current);

  return groups.map((group, groupIndex) => {
    const start = Math.max(0, group[0] - 1);
    const end = group[group.length - 1] + 1;
    const oldChunk = previousLines.slice(start, end + 1).join('\n').trim();
    const newChunk = nextLines.slice(start, end + 1).join('\n').trim();
    const { originalWindow, editedWindow, contextBefore } = extractWindowedChange(oldChunk, newChunk);
    const changeType = inferEditPatchType(oldChunk, newChunk);

    return {
      patchIndex: groupIndex + 1,
      lineStart: start + 1,
      lineEnd: end + 1,
      changeType,
      originalText: oldChunk,
      editedText: newChunk,
      originalWindow,
      editedWindow,
      diffSummary: `${contextBefore ? `[ctx] ${contextBefore}\n` : ''}- ${originalWindow || oldChunk}\n+ ${editedWindow || newChunk}`,
    };
  }).filter((patch) => patch.originalText !== patch.editedText);
}

function escapeRegExp(value) {
  return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

async function walkFiles(rootPath) {
  const entries = await fs.readdir(rootPath, { withFileTypes: true });
  const nested = await Promise.all(
    entries.map(async (entry) => {
      const fullPath = path.join(rootPath, entry.name);
      if (entry.isDirectory()) {
        return walkFiles(fullPath);
      }
      return [fullPath];
    }),
  );

  return nested.flat();
}

async function listDirectFiles(rootPath) {
  const entries = await fs.readdir(rootPath, { withFileTypes: true });
  return entries
    .filter((entry) => entry.isFile())
    .map((entry) => path.join(rootPath, entry.name));
}

async function collectFolderEntries(folderPath, includeSubfolders = true) {
  const files = includeSubfolders
    ? await walkFiles(folderPath)
    : await listDirectFiles(folderPath);
  const allowedFiles = files.filter((filePath) => EXPLORER_FILE_EXTENSIONS.has(path.extname(filePath).toLowerCase()));

  return Promise.all(
    allowedFiles.map(async (filePath, index) => {
      const stat = await fs.stat(filePath);
      const ext = path.extname(filePath).toLowerCase();
      return {
        id: `file-${index + 1}`,
        name: path.relative(folderPath, filePath),
        path: filePath,
        ext,
        kind: ext.slice(1),
        size: `${(stat.size / 1024 / 1024).toFixed(1)} MB`,
        selected: true,
      };
    }),
  );
}

async function openFolderFromPath(folderPath, includeSubfolders = true) {
  if (!folderPath) {
    return null;
  }

  const stat = await fs.stat(folderPath).catch(() => null);
  if (!stat?.isDirectory()) {
    return null;
  }

  const files = await collectFolderEntries(folderPath, includeSubfolders);
  return {
    path: folderPath,
    includeSubfolders,
    files,
  };
}

async function getSearchableTextFiles(folderPath) {
  const files = await walkFiles(folderPath);
  return files.filter((filePath) => TEXT_FILE_EXTENSIONS.has(path.extname(filePath).toLowerCase()));
}

async function searchInFolder(folderPath, query) {
  const trimmedQuery = String(query || '').trim();
  if (!folderPath || !trimmedQuery) {
    return [];
  }

  const matcher = new RegExp(escapeRegExp(trimmedQuery), 'gi');
  const files = await getSearchableTextFiles(folderPath);
  const results = [];

  for (const filePath of files) {
    const content = await fs.readFile(filePath, 'utf8');
    const lines = content.split(/\r?\n/);

    lines.forEach((lineText, index) => {
      matcher.lastIndex = 0;
      let match = matcher.exec(lineText);
      while (match) {
        const value = match[0] || '';
        results.push({
          filePath,
          fileName: path.relative(folderPath, filePath),
          lineNumber: index + 1,
          lineText,
          start: match.index,
          end: match.index + value.length,
        });

        if (!value.length) {
          break;
        }
        match = matcher.exec(lineText);
      }
    });
  }

  return results;
}

async function replaceInFolder(folderPath, query, replaceValue) {
  const trimmedQuery = String(query || '').trim();
  if (!folderPath || !trimmedQuery) {
    return { changedFiles: [], changedFileCount: 0, replacementCount: 0 };
  }

  const matcher = new RegExp(escapeRegExp(trimmedQuery), 'gi');
  const files = await getSearchableTextFiles(folderPath);
  const changedFiles = [];
  let replacementCount = 0;

  for (const filePath of files) {
    const original = await fs.readFile(filePath, 'utf8');
    const matches = original.match(matcher);
    if (!matches?.length) {
      continue;
    }

    replacementCount += matches.length;
    const nextContent = original.replace(matcher, String(replaceValue ?? ''));
    await fs.writeFile(filePath, nextContent, 'utf8');

    const fileName = path.basename(filePath);
    const updatedDoc = upsertDocument({
      filePath,
      fileName,
      content: nextContent,
      markSaved: true,
    });

    changedFiles.push(updatedDoc);
    queueSyncEvent(updatedDoc.id, 'document_saved', {
      filePath,
      fileName,
      size: Buffer.byteLength(nextContent, 'utf8'),
      source: 'folder_replace',
    });
  }

  return {
    changedFiles,
    changedFileCount: changedFiles.length,
    replacementCount,
  };
}

function ensureDatabase() {
  const dbDir = path.join(app.getPath('userData'), 'data');
  if (!existsSync(dbDir)) {
    mkdirSync(dbDir, { recursive: true });
  }

  db = new DatabaseSync(path.join(dbDir, 'edufixer.sqlite'));
  db.exec(`
    CREATE TABLE IF NOT EXISTS documents (
      id TEXT PRIMARY KEY,
      file_name TEXT NOT NULL,
      file_path TEXT UNIQUE,
      content TEXT NOT NULL DEFAULT '',
      block_count INTEGER NOT NULL DEFAULT 0,
      last_opened_at TEXT,
      last_saved_at TEXT,
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS sync_queue (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      document_id TEXT NOT NULL,
      event_type TEXT NOT NULL,
      payload_json TEXT NOT NULL,
      retry_count INTEGER NOT NULL DEFAULT 0,
      synced_at TEXT,
      created_at TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS app_settings (
      key TEXT PRIMARY KEY,
      value TEXT NOT NULL,
      updated_at TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS hierarchy_candidates (
      id TEXT PRIMARY KEY,
      markdown_path TEXT NOT NULL,
      pattern_kind TEXT NOT NULL,
      candidate_text TEXT NOT NULL,
      recommendation_label TEXT NOT NULL,
      sample_lines_json TEXT NOT NULL,
      sample_texts_json TEXT NOT NULL,
      status TEXT NOT NULL DEFAULT 'pending',
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS hierarchy_labels (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      candidate_id TEXT NOT NULL,
      markdown_path TEXT NOT NULL,
      pattern_kind TEXT NOT NULL,
      candidate_text TEXT NOT NULL,
      final_action TEXT NOT NULL,
      final_label TEXT NOT NULL DEFAULT '',
      recommendation_label TEXT NOT NULL,
      sample_lines_json TEXT NOT NULL,
      sample_texts_json TEXT NOT NULL,
      created_at TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS edit_patches (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      document_path TEXT NOT NULL,
      file_name TEXT NOT NULL,
      line_start INTEGER NOT NULL,
      line_end INTEGER NOT NULL,
      change_type TEXT NOT NULL,
      original_text TEXT NOT NULL,
      edited_text TEXT NOT NULL,
      original_window TEXT NOT NULL,
      edited_window TEXT NOT NULL,
      diff_summary TEXT NOT NULL,
      created_at TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS sentence_edits (
      id TEXT PRIMARY KEY,
      document_path TEXT NOT NULL,
      file_name TEXT NOT NULL,
      content_kind TEXT NOT NULL,
      action TEXT NOT NULL,
      change_type TEXT NOT NULL,
      line_start INTEGER NOT NULL,
      line_end INTEGER NOT NULL,
      original_text TEXT NOT NULL,
      edited_text TEXT NOT NULL,
      original_window TEXT NOT NULL,
      edited_window TEXT NOT NULL,
      diff_summary TEXT NOT NULL,
      quality_score REAL NOT NULL DEFAULT 0,
      review_status TEXT NOT NULL DEFAULT 'pending',
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS logo_reviews (
      id TEXT PRIMARY KEY,
      source_pdf_name TEXT NOT NULL,
      source_pdf_path TEXT NOT NULL,
      markdown_path TEXT NOT NULL,
      review_dir TEXT NOT NULL,
      preview_image_path TEXT NOT NULL DEFAULT '',
      candidate_count INTEGER NOT NULL DEFAULT 0,
      member_paths_json TEXT NOT NULL,
      recommendation_source TEXT,
      py_score REAL,
      ml_score REAL,
      py_label TEXT,
      ml_label TEXT,
      status TEXT NOT NULL DEFAULT 'pending',
      final_action TEXT NOT NULL DEFAULT '',
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL
    );
  `);

  try {
    db.exec(`ALTER TABLE hierarchy_labels ADD COLUMN final_label TEXT NOT NULL DEFAULT ''`);
  } catch {}
}

function getMlDatasetRoot() {
  return path.join(app.getPath('userData'), 'ml-dataset');
}

async function countLines(filePath) {
  const stat = await fs.stat(filePath).catch(() => null);
  if (!stat?.isFile()) {
    return 0;
  }

  const content = await fs.readFile(filePath, 'utf8');
  return content
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter(Boolean).length;
}

async function getDirectorySizeBytes(dirPath) {
  const stat = await fs.stat(dirPath).catch(() => null);
  if (!stat?.isDirectory()) {
    return 0;
  }

  const entries = await fs.readdir(dirPath, { withFileTypes: true });
  const sizes = await Promise.all(entries.map(async (entry) => {
    const fullPath = path.join(dirPath, entry.name);
    if (entry.isDirectory()) {
      return getDirectorySizeBytes(fullPath);
    }

    const fileStat = await fs.stat(fullPath).catch(() => null);
    return fileStat?.isFile() ? fileStat.size : 0;
  }));

  return sizes.reduce((sum, value) => sum + value, 0);
}

async function countFilesRecursive(dirPath) {
  const stat = await fs.stat(dirPath).catch(() => null);
  if (!stat?.isDirectory()) {
    return 0;
  }

  const entries = await fs.readdir(dirPath, { withFileTypes: true });
  const counts = await Promise.all(entries.map(async (entry) => {
    const fullPath = path.join(dirPath, entry.name);
    if (entry.isDirectory()) {
      return countFilesRecursive(fullPath);
    }

    return entry.isFile() ? 1 : 0;
  }));

  return counts.reduce((sum, value) => sum + value, 0);
}

async function getMlDatasetStats() {
  const rootPath = getMlDatasetRoot();
  const rootStat = await fs.stat(rootPath).catch(() => null);
  if (!rootStat?.isDirectory()) {
    return {
      rootPath,
      exists: false,
      totalSizeBytes: 0,
      imageCount: 0,
      labelsCount: 0,
      featureRowCount: 0,
      runCount: 0,
      usedImageCount: 0,
      reviewFileCount: 0,
      runs: [],
    };
  }

  const imagesDir = path.join(rootPath, 'images');
  const manifestsDir = path.join(rootPath, 'manifests');
  const runsDir = path.join(rootPath, 'runs');
  const labelsPath = path.join(manifestsDir, 'labels.jsonl');
  const featuresPath = path.join(manifestsDir, 'train_features.csv');

  const [imageCount, labelsCountRaw, featureLineCount, totalSizeBytes] = await Promise.all([
    countFilesRecursive(imagesDir),
    countLines(labelsPath),
    countLines(featuresPath),
    getDirectorySizeBytes(rootPath),
  ]);

  const runEntries = await fs.readdir(runsDir, { withFileTypes: true }).catch(() => []);
  const runs = await Promise.all(
    runEntries
      .filter((entry) => entry.isDirectory())
      .map(async (entry) => {
        const runPath = path.join(runsDir, entry.name);
        const usedImagesDir = path.join(runPath, 'used_images');
        const reviewDir = path.join(runPath, 'review');
        const [runSizeBytes, usedImageCount, reviewFileCount, runStat] = await Promise.all([
          getDirectorySizeBytes(runPath),
          countFilesRecursive(usedImagesDir),
          countFilesRecursive(reviewDir),
          fs.stat(runPath).catch(() => null),
        ]);

        return {
          name: entry.name,
          path: runPath,
          totalSizeBytes: runSizeBytes,
          usedImageCount,
          reviewFileCount,
          updatedAt: runStat?.mtime?.toISOString?.() ?? null,
        };
      }),
  );

  runs.sort((a, b) => {
    const left = a.updatedAt ? new Date(a.updatedAt).getTime() : 0;
    const right = b.updatedAt ? new Date(b.updatedAt).getTime() : 0;
    return right - left;
  });

  return {
    rootPath,
    exists: true,
    totalSizeBytes,
    imageCount,
    labelsCount: labelsCountRaw,
    featureRowCount: Math.max(0, featureLineCount - 1),
    runCount: runs.length,
    usedImageCount: runs.reduce((sum, run) => sum + run.usedImageCount, 0),
    reviewFileCount: runs.reduce((sum, run) => sum + run.reviewFileCount, 0),
    runs: runs.slice(0, 12),
  };
}

async function ensureMlDatasetRoot() {
  const rootPath = getMlDatasetRoot();
  await fs.mkdir(rootPath, { recursive: true });
  return rootPath;
}

function buildDatasetExportName() {
  const date = new Date().toISOString().slice(0, 10);
  return `ml-dataset-${date}.zip`;
}

function mapEditPatchToAction(changeType) {
  if (changeType === 'merge') {
    return 'merge';
  }
  if (changeType === 'split') {
    return 'split';
  }
  if (changeType === 'spacing' || changeType === 'typo') {
    return 'modify';
  }
  return 'modify';
}

function inferSentenceEditKind(patch) {
  const original = String(patch?.originalText || '').trim();
  const edited = String(patch?.editedText || '').trim();
  const merged = `${original}\n${edited}`;
  const lineCount = merged ? merged.split(/\r?\n/).filter(Boolean).length : 0;
  if (lineCount >= 3 || original.length >= 120 || edited.length >= 120) {
    return 'paragraph';
  }
  return 'sentence';
}

function scoreEditPatchQuality(patch) {
  const diffLength = String(patch?.diffSummary || '').trim().length;
  let score = 1.0;

  if (diffLength < 10) {
    score -= 0.5;
  }
  if (diffLength > 5000) {
    score -= 0.3;
  }

  const action = mapEditPatchToAction(patch?.changeType);
  const actionWeight = {
    merge: 1.0,
    split: 1.0,
    modify: 0.8,
    delete: 0.6,
    create: 0.7,
  }[action] ?? 0.5;

  score *= actionWeight;
  return Math.max(0, Math.min(1, Number(score.toFixed(3))));
}

function buildEditPatchDatasetId(filePath, patch) {
  return crypto
    .createHash('sha256')
    .update(JSON.stringify([
      filePath,
      patch.lineStart,
      patch.lineEnd,
      patch.changeType,
      patch.originalText,
      patch.editedText,
    ]))
    .digest('hex');
}

function buildEditPatchConsoleRecord(filePath, fileName, patch) {
  const patchId = buildEditPatchDatasetId(filePath, patch);
  const action = mapEditPatchToAction(patch.changeType);
  const qualityScore = scoreEditPatchQuality(patch);
  const contentKind = inferSentenceEditKind(patch);
  const focusWindow = extractFocusedWordWindow(patch.originalWindow, patch.editedWindow, 4);

  return {
    patch_id: patchId,
    file_name: fileName,
    file_path: filePath,
    content_kind: contentKind,
    edit_type: patch.changeType,
    ml_action: action,
    quality_score: qualityScore,
    line_start: patch.lineStart,
    line_end: patch.lineEnd,
    left_context: focusWindow.leftContext,
    before_focus: focusWindow.originalFocus,
    after_focus: focusWindow.editedFocus,
    right_context: focusWindow.rightContext,
    original_window: patch.originalWindow,
    edited_window: patch.editedWindow,
    diff_summary: patch.diffSummary,
  };
}

async function persistEditPatchesDataset(filePath, fileName, editPatches) {
  if (!Array.isArray(editPatches) || !editPatches.length) {
    return { rowCount: 0 };
  }

  const datasetDir = getMlDatasetRoot();
  const manifestsDir = path.join(datasetDir, 'manifests');
  const editPatchesPath = path.join(manifestsDir, 'edit_patches.jsonl');
  const editFeaturesPath = path.join(manifestsDir, 'edit_patch_features.csv');

  await fs.mkdir(manifestsDir, { recursive: true });

  const featureHeader = [
    'patch_id',
    'document_path',
    'file_name',
    'line_start',
    'line_end',
    'change_type',
    'action',
    'quality_score',
    'original_length',
    'edited_length',
    'window_delta',
    'created_at',
  ].join(',');
  const featureStat = await fs.stat(editFeaturesPath).catch(() => null);
  if (!featureStat?.isFile()) {
    await appendTextLine(editFeaturesPath, featureHeader);
  }

  const createdAt = toIsoNow();
  for (const patch of editPatches) {
    const patchId = buildEditPatchDatasetId(filePath, patch);
    const action = mapEditPatchToAction(patch.changeType);
    const qualityScore = scoreEditPatchQuality(patch);
    const originalLength = String(patch.originalText || '').length;
    const editedLength = String(patch.editedText || '').length;
    const record = {
      id: patchId,
      schema_version: '1.0',
      source_document_id: filePath,
      source_file_name: fileName,
      action,
      original_blocks: [
        {
          block_id: `${patchId}:original`,
          type: 'text',
          content: patch.originalText,
          line_start: patch.lineStart,
          line_end: patch.lineEnd,
        },
      ],
      result_blocks: [
        {
          block_id: `${patchId}:edited`,
          type: 'text',
          content: patch.editedText,
          line_start: patch.lineStart,
          line_end: patch.lineEnd,
        },
      ],
      diff: patch.diffSummary,
      quality_score: qualityScore,
      review_status: qualityScore >= 0.7 ? 'pending' : 'archived',
      metadata: {
        change_type: patch.changeType,
        original_window: patch.originalWindow,
        edited_window: patch.editedWindow,
      },
      created_at: createdAt,
    };

    await appendTextLine(editPatchesPath, JSON.stringify(record));
    await appendTextLine(
      editFeaturesPath,
      [
        JSON.stringify(patchId),
        JSON.stringify(filePath),
        JSON.stringify(fileName),
        patch.lineStart,
        patch.lineEnd,
        JSON.stringify(patch.changeType),
        JSON.stringify(action),
        qualityScore,
        originalLength,
        editedLength,
        editedLength - originalLength,
        JSON.stringify(createdAt),
      ].join(','),
    );
  }

  return { rowCount: editPatches.length };
}

function persistSentenceEdits(filePath, fileName, editPatches) {
  if (!Array.isArray(editPatches) || !editPatches.length) {
    return 0;
  }

  const createdAt = toIsoNow();
  const upsertSentenceEdit = db.prepare(`
    INSERT INTO sentence_edits (
      id, document_path, file_name, content_kind, action, change_type,
      line_start, line_end, original_text, edited_text, original_window, edited_window,
      diff_summary, quality_score, review_status, created_at, updated_at
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    ON CONFLICT(id) DO UPDATE SET
      content_kind = excluded.content_kind,
      action = excluded.action,
      change_type = excluded.change_type,
      line_start = excluded.line_start,
      line_end = excluded.line_end,
      original_text = excluded.original_text,
      edited_text = excluded.edited_text,
      original_window = excluded.original_window,
      edited_window = excluded.edited_window,
      diff_summary = excluded.diff_summary,
      quality_score = excluded.quality_score,
      review_status = excluded.review_status,
      updated_at = excluded.updated_at
  `);

  editPatches.forEach((patch) => {
    const patchId = buildEditPatchDatasetId(filePath, patch);
    const qualityScore = scoreEditPatchQuality(patch);
    upsertSentenceEdit.run(
      patchId,
      filePath,
      fileName,
      inferSentenceEditKind(patch),
      mapEditPatchToAction(patch.changeType),
      patch.changeType,
      patch.lineStart,
      patch.lineEnd,
      patch.originalText,
      patch.editedText,
      patch.originalWindow,
      patch.editedWindow,
      patch.diffSummary,
      qualityScore,
      qualityScore >= 0.7 ? 'pending' : 'archived',
      createdAt,
      createdAt,
    );
  });

  return editPatches.length;
}

function upsertLogoReviewRecords(reviewItems) {
  if (!Array.isArray(reviewItems) || !reviewItems.length) {
    return;
  }

  const now = toIsoNow();
  const upsertLogoReview = db.prepare(`
    INSERT INTO logo_reviews (
      id, source_pdf_name, source_pdf_path, markdown_path, review_dir, preview_image_path,
      candidate_count, member_paths_json, recommendation_source, py_score, ml_score,
      py_label, ml_label, status, final_action, created_at, updated_at
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    ON CONFLICT(id) DO UPDATE SET
      source_pdf_name = excluded.source_pdf_name,
      source_pdf_path = excluded.source_pdf_path,
      markdown_path = excluded.markdown_path,
      review_dir = excluded.review_dir,
      preview_image_path = excluded.preview_image_path,
      candidate_count = excluded.candidate_count,
      member_paths_json = excluded.member_paths_json,
      recommendation_source = excluded.recommendation_source,
      py_score = excluded.py_score,
      ml_score = excluded.ml_score,
      py_label = excluded.py_label,
      ml_label = excluded.ml_label,
      updated_at = excluded.updated_at
  `);

  reviewItems.forEach((item) => {
    upsertLogoReview.run(
      item.id,
      item.sourcePdfName ?? '',
      item.sourcePdfPath ?? '',
      item.markdownPath ?? '',
      item.reviewDir ?? '',
      item.previewImagePath ?? '',
      Number(item.candidateCount ?? 0),
      JSON.stringify(Array.isArray(item.memberPaths) ? item.memberPaths : []),
      item.recommendationSource ?? null,
      item.pyScore ?? null,
      item.mlScore ?? null,
      item.pyLabel ?? null,
      item.mlLabel ?? null,
      item.status ?? 'pending',
      '',
      item.createdAt || now,
      now,
    );
  });
}

function updateLogoReviewRecord(payload, action) {
  db.prepare(`
    UPDATE logo_reviews
    SET status = ?, final_action = ?, updated_at = ?
    WHERE id = ?
  `).run(
    action === 'approve' ? 'approved' : 'rejected',
    action,
    toIsoNow(),
    payload?.id ?? '',
  );
}

async function openMlDatasetRoot() {
  const rootPath = await ensureMlDatasetRoot();
  const error = await shell.openPath(rootPath);
  if (error) {
    return { ok: false, error };
  }

  return { ok: true, path: rootPath };
}

async function exportMlDatasetZip() {
  const rootPath = getMlDatasetRoot();
  const rootStat = await fs.stat(rootPath).catch(() => null);
  if (!rootStat?.isDirectory()) {
    return { ok: false, error: 'ML 데이터 폴더가 아직 없습니다.' };
  }

  const saveDialog = await dialog.showSaveDialog(mainWindow, {
    title: 'ML Dataset ZIP 내보내기',
    defaultPath: path.join(app.getPath('downloads'), buildDatasetExportName()),
    filters: [{ name: 'ZIP Archive', extensions: ['zip'] }],
  });

  if (saveDialog.canceled || !saveDialog.filePath) {
    return { ok: false, error: 'cancelled' };
  }

  const destinationPath = saveDialog.filePath;
  await fs.rm(destinationPath, { force: true }).catch(() => null);
  await runExecFile(
    'powershell',
    [
      '-NoProfile',
      '-Command',
      'Compress-Archive -Path $args[0] -DestinationPath $args[1] -Force',
      path.join(rootPath, '*'),
      destinationPath,
    ],
    { windowsHide: true },
  );

  return { ok: true, zipPath: destinationPath };
}

async function cleanupMlDatasetArtifacts() {
  const runsDir = path.join(getMlDatasetRoot(), 'runs');
  const runEntries = await fs.readdir(runsDir, { withFileTypes: true }).catch(() => []);
  let removedDirCount = 0;
  let freedBytes = 0;

  for (const entry of runEntries) {
    if (!entry.isDirectory()) {
      continue;
    }

    for (const subDirName of ['review', 'unused_images']) {
      const targetDir = path.join(runsDir, entry.name, subDirName);
      const targetStat = await fs.stat(targetDir).catch(() => null);
      if (!targetStat?.isDirectory()) {
        continue;
      }

      freedBytes += await getDirectorySizeBytes(targetDir);
      await fs.rm(targetDir, { recursive: true, force: true });
      removedDirCount += 1;
    }
  }

  return { ok: true, removedDirCount, freedBytes };
}

async function resetMlDataset() {
  const rootPath = getMlDatasetRoot();
  const rootStat = await fs.stat(rootPath).catch(() => null);
  if (!rootStat?.isDirectory()) {
    return { ok: true, action: 'reset', removedDirCount: 0, freedBytes: 0 };
  }

  const freedBytes = await getDirectorySizeBytes(rootPath);
  await fs.rm(rootPath, { recursive: true, force: true });
  return { ok: true, action: 'reset', removedDirCount: 1, freedBytes };
}

async function confirmMlDatasetResetFlow() {
  const result = await dialog.showMessageBox(mainWindow, {
    type: 'question',
    buttons: ['네', '나중에', '취소'],
    defaultId: 0,
    cancelId: 2,
    title: '서버 이관 예약',
    message: '현재 ML 데이터를 서버 이관 대상으로 예약할까요?',
    detail: '네: SQLite 큐에 추가하고 로컬 데이터는 그대로 유지합니다.\n나중에: 지금은 아무 작업도 하지 않습니다.\n취소: 창만 닫습니다.',
    noLink: true,
  });

  if (result.response === 0) {
    queueSyncEvent('ml-dataset', 'ml_dataset_upload', {
      rootPath: getMlDatasetRoot(),
      requestedAt: toIsoNow(),
    });
    return { ok: true, action: 'upload' };
  }

  return { ok: false, action: 'cancel', error: 'cancelled' };
}

function getSyncStatus() {
  const pendingCount = Number(
    db.prepare(`
      SELECT COUNT(*) AS count
      FROM sync_queue
      WHERE event_type = 'ml_dataset_upload' AND synced_at IS NULL
    `).get()?.count ?? 0,
  );

  let ollamaAvailable = false;
  try {
    execFileSync('ollama', ['--version'], { encoding: 'utf8', stdio: 'ignore', windowsHide: true, timeout: 2000 });
    ollamaAvailable = true;
  } catch {
    ollamaAvailable = false;
  }

  return {
    sqliteConnected: Boolean(db),
    pendingCount,
    ollamaAvailable,
    externalApiLabel: pendingCount ? `외부 API 업로드 대기 ${pendingCount}건` : '외부 API 대기',
  };
}

function sanitizePathSegment(value) {
  return String(value || '')
    .replace(/[<>:"/\\|?*\u0000-\u001F]+/g, '-')
    .replace(/\s+/g, ' ')
    .trim();
}

function parseCandidatePageIndex(fileName) {
  const match = String(fileName || '').match(/_(\d{3})_/);
  return match ? Number(match[1]) : 0;
}

function buildPyScore(candidateCount) {
  return Number(Math.min(0.99, 0.55 + Number(candidateCount || 0) * 0.08).toFixed(2));
}

function mapDocumentRow(row) {
  return {
    id: row.id,
    fileName: row.file_name,
    filePath: row.file_path || '',
    content: row.content,
    blockCount: row.block_count,
    lastOpenedAt: row.last_opened_at,
    lastSavedAt: row.last_saved_at,
  };
}

function getWindowsInstalledFonts() {
  if (process.platform !== 'win32') {
    return [];
  }

  const registryPaths = [
    'HKLM\\SOFTWARE\\Microsoft\\Windows NT\\CurrentVersion\\Fonts',
    'HKCU\\SOFTWARE\\Microsoft\\Windows NT\\CurrentVersion\\Fonts',
  ];

  const fonts = new Set();

  registryPaths.forEach((registryPath) => {
    try {
      const output = execFileSync('reg', ['query', registryPath], { encoding: 'utf8' });
      output
        .split(/\r?\n/)
        .map((line) => line.trim())
        .filter(Boolean)
        .forEach((line) => {
          const match = line.match(/^(.+?)\s+REG_\w+\s+.+$/);
          if (!match) {
            return;
          }

          const fontName = match[1]
            .replace(/\s+\((TrueType|OpenType)\)$/i, '')
            .trim();

          if (!fontName || fontName.startsWith(registryPath)) {
            return;
          }

          fonts.add(fontName);
        });
    } catch {
      // ignore registry read failures and return whatever we collected
    }
  });

  return Array.from(fonts).sort((left, right) => left.localeCompare(right, 'ko-KR'));
}

function queueSyncEvent(documentId, eventType, payload) {
  db.prepare(`
    INSERT INTO sync_queue (document_id, event_type, payload_json, created_at)
    VALUES (?, ?, ?, ?)
  `).run(documentId, eventType, JSON.stringify(payload), toIsoNow());
}

function upsertDocument({ filePath, fileName, content, markSaved }) {
  const now = toIsoNow();
  const id = filePath || `draft:${fileName}`;
  db.prepare(`
    INSERT INTO documents (
      id, file_name, file_path, content, block_count, last_opened_at, last_saved_at, created_at, updated_at
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
    ON CONFLICT(id) DO UPDATE SET
      file_name = excluded.file_name,
      file_path = excluded.file_path,
      content = excluded.content,
      block_count = excluded.block_count,
      last_opened_at = excluded.last_opened_at,
      last_saved_at = excluded.last_saved_at,
      updated_at = excluded.updated_at
  `).run(
    id,
    fileName,
    filePath || null,
    content,
    countBlocks(content),
    now,
    markSaved ? now : null,
    now,
    now,
  );

  const row = db
    .prepare(`
      SELECT id, file_name, file_path, content, block_count, last_opened_at, last_saved_at
      FROM documents
      WHERE id = ?
    `)
    .get(id);

  return mapDocumentRow(row);
}

async function openFromPath(filePath) {
  if (isPdfPath(filePath)) {
    return null;
  }

  const content = await fs.readFile(filePath, 'utf8');
  const fileName = path.basename(filePath);
  const doc = upsertDocument({ filePath, fileName, content, markSaved: true });
  queueSyncEvent(doc.id, 'document_opened', { filePath, fileName });
  return doc;
}

async function saveDocument({ filePath, fileName, content }) {
  let targetPath = filePath;
  if (!targetPath) {
    const saveDialog = await dialog.showSaveDialog(mainWindow, {
      title: '문서 저장',
      defaultPath: fileName || '새 문서.md',
      filters: [
        { name: 'Markdown', extensions: ['md'] },
        { name: 'Text', extensions: ['txt'] },
      ],
    });

    if (saveDialog.canceled || !saveDialog.filePath) {
      return null;
    }

    targetPath = saveDialog.filePath;
  }

  const previousContent = targetPath
    ? await fs.readFile(targetPath, 'utf8').catch(() => '')
    : '';
  const editPatches = extractEditPatches(previousContent, content);

  await fs.writeFile(targetPath, content, 'utf8');
  const doc = upsertDocument({
    filePath: targetPath,
    fileName: path.basename(targetPath),
    content,
    markSaved: true,
  });
  queueSyncEvent(doc.id, 'document_saved', {
    filePath: targetPath,
    fileName: doc.fileName,
    size: Buffer.byteLength(content, 'utf8'),
  });

  if (editPatches.length) {
    const insertPatch = db.prepare(`
      INSERT INTO edit_patches (
        document_path, file_name, line_start, line_end, change_type,
        original_text, edited_text, original_window, edited_window, diff_summary, created_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `);
    const createdAt = toIsoNow();
    editPatches.forEach((patch) => {
      insertPatch.run(
        targetPath,
        doc.fileName,
        patch.lineStart,
        patch.lineEnd,
        patch.changeType,
        patch.originalText,
        patch.editedText,
        patch.originalWindow,
        patch.editedWindow,
        patch.diffSummary,
        createdAt,
      );
    });

    await persistEditPatchesDataset(targetPath, doc.fileName, editPatches);
    console.log('[ml_sentence_dataset]', JSON.stringify({
      filePath: targetPath,
      fileName: doc.fileName,
      patchCount: editPatches.length,
      patches: editPatches.map((patch) => buildEditPatchConsoleRecord(targetPath, doc.fileName, patch)),
    }, null, 2));
  }
  return {
    doc,
    editPatchCount: editPatches.length,
  };
}

async function deleteDocumentPath(filePath) {
  if (!filePath) {
    return { ok: false };
  }

  const resolvedPath = path.resolve(filePath);
  const stat = await fs.stat(resolvedPath).catch(() => null);
  if (!stat?.isFile()) {
    return { ok: false };
  }

  await fs.unlink(resolvedPath);
  db.prepare('DELETE FROM documents WHERE file_path = ? OR id = ?').run(resolvedPath, resolvedPath);
  return { ok: true, filePath: resolvedPath };
}

async function sha256ForFile(filePath) {
  const fileBuffer = await fs.readFile(filePath);
  return crypto.createHash('sha256').update(fileBuffer).digest('hex');
}

async function collectLogoReviewItems({ sourcePdfPath, markdownPath, reviewDir }) {
  const candidateDir = path.join(reviewDir, 'removed_logo_candidates');
  const stat = await fs.stat(candidateDir).catch(() => null);
  if (!stat?.isDirectory()) {
    return [];
  }

  const entries = await fs.readdir(candidateDir, { withFileTypes: true });
  const files = entries
    .filter((entry) => entry.isFile())
    .map((entry) => path.join(candidateDir, entry.name));

  const groups = new Map();
  for (const filePath of files) {
    const sha = await sha256ForFile(filePath);
    const group = groups.get(sha) ?? [];
    group.push(filePath);
    groups.set(sha, group);
  }

  return [...groups.entries()]
    .sort((left, right) => right[1].length - left[1].length)
    .map(([sha, memberPaths], index) => ({
      id: `${path.basename(sourcePdfPath)}:${sha.slice(0, 12)}:${index + 1}`,
      type: 'logo_candidate',
      sourcePdfName: path.basename(sourcePdfPath),
      sourcePdfPath,
      markdownPath,
      reviewDir,
      previewImagePath: memberPaths[0],
      candidateCount: memberPaths.length,
      memberPaths,
      createdAt: toIsoNow(),
      status: 'pending',
      recommendationSource: 'PY',
      pyScore: buildPyScore(memberPaths.length),
      mlScore: null,
      pyLabel: 'delete',
      mlLabel: null,
    }));
}

async function analyzeHierarchyPatterns(markdownPath) {
  if (!markdownPath) {
    return [];
  }

  const resolvedMarkdownPath = path.resolve(markdownPath);
  const markdownStat = await fs.stat(resolvedMarkdownPath).catch(() => null);
  if (!markdownStat?.isFile()) {
    return [];
  }

  const analyzeScriptPath = path.resolve(__dirname, '..', '..', 'scripts', 'analyze_hierarchy_patterns.py');
  const { stdout } = await runPythonScript(
    [analyzeScriptPath, '--markdown', resolvedMarkdownPath],
    {
      cwd: path.resolve(__dirname, '..', '..'),
      windowsHide: true,
    },
  );
  const items = JSON.parse(stdout || '[]');
  if (!Array.isArray(items)) {
    return [];
  }

  const now = toIsoNow();
  const upsertCandidate = db.prepare(`
    INSERT INTO hierarchy_candidates (
      id, markdown_path, pattern_kind, candidate_text, recommendation_label,
      sample_lines_json, sample_texts_json, status, created_at, updated_at
    ) VALUES (?, ?, ?, ?, ?, ?, ?, 'pending', ?, ?)
    ON CONFLICT(id) DO UPDATE SET
      markdown_path = excluded.markdown_path,
      pattern_kind = excluded.pattern_kind,
      candidate_text = excluded.candidate_text,
      recommendation_label = excluded.recommendation_label,
      sample_lines_json = excluded.sample_lines_json,
      sample_texts_json = excluded.sample_texts_json,
      status = 'pending',
      updated_at = excluded.updated_at
  `);

  return items.map((item, index) => {
    const normalized = {
      ...item,
      id: item.id || `${path.basename(resolvedMarkdownPath)}:hierarchy:${index + 1}`,
      type: 'hierarchy_pattern',
      sourcePdfName: path.basename(resolvedMarkdownPath),
      sourcePdfPath: resolvedMarkdownPath,
      markdownPath: resolvedMarkdownPath,
      reviewDir: path.dirname(resolvedMarkdownPath),
      previewImagePath: '',
      memberPaths: [],
      createdAt: now,
      status: 'pending',
      sampleTexts: Array.isArray(item.sampleTexts) ? item.sampleTexts : [],
      sampleLines: Array.isArray(item.sampleLines) ? item.sampleLines : [],
    };

    upsertCandidate.run(
      normalized.id,
      normalized.markdownPath,
      normalized.patternKind,
      normalized.candidateText,
      normalized.recommendationLabel,
      JSON.stringify(normalized.sampleLines),
      JSON.stringify(normalized.sampleTexts),
      now,
      now,
    );

    return normalized;
  });
}

function normalizeHierarchyLine(text) {
  return String(text || '')
    .replace(/^\s{0,8}(#{1,6}\s+|[-*+]\s+)/, '')
    .replace(/^\[[^\[\]]+\]\s*/, '')
    .replace(/^제\s*\d+\s*강(?:\s*[.:])?\s*/, '')
    .replace(/^\d+\)\s*/, '')
    .replace(/^\(\d+\)\s*/, '')
    .replace(/^[①-⑳]\s*/, '')
    .replace(/^<([^>]+)>$/, '$1')
    .replace(/^[■▪]\s*/, '')
    .trim();
}

function formatHierarchyLine(baseText, label) {
  const text = normalizeHierarchyLine(baseText);
  if (!text) {
    return '';
  }

  if (/^heading_[1-4]$/.test(label)) {
    const depth = Number(label.split('_')[1]);
    return `${'#'.repeat(depth)} ${text}`;
  }

  if (/^bullet_[1-4]$/.test(label)) {
    const depth = Number(label.split('_')[1]);
    return `${'  '.repeat(Math.max(0, depth - 1))}- ${text}`;
  }

  if (label === 'page_number_noise' || label === 'header_noise' || label === 'meta_noise' || label === 'excluded') {
    return '';
  }

  return text;
}

function removeRepeatedHierarchyRuns(lines) {
  const seenHeadingKeys = new Set();
  const nextLines = [...lines];
  const activeHeadings = [];

  for (let index = 0; index < nextLines.length; index += 1) {
    const line = nextLines[index];
    if (line.trim() === '---') {
      activeHeadings.length = 0;
      continue;
    }

    const match = line.match(/^(#{1,4})\s+(.+)$/);
    if (!match) {
      continue;
    }

    const level = match[1].length;
    const text = match[2].trim();
    activeHeadings.length = Math.max(0, level - 1);
    const parentPath = activeHeadings.join(' > ');
    const key = `${parentPath}|${level}:${text}`;
    if (!seenHeadingKeys.has(key)) {
      seenHeadingKeys.add(key);
      activeHeadings[level - 1] = text;
      continue;
    }

    nextLines[index] = '';
  }

  return nextLines;
}

async function applyHierarchyCandidateToMarkdown(payload, finalLabel) {
  const markdownPath = path.resolve(payload?.markdownPath || '');
  const stat = await fs.stat(markdownPath).catch(() => null);
  if (!stat?.isFile()) {
    return null;
  }

  const lines = (await fs.readFile(markdownPath, 'utf8')).split(/\r?\n/);
  const getLine = (lineNumber) => lines[lineNumber - 1] ?? '';
  const markLine = (lineNumber, value) => {
    if (lineNumber >= 1 && lineNumber <= lines.length) {
      lines[lineNumber - 1] = value;
    }
  };

  const sampleLineSet = new Set((Array.isArray(payload?.sampleLines) ? payload.sampleLines : []).map((value) => Number(value)).filter(Boolean));
  const candidateText = String(payload?.candidateText || '').trim();
  const patternKind = String(payload?.patternKind || '');

  if (patternKind === 'fixed_section') {
    const isBracketPattern = candidateText.includes('대괄호 섹션');
    const isLecturePattern = candidateText.includes('강 제목');
    lines.forEach((line, index) => {
      const trimmed = line.trim();
      if (isBracketPattern && /^\[[^\[\]]{2,30}\]$/.test(trimmed)) {
        markLine(index + 1, formatHierarchyLine(line, finalLabel));
        return;
      }
      if (isLecturePattern && /^제\s*\d+\s*강(?:\s*[.:])?\s*.+$/.test(trimmed)) {
        markLine(index + 1, formatHierarchyLine(line, finalLabel));
        return;
      }
      if (sampleLineSet.has(index + 1)) {
        markLine(index + 1, formatHierarchyLine(line, finalLabel));
      }
    });
  } else if (patternKind === 'numeric_heading') {
    const isSubPattern = candidateText.includes('하위주제');
    const isParenMainPattern = candidateText.includes('괄호 대주제');
    const isParenSubPattern = candidateText.includes('괄호 중주제');
    const matcher = isParenSubPattern
      ? /^\(\d+\)\s*.+$/
      : isParenMainPattern
        ? /^\d+\)\s*.+$/
        : isSubPattern
          ? /^\d+\.\d+\s+.+$/
          : /^\d+\.\s+.+$/;
    lines.forEach((line, index) => {
      const trimmed = line.trim();
      if (matcher.test(trimmed) && (!isSubPattern || /^\d+\.\d+\s+.+$/.test(trimmed))) {
        markLine(index + 1, formatHierarchyLine(line, finalLabel));
      }
    });
  } else if (patternKind === 'symbol_heading') {
    const isBulletPattern = candidateText.includes('블릿');
    const isCircledPattern = candidateText.includes('원문항');
    const isCaptionPattern = candidateText.includes('캡션');
    const matcher = isCaptionPattern
      ? /^<[^>]{2,80}>$/
      : isCircledPattern
        ? /^[①-⑳]\s*.+$/
        : isBulletPattern
          ? /^▪\s*.+$/
          : /^■\s*.+$/;
    lines.forEach((line, index) => {
      if (matcher.test(line.trim())) {
        markLine(index + 1, formatHierarchyLine(line, finalLabel));
      }
    });
  } else if (patternKind === 'repeated_header') {
    let keptFirst = false;
    lines.forEach((line, index) => {
      if (line.trim() !== candidateText) {
        return;
      }

      if (!keptFirst && /^heading_[1-4]$/.test(finalLabel)) {
        markLine(index + 1, formatHierarchyLine(line, finalLabel));
        keptFirst = true;
        return;
      }

      markLine(index + 1, '');
    });
  } else {
    for (const lineNumber of sampleLineSet) {
      markLine(lineNumber, formatHierarchyLine(getLine(lineNumber), finalLabel));
    }
  }

  const cleanedLines = removeRepeatedHierarchyRuns(lines);
  const nextContent = cleanedLines.join('\n');
  await fs.writeFile(markdownPath, nextContent, 'utf8');
  const updatedDoc = upsertDocument({
    filePath: markdownPath,
    fileName: path.basename(markdownPath),
    content: nextContent,
    markSaved: true,
  });
  queueSyncEvent(updatedDoc.id, 'document_saved', {
    filePath: markdownPath,
    fileName: updatedDoc.fileName,
    size: Buffer.byteLength(nextContent, 'utf8'),
    source: 'hierarchy_apply',
  });
  return updatedDoc;
}

async function resolveHierarchyReviewItem(payload) {
  const action = payload?.action === 'approve' ? 'approve' : payload?.action === 'reject' ? 'reject' : null;
  if (!action || !payload?.id) {
    return { ok: false };
  }

  const finalLabel = action === 'approve'
    ? String(payload?.finalLabel || payload?.recommendationLabel || '').trim()
    : 'excluded';
  if (action === 'approve' && !finalLabel) {
    return { ok: false, error: 'final_label_required' };
  }

  const now = toIsoNow();
  db.prepare(`
    INSERT INTO hierarchy_labels (
      candidate_id, markdown_path, pattern_kind, candidate_text, final_action,
      final_label, recommendation_label, sample_lines_json, sample_texts_json, created_at
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `).run(
    payload.id,
    payload.markdownPath || '',
    payload.patternKind || '',
    payload.candidateText || '',
    action,
    finalLabel,
    payload.recommendationLabel || '',
    JSON.stringify(Array.isArray(payload.sampleLines) ? payload.sampleLines : []),
    JSON.stringify(Array.isArray(payload.sampleTexts) ? payload.sampleTexts : []),
    now,
  );

  db.prepare(`
    UPDATE hierarchy_candidates
    SET status = ?, updated_at = ?
    WHERE id = ?
  `).run(action === 'approve' ? 'approved' : 'rejected', now, payload.id);

  const updatedDoc = action === 'approve'
    ? await applyHierarchyCandidateToMarkdown(payload, finalLabel)
    : null;

  return { ok: true, doc: updatedDoc };
}

async function walkDirectories(rootPath) {
  const entries = await fs.readdir(rootPath, { withFileTypes: true }).catch(() => []);
  const nested = await Promise.all(
    entries
      .filter((entry) => entry.isDirectory())
      .map(async (entry) => {
        const fullPath = path.join(rootPath, entry.name);
        return [fullPath, ...(await walkDirectories(fullPath))];
      }),
  );

  return nested.flat();
}

async function scanLogoReviewItems(folderPath, inferenceEngine = 'py_lgbm') {
  if (!folderPath) {
    return [];
  }

  const rootPath = path.resolve(folderPath);
  const rootStat = await fs.stat(rootPath).catch(() => null);
  if (!rootStat?.isDirectory()) {
    return [];
  }

  const directories = [rootPath, ...(await walkDirectories(rootPath))];
  const reviewDirs = [];

  for (const directoryPath of directories) {
    if (path.basename(directoryPath) !== 'logo_review') {
      continue;
    }

    const candidateDir = path.join(directoryPath, 'removed_logo_candidates');
    const candidateStat = await fs.stat(candidateDir).catch(() => null);
    if (candidateStat?.isDirectory()) {
      reviewDirs.push(directoryPath);
    }
  }

  const collected = await Promise.all(
    reviewDirs.map(async (reviewDir) => {
      const outputDir = path.dirname(reviewDir);
      const outputBaseName = path.basename(outputDir);
      const sourceBaseName = outputBaseName.replace(/_py$/i, '');
      const sourcePdfPath = path.join(path.dirname(outputDir), `${sourceBaseName}.pdf`);
      const markdownPath = path.join(outputDir, `${sourceBaseName}.md`);
      return collectLogoReviewItems({
        sourcePdfPath,
        markdownPath,
        reviewDir,
      });
    }),
  );

  const items = collected.flat().sort((left, right) => right.createdAt.localeCompare(left.createdAt));
  return scoreLogoReviewItemsWithInference(items, inferenceEngine);
}

async function moveReviewMembers(memberPaths, targetDir) {
  await fs.mkdir(targetDir, { recursive: true });

  for (const memberPath of memberPaths) {
    const sourceStat = await fs.stat(memberPath).catch(() => null);
    if (!sourceStat?.isFile()) {
      continue;
    }

    const parsed = path.parse(memberPath);
    let targetPath = path.join(targetDir, parsed.base);
    let suffix = 1;

    while (await fs.stat(targetPath).catch(() => null)) {
      targetPath = path.join(targetDir, `${parsed.name}_${suffix}${parsed.ext}`);
      suffix += 1;
    }

    await fs.rename(memberPath, targetPath);
  }
}

async function appendTextLine(filePath, line) {
  await fs.mkdir(path.dirname(filePath), { recursive: true });
  await fs.appendFile(filePath, `${line}\n`, 'utf8');
}

function buildDatasetImageFileName(fileName, sha256, ext) {
  const parsed = path.parse(String(fileName || 'image'));
  const safeBaseName = sanitizePathSegment(parsed.name || 'image').replace(/\s+/g, '_');
  const shortHash = String(sha256 || '').slice(0, 8) || '00000000';
  return `${safeBaseName}_${shortHash}${ext || parsed.ext || ''}`;
}

async function buildDatasetEntries(payload, action) {
  const memberPaths = Array.isArray(payload?.memberPaths)
    ? payload.memberPaths.filter((value) => typeof value === 'string' && value)
    : [];
  const label = action === 'approve' ? 'delete' : 'keep';
  const entries = [];

  for (const memberPath of memberPaths) {
    const sourceStat = await fs.stat(memberPath).catch(() => null);
    if (!sourceStat?.isFile()) {
      continue;
    }

    const sha256 = await sha256ForFile(memberPath);
    const parsed = path.parse(memberPath);
    entries.push({
      imageId: sha256.slice(0, 16),
      imagePath: memberPath,
      sha256,
      fileName: parsed.base,
      ext: parsed.ext,
      sizeBytes: sourceStat.size,
      pageIndex: parseCandidatePageIndex(parsed.base),
      label,
      sourcePdfName: payload?.sourcePdfName ?? '',
      sourcePdfPath: payload?.sourcePdfPath ?? '',
      markdownPath: payload?.markdownPath ?? '',
      groupId: payload?.id ?? '',
      candidateCount: Number(payload?.candidateCount ?? memberPaths.length),
      createdAt: toIsoNow(),
    });
  }

  return entries;
}

async function persistMlDataset(payload, action) {
  const entries = await buildDatasetEntries(payload, action);
  if (!entries.length) {
    return;
  }

  const datasetDir = getMlDatasetRoot();
  const imagesDir = path.join(datasetDir, 'images');
  const manifestsDir = path.join(datasetDir, 'manifests');
  const labelsPath = path.join(manifestsDir, 'labels.jsonl');
  const featuresPath = path.join(manifestsDir, 'train_features.csv');

  await fs.mkdir(imagesDir, { recursive: true });
  await fs.mkdir(manifestsDir, { recursive: true });
  const featureHeader = 'image_id,repeat_count,size_bytes,page_index,ext_png,ext_jpeg,label,source_pdf_name,group_id';
  const featureStat = await fs.stat(featuresPath).catch(() => null);
  if (!featureStat?.isFile()) {
    await appendTextLine(featuresPath, featureHeader);
  }

  for (const entry of entries) {
    const copiedImageName = buildDatasetImageFileName(entry.fileName, entry.sha256, entry.ext);
    const copiedImagePath = path.join(imagesDir, copiedImageName);
    const existing = await fs.stat(copiedImagePath).catch(() => null);
    if (!existing?.isFile()) {
      await fs.copyFile(entry.imagePath, copiedImagePath);
    }

    const labelsRow = {
      image_id: entry.imageId,
      image_path: path.relative(datasetDir, copiedImagePath).replace(/\\/g, '/'),
      label: entry.label,
      source_pdf_name: entry.sourcePdfName,
      source_pdf_path: entry.sourcePdfPath,
      markdown_path: entry.markdownPath,
      group_id: entry.groupId,
      repeat_count: entry.candidateCount,
      sha256: entry.sha256,
      created_at: entry.createdAt,
    };
    await appendTextLine(labelsPath, JSON.stringify(labelsRow));

    await appendTextLine(
      featuresPath,
      [
        entry.imageId,
        entry.candidateCount,
        entry.sizeBytes,
        entry.pageIndex,
        entry.ext.toLowerCase() === '.png' ? 1 : 0,
        entry.ext.toLowerCase() === '.jpg' || entry.ext.toLowerCase() === '.jpeg' ? 1 : 0,
        entry.label,
        JSON.stringify(entry.sourcePdfName),
        JSON.stringify(entry.groupId),
      ].join(','),
    );
  }
}

async function scoreLogoReviewItemsWithInference(reviewItems, inferenceEngine) {
  if (!Array.isArray(reviewItems) || !reviewItems.length) {
    return [];
  }

  if (inferenceEngine !== 'py_lgbm') {
    return reviewItems;
  }

  const datasetFeaturesPath = path.join(getMlDatasetRoot(), 'manifests', 'train_features.csv');
  const featuresStat = await fs.stat(datasetFeaturesPath).catch(() => null);
  if (!featuresStat?.isFile()) {
    return reviewItems.map((item) => ({ ...item, recommendationSource: 'PY' }));
  }

  const candidates = await Promise.all(reviewItems.map(async (item) => {
    const previewStat = await fs.stat(item.previewImagePath).catch(() => null);
    const ext = path.extname(item.previewImagePath).toLowerCase();
    return {
      id: item.id,
      repeat_count: item.candidateCount,
      size_bytes: previewStat?.size ?? 0,
      page_index: parseCandidatePageIndex(path.basename(item.previewImagePath)),
      ext,
      file_name: path.basename(item.previewImagePath),
    };
  }));

  const tempDir = path.join(app.getPath('userData'), 'temp');
  await fs.mkdir(tempDir, { recursive: true });
  const candidatesPath = path.join(tempDir, `logo_candidates_${Date.now()}.json`);
  const engineScriptPath = path.resolve(__dirname, '..', '..', 'scripts', 'logo_lgbm_engine.py');

  try {
    await fs.writeFile(candidatesPath, JSON.stringify(candidates), 'utf8');
    const { stdout } = await runPythonScript(
      [engineScriptPath, '--features', datasetFeaturesPath, '--candidates', candidatesPath],
      {
        cwd: path.resolve(__dirname, '..', '..'),
        windowsHide: true,
      },
    );
    const scoredRows = JSON.parse(stdout || '[]');
    const scoreMap = new Map(scoredRows.map((row) => [row.id, row]));

    return reviewItems.map((item) => {
      const scored = scoreMap.get(item.id);
      const mlScore = typeof scored?.mlScore === 'number' ? Number(scored.mlScore.toFixed(2)) : null;
      const mlLabel = scored?.mlLabel === 'delete' || scored?.mlLabel === 'keep' ? scored.mlLabel : null;
      const recommendationSource = mlLabel === 'delete'
        ? 'ML&PY'
        : 'PY';

      return {
        ...item,
        mlScore,
        mlLabel,
        recommendationSource,
      };
    });
  } catch (error) {
    console.error('[logo-lgbm-engine] failed', error instanceof Error ? error.message : String(error));
    return reviewItems.map((item) => ({ ...item, recommendationSource: 'PY', mlScore: null, mlLabel: null }));
  } finally {
    await fs.unlink(candidatesPath).catch(() => null);
  }
}

function runExecFile(command, args, options = {}) {
  return new Promise((resolve, reject) => {
    execFile(command, args, options, (error, stdout, stderr) => {
      if (error) {
        reject(new Error(stderr || stdout || error.message));
        return;
      }
      resolve({ stdout, stderr });
    });
  });
}

async function runPythonScript(args, options = {}) {
  const attempts = [
    { command: 'python', args },
    { command: 'py', args: ['-3', ...args] },
  ];

  let lastError = null;
  for (const attempt of attempts) {
    try {
      return await runExecFile(attempt.command, attempt.args, options);
    } catch (error) {
      lastError = error;
    }
  }

  throw lastError ?? new Error('Python execution failed');
}

function getLogoFilterSensitivityArgs(sensitivity = 'default') {
  if (sensitivity === 'low') {
    return ['--min-repeat', '2', '--max-width', '640', '--max-height', '220', '--max-area', '140000'];
  }

  if (sensitivity === 'high') {
    return ['--min-repeat', '4', '--max-width', '380', '--max-height', '120', '--max-area', '70000'];
  }

  return ['--min-repeat', '3', '--max-width', '500', '--max-height', '150', '--max-area', '100000'];
}

async function convertPdfWithPython(pdfPath, inferenceEngine = 'py_only', sensitivity = 'default') {
  if (!pdfPath || !isPdfPath(pdfPath)) {
    return null;
  }

  const resolvedPdfPath = path.resolve(pdfPath);
  const parsed = path.parse(resolvedPdfPath);
  const outputDir = path.join(parsed.dir, `${parsed.name}_py`);
  const convertScriptPath = path.resolve(__dirname, '..', '..', 'scripts', 'pdf_to_md_pages.py');
  const filterScriptPath = path.resolve(__dirname, '..', '..', 'scripts', 'filter_logo_images.py');
  const reviewDir = path.join(outputDir, 'logo_review');
  console.log('[convert-pdf-python] start', { resolvedPdfPath, outputDir, convertScriptPath, filterScriptPath, sensitivity });

  await fs.mkdir(outputDir, { recursive: true });
  await runPythonScript([convertScriptPath, resolvedPdfPath, '-o', outputDir, '--extract-images', '--merged-only'], {
    cwd: path.resolve(__dirname, '..', '..'),
    windowsHide: true,
  });
  console.log('[convert-pdf-python] convert finished', { outputDir });

  const imageDir = path.join(outputDir, 'image');
  const imageDirStat = await fs.stat(imageDir).catch(() => null);
  if (imageDirStat?.isDirectory()) {
    await runPythonScript([filterScriptPath, imageDir, '-o', reviewDir, ...getLogoFilterSensitivityArgs(sensitivity)], {
      cwd: path.resolve(__dirname, '..', '..'),
      windowsHide: true,
    });
    console.log('[convert-pdf-python] logo filter finished', { reviewDir, sensitivity });
  }

  const mergedPath = path.join(outputDir, `${parsed.name}.md`);
  const stat = await fs.stat(mergedPath).catch(() => null);
  if (!stat?.isFile()) {
    throw new Error(`Converted markdown not found: ${mergedPath}`);
  }

  const doc = await openFromPath(mergedPath);
  const reviewItems = await collectLogoReviewItems({
    sourcePdfPath: resolvedPdfPath,
    markdownPath: mergedPath,
    reviewDir,
  });
  const scoredReviewItems = await scoreLogoReviewItemsWithInference(reviewItems, inferenceEngine);
  console.log('[convert-pdf-python] completed', { mergedPath, reviewItemCount: scoredReviewItems.length, inferenceEngine, sensitivity });

  return { doc, reviewItems: scoredReviewItems };
}

async function finalizeReviewTransfer(payload) {
  const markdownPath = payload?.markdownPath;
  const reviewDir = payload?.reviewDir;
  if (!markdownPath || !reviewDir) {
    return { finalized: false };
  }

  const reviewStat = await fs.stat(reviewDir).catch(() => null);
  if (!reviewStat?.isDirectory()) {
    return { finalized: false };
  }

  const candidateDir = path.join(reviewDir, 'removed_logo_candidates');
  const pendingEntries = await fs.readdir(candidateDir, { withFileTypes: true }).catch(() => []);
  const pendingFiles = pendingEntries.filter((entry) => entry.isFile());
  if (pendingFiles.length) {
    return { finalized: false };
  }

  const outputDir = path.dirname(markdownPath);
  const imageDir = path.join(outputDir, 'image');
  const finalizeScriptPath = path.resolve(__dirname, '..', '..', 'scripts', 'finalize_review_transfer.py');
  const runName = sanitizePathSegment(path.basename(outputDir)) || `review-${Date.now()}`;
  const centralDir = getMlDatasetRoot();

  console.log('[review-finalize] start', { markdownPath, reviewDir, imageDir, centralDir, runName });
  await runPythonScript(
    [
      finalizeScriptPath,
      '--markdown',
      markdownPath,
      '--image-dir',
      imageDir,
      '--review-dir',
      reviewDir,
      '--central-dir',
      centralDir,
      '--run-name',
      runName,
    ],
    {
      cwd: path.resolve(__dirname, '..', '..'),
      windowsHide: true,
    },
  );
  console.log('[review-finalize] completed', { centralDir, runName });
  return { finalized: true, centralDir };
}

async function resolveLogoReviewItem(payload) {
  const memberPaths = Array.isArray(payload?.memberPaths)
    ? payload.memberPaths.filter((value) => typeof value === 'string' && value)
    : [];
  const action = payload?.action === 'approve' ? 'approve' : payload?.action === 'reject' ? 'reject' : null;
  if (!memberPaths.length || !action) {
    return { ok: false };
  }

  const reviewDir = path.dirname(path.dirname(memberPaths[0]));
  const targetDir = path.join(reviewDir, action === 'approve' ? 'approved_delete' : 'rejected_keep');
  await persistMlDataset({ ...payload, reviewDir, memberPaths }, action);
  await moveReviewMembers(memberPaths, targetDir);
  const finalizeResult = await finalizeReviewTransfer({ ...payload, reviewDir });
  return { ok: true, ...finalizeResult };
}

async function loadRenderer() {
  if (!mainWindow) {
    return;
  }

  if (rendererDevUrl) {
    await mainWindow.loadURL(rendererDevUrl);
    return;
  }

  await mainWindow.loadFile(path.join(__dirname, '..', 'dist', 'index_vite_backup.html'));
}

async function createWindow() {
  mainWindow = new BrowserWindow({
    width: 1600,
    height: 980,
    minWidth: 1180,
    minHeight: 760,
    backgroundColor: '#161616',
    titleBarStyle: 'hidden',
    webPreferences: {
      preload: path.join(__dirname, 'preload.cjs'),
      contextIsolation: true,
      nodeIntegration: false,
    },
  });
  mainWindow.once('ready-to-show', () => {
    if (!mainWindow) {
      return;
    }
    if (mainWindow.isMinimized()) {
      mainWindow.restore();
    }
    mainWindow.show();
    mainWindow.focus();
  });
  await loadRenderer();
  if (rendererDevUrl) {
    mainWindow.webContents.openDevTools({ mode: 'detach' });
  }
}

app.on('second-instance', () => {
  if (!mainWindow) {
    return;
  }

  if (mainWindow.isMinimized()) {
    mainWindow.restore();
  }
  mainWindow.show();
  mainWindow.focus();
});

app.whenReady().then(async () => {
  ensureDatabase();
  await createWindow();

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) {
      createWindow();
    }
  });
});

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') {
    app.quit();
  }
});

ipcMain.handle('app:get-shell-state', () => {
  const rows = db
    .prepare(`
      SELECT id, file_name, file_path, content, block_count, last_opened_at, last_saved_at, updated_at
      FROM documents
      ORDER BY COALESCE(last_opened_at, updated_at) DESC
      LIMIT 30
    `)
    .all();

  return {
    isDesktop: true,
    recentDocuments: rows.map(mapDocumentRow),
  };
});

ipcMain.handle('app:get-system-fonts', () => {
  return getWindowsInstalledFonts();
});

ipcMain.handle('app:get-sync-status', () => {
  return getSyncStatus();
});

ipcMain.handle('app:filter-existing-paths', async (_event, paths) => {
  const values = Array.isArray(paths) ? paths : [];
  const results = await Promise.all(
    values.map(async (filePath) => {
      if (typeof filePath !== 'string' || !filePath) {
        return null;
      }
      const stat = await fs.stat(filePath).catch(() => null);
      return stat ? filePath : null;
    }),
  );
  return results.filter(Boolean);
});

ipcMain.handle('app:read-image-data-url', async (_event, filePath) => {
  if (typeof filePath !== 'string' || !filePath) {
    return null;
  }

  const stat = await fs.stat(filePath).catch(() => null);
  if (!stat?.isFile()) {
    return null;
  }

  const ext = path.extname(filePath).toLowerCase();
  const mimeType = ext === '.png'
    ? 'image/png'
    : ext === '.jpg' || ext === '.jpeg'
      ? 'image/jpeg'
      : ext === '.webp'
        ? 'image/webp'
        : ext === '.gif'
          ? 'image/gif'
          : 'application/octet-stream';
  const buffer = await fs.readFile(filePath);
  return `data:${mimeType};base64,${buffer.toString('base64')}`;
});

ipcMain.handle('review:scan-logo-items', async (_event, folderPath, inferenceEngine = 'py_lgbm') => {
  return scanLogoReviewItems(folderPath, inferenceEngine);
});

ipcMain.handle('document:analyze-hierarchy-patterns', async (_event, markdownPath) => {
  return analyzeHierarchyPatterns(markdownPath);
});

ipcMain.handle('dataset:get-stats', async () => {
  return getMlDatasetStats();
});

ipcMain.handle('dataset:open-root', async () => {
  return openMlDatasetRoot();
});

ipcMain.handle('dataset:export-zip', async () => {
  try {
    return await exportMlDatasetZip();
  } catch (error) {
    return { ok: false, error: error instanceof Error ? error.message : String(error) };
  }
});

ipcMain.handle('dataset:cleanup-artifacts', async () => {
  try {
    return await cleanupMlDatasetArtifacts();
  } catch (error) {
    return { ok: false, error: error instanceof Error ? error.message : String(error) };
  }
});

ipcMain.handle('dataset:confirm-reset-flow', async () => {
  try {
    return await confirmMlDatasetResetFlow();
  } catch (error) {
    return { ok: false, error: error instanceof Error ? error.message : String(error) };
  }
});

ipcMain.handle('dialog:open-file', async () => {
  const result = await dialog.showOpenDialog(mainWindow, {
    title: '문서 열기',
    properties: ['openFile'],
    filters: [
      { name: 'Markdown', extensions: ['md', 'markdown', 'txt'] },
      { name: 'All Files', extensions: ['*'] },
    ],
  });

  if (result.canceled || !result.filePaths[0]) {
    return null;
  }

  return openFromPath(result.filePaths[0]);
});

ipcMain.handle('dialog:open-folder', async () => {
  const result = await dialog.showOpenDialog(mainWindow, {
    title: '폴더 열기',
    properties: ['openDirectory'],
  });

  if (result.canceled || !result.filePaths[0]) {
    return null;
  }

  return openFolderFromPath(result.filePaths[0], true);
});

ipcMain.handle('dialog:open-folder-path', async (_event, folderPath, includeSubfolders = true) => {
  return openFolderFromPath(folderPath, includeSubfolders);
});

ipcMain.handle('document:open-recent', async (_event, filePath) => {
  if (!filePath) {
    return null;
  }
  return openFromPath(filePath);
});

ipcMain.handle('document:convert-pdf-python', async (_event, filePath, inferenceEngine = 'py_only', sensitivity = 'default') => {
  try {
    return await convertPdfWithPython(filePath, inferenceEngine, sensitivity);
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    console.error('[document:convert-pdf-python] failed', message);
    if (mainWindow && !mainWindow.isDestroyed()) {
      dialog.showErrorBox('Python 변환 실패', message);
    }
    return { doc: null, reviewItems: [], error: message };
  }
});

ipcMain.handle('review:resolve-logo-item', async (_event, payload) => {
  return resolveLogoReviewItem(payload);
});

ipcMain.handle('review:resolve-hierarchy-item', async (_event, payload) => {
  return resolveHierarchyReviewItem(payload);
});

ipcMain.handle('document:save', async (_event, payload) => saveDocument(payload));
ipcMain.handle('document:delete-path', async (_event, filePath) => deleteDocumentPath(filePath));

ipcMain.handle('document:save-as', async (_event, payload) => {
  const saveDialog = await dialog.showSaveDialog(mainWindow, {
    title: '다른 이름으로 저장',
    defaultPath: payload?.fileName || '새 문서.md',
    filters: [
      { name: 'Markdown', extensions: ['md'] },
      { name: 'Text', extensions: ['txt'] },
    ],
  });

  if (saveDialog.canceled || !saveDialog.filePath) {
    return null;
  }

  return saveDocument({
    ...payload,
    filePath: saveDialog.filePath,
    fileName: path.basename(saveDialog.filePath),
  });
});

ipcMain.handle('folder:search-text', async (_event, payload) => {
  return searchInFolder(payload?.folderPath, payload?.query);
});

ipcMain.handle('folder:replace-text', async (_event, payload) => {
  return replaceInFolder(payload?.folderPath, payload?.query, payload?.replaceValue);
});

ipcMain.handle('window:minimize', () => {
  mainWindow?.minimize();
});

ipcMain.handle('window:maximize-toggle', () => {
  if (!mainWindow) {
    return false;
  }

  if (mainWindow.isMaximized()) {
    mainWindow.unmaximize();
    return false;
  }

  mainWindow.maximize();
  return true;
});

ipcMain.handle('window:close', () => {
  mainWindow?.close();
});
