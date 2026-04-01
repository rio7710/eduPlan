const fs = require('node:fs/promises');
const path = require('node:path');
const { app } = require('electron');
const { getDb } = require('./dbEngine.cjs');

function resolveMlDatasetRoot() {
  return path.join(app.getPath('userData'), 'ml_dataset');
}

function resolveArtifactsRoot() {
  return path.join(__dirname, '..', '..', 'scripts', 'LightGBM_ML', 'artifacts');
}

async function statSafe(targetPath) {
  try {
    return await fs.stat(targetPath);
  } catch {
    return null;
  }
}

async function removeDirRecursive(targetPath) {
  const stat = await statSafe(targetPath);
  if (!stat || !stat.isDirectory()) {
    return { removedFileCount: 0, freedBytes: 0 };
  }
  const stack = [targetPath];
  let removedFileCount = 0;
  let freedBytes = 0;
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
        const fileStat = await fs.stat(fullPath);
        freedBytes += Number(fileStat.size || 0);
      } catch {
        // ignore stat failure
      }
      removedFileCount += 1;
    }
  }
  await fs.rm(targetPath, { recursive: true, force: true });
  return { removedFileCount, freedBytes };
}

function clearDatabaseAllTables() {
  const db = getDb();
  const rows = db.prepare(`
    SELECT name
    FROM sqlite_master
    WHERE type = 'table' AND name NOT LIKE 'sqlite_%'
  `).all();

  let deletedRows = 0;
  db.exec('BEGIN');
  try {
    for (const row of rows) {
      const tableName = String(row?.name || '');
      if (!tableName) {
        continue;
      }
      const escaped = tableName.replace(/"/g, '""');
      const result = db.prepare(`DELETE FROM "${escaped}"`).run();
      deletedRows += Number(result?.changes || 0);
    }
    db.exec('COMMIT');
  } catch (error) {
    db.exec('ROLLBACK');
    throw error;
  }

  try {
    db.exec('VACUUM');
  } catch {
    // ignore vacuum failure
  }
  return deletedRows;
}

async function clearArtifacts() {
  const artifactRoot = resolveArtifactsRoot();
  const stat = await statSafe(artifactRoot);
  if (!stat || !stat.isDirectory()) {
    return { removedCount: 0, freedBytes: 0 };
  }
  const targets = await fs.readdir(artifactRoot, { withFileTypes: true });
  let removedCount = 0;
  let freedBytes = 0;
  for (const entry of targets) {
    if (!entry.isFile()) {
      continue;
    }
    const fullPath = path.join(artifactRoot, entry.name);
    try {
      const fileStat = await fs.stat(fullPath);
      freedBytes += Number(fileStat.size || 0);
    } catch {
      // ignore
    }
    await fs.rm(fullPath, { force: true });
    removedCount += 1;
  }
  return { removedCount, freedBytes };
}

async function resetAllDatasetRelatedData() {
  const deletedDbRows = clearDatabaseAllTables();
  const artifact = await clearArtifacts();
  const dataset = await removeDirRecursive(resolveMlDatasetRoot());
  return {
    ok: true,
    deletedDbRows,
    removedArtifactCount: artifact.removedCount,
    removedDatasetFileCount: dataset.removedFileCount,
    freedBytes: artifact.freedBytes + dataset.freedBytes,
  };
}

module.exports = {
  resetAllDatasetRelatedData,
};
