const path = require('node:path');
const { countBlocks, toIsoNow } = require('../../lib/utils.cjs');

function upsertDocumentRecord(db, { filePath, fileName, content, markSaved }) {
  const now = toIsoNow();
  const normalizedPath = filePath ? path.resolve(filePath) : null;
  const id = normalizedPath || `draft:${fileName}`;

  db.prepare(`
    INSERT INTO documents (
      id, file_name, file_path, content, block_count, last_opened_at, last_saved_at, created_at, updated_at
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
    ON CONFLICT(id) DO UPDATE SET
      file_name = excluded.file_name,
      file_path = excluded.file_path,
      content = excluded.content,
      block_count = excluded.block_count,
      last_saved_at = excluded.last_saved_at,
      updated_at = excluded.updated_at
  `).run(
    id,
    fileName,
    normalizedPath,
    content,
    countBlocks(content),
    now,
    markSaved ? now : null,
    now,
    now,
  );

  return {
    id,
    fileName,
    filePath: normalizedPath || '',
    content,
    blockCount: countBlocks(content),
    lastSavedAt: markSaved ? now : null,
  };
}

module.exports = {
  upsertDocumentRecord,
};
