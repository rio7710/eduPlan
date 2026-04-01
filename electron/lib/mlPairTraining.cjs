const fs = require('node:fs/promises');
const path = require('node:path');
const { getDb } = require('./dbEngine.cjs');
const { runPythonScript } = require('./python/runner.cjs');

const CURSOR_AT_KEY = 'ml_pair_cursor_updated_at';
const CURSOR_ID_KEY = 'ml_pair_cursor_id';
const LAST_TRAINED_TOTAL_KEY = 'ml_pair_last_trained_total';

function artifactRoot() {
  return path.join(__dirname, '..', '..', 'scripts', 'LightGBM_ML', 'artifacts');
}

function collapseSpaces(value) {
  return String(value || '').replace(/\s+/g, ' ').trim();
}

function removeSpaces(value) {
  return String(value || '').replace(/\s+/g, '');
}

function getSetting(db, key) {
  const row = db.prepare('SELECT value FROM app_settings WHERE key = ?').get(key);
  return row?.value ?? null;
}

function setSetting(db, key, value) {
  const now = new Date().toISOString();
  db.prepare(`
    INSERT INTO app_settings (key, value, updated_at)
    VALUES (?, ?, ?)
    ON CONFLICT(key) DO UPDATE SET
      value = excluded.value,
      updated_at = excluded.updated_at
  `).run(key, String(value ?? ''), now);
}

async function appendJsonlRows(filePath, rows) {
  await fs.mkdir(path.dirname(filePath), { recursive: true });
  if (!rows.length) {
    return;
  }
  const body = rows.map((row) => JSON.stringify(row, null, 0)).join('\n');
  await fs.appendFile(filePath, `${body}\n`, 'utf8');
}

async function countJsonlRows(filePath) {
  try {
    const raw = await fs.readFile(filePath, 'utf8');
    return raw.split(/\r?\n/).filter((line) => line.trim()).length;
  } catch {
    return 0;
  }
}

function buildPairFromEditRow(row) {
  const before = String(row.original_text || '');
  const after = String(row.edited_text || '');
  if (!before || !after || before === after) {
    return null;
  }
  const beforeLines = before.split(/\r?\n/).map((line) => line.trim()).filter(Boolean);
  if (beforeLines.length < 2) {
    return null;
  }
  const left = beforeLines[0];
  const right = beforeLines.slice(1).join(' ').trim();
  if (!left || !right) {
    return null;
  }

  let label = 'merge_no_space';
  if (/\r?\n/.test(after)) {
    label = 'keep_break';
  } else if (collapseSpaces(after) === collapseSpaces(`${left} ${right}`)) {
    label = 'merge_space';
  } else if (removeSpaces(after) === removeSpaces(`${left}${right}`)) {
    label = 'merge_no_space';
  }

  return { left, right, label };
}

function getAutoApprovedRows(db, cursorAt, cursorId) {
  return db.prepare(`
    SELECT
      id,
      file_name,
      line_start,
      original_text,
      edited_text,
      updated_at
    FROM sentence_edits
    WHERE final_action = 'auto_txt_replace'
      AND review_status = 'approved'
      AND (
        updated_at > @cursorAt
        OR (updated_at = @cursorAt AND id > @cursorId)
      )
    ORDER BY updated_at ASC, id ASC
  `).all({
    cursorAt: String(cursorAt || '1970-01-01T00:00:00.000Z'),
    cursorId: String(cursorId || ''),
  });
}

async function prepareTrainingFromAutoApproved(minPairs = 500) {
  const db = getDb();
  const cursorAt = getSetting(db, CURSOR_AT_KEY);
  const cursorId = getSetting(db, CURSOR_ID_KEY);
  const rows = getAutoApprovedRows(db, cursorAt, cursorId);
  const now = new Date().toISOString();

  const userPairRows = [];
  const labeledRows = [];
  let lastRow = null;
  for (const row of rows) {
    const pair = buildPairFromEditRow(row);
    lastRow = row;
    if (!pair) {
      continue;
    }
    const sourceId = `${row.file_name}:${row.id}:sqlite_auto`;
    userPairRows.push({
      left: pair.left,
      right: pair.right,
      label: pair.label,
      source_id: sourceId,
    });
    labeledRows.push({
      source_id: sourceId,
      file_name: String(row.file_name || ''),
      line_start: Number(row.line_start || 0),
      label: pair.label,
      left: pair.left,
      right: pair.right,
      approval_type: 'auto',
      label_source: 'sqlite_auto_approved_v1',
      sentence_edit_id: String(row.id || ''),
      sentence_updated_at: String(row.updated_at || ''),
      exported_at: now,
    });
  }

  const artifacts = artifactRoot();
  const userPairsPath = path.join(artifacts, 'user_line_break_pairs.jsonl');
  const labeledPairsPath = path.join(artifacts, 'user_line_break_pairs_labeled.jsonl');
  await appendJsonlRows(userPairsPath, userPairRows);
  await appendJsonlRows(labeledPairsPath, labeledRows);

  if (lastRow) {
    setSetting(db, CURSOR_AT_KEY, String(lastRow.updated_at || now));
    setSetting(db, CURSOR_ID_KEY, String(lastRow.id || ''));
  }

  const totalUserPairs = await countJsonlRows(userPairsPath);
  const lastTrainedTotal = Number(getSetting(db, LAST_TRAINED_TOTAL_KEY) || 0);
  const hasNewData = totalUserPairs > lastTrainedTotal;
  let trained = false;
  let trainResult = null;
  let trainError = '';
  if (totalUserPairs >= minPairs && hasNewData) {
    const result = await runPythonScript('LightGBM_ML/train_line_break_model.py', []);
    if (result.ok) {
      trained = true;
      trainResult = result.json || null;
      setSetting(db, LAST_TRAINED_TOTAL_KEY, String(totalUserPairs));
    } else {
      trainError = result.error || result.stderr || '학습 실행 실패';
    }
  }

  return {
    ok: true,
    minPairs,
    exportedPairCount: userPairRows.length,
    exportedLabeledCount: labeledRows.length,
    totalUserPairs,
    lastTrainedTotal,
    hasNewData,
    eligibleForTraining: totalUserPairs >= minPairs,
    trained,
    trainResult,
    trainError,
    userPairsPath,
    labeledPairsPath,
  };
}

module.exports = {
  prepareTrainingFromAutoApproved,
};
