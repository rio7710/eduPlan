const fs = require('node:fs/promises');
const path = require('node:path');
const { runPythonScript } = require('../../lib/python/runner.cjs');
const { getDb } = require('../../lib/dbEngine.cjs');

function resolveArtifactsDir() {
  return path.join(__dirname, '..', '..', '..', 'scripts', 'hierarchy_ml', 'artifacts');
}

function registerAnalyzeHierarchyHandler(ipcMain) {
  ipcMain.handle('document:analyze-hierarchy-patterns', async (_event, markdownPath, lineStart, lineEnd, focusLine) => {
    const args = ['--markdown', String(markdownPath || '')];
    if (Number.isFinite(Number(lineStart)) && Number(lineStart) > 0) {
      args.push('--line-start', String(Math.floor(Number(lineStart))));
    }
    if (Number.isFinite(Number(lineEnd)) && Number(lineEnd) > 0) {
      args.push('--line-end', String(Math.floor(Number(lineEnd))));
    }
    if (Number.isFinite(Number(focusLine)) && Number(focusLine) > 0) {
      args.push('--focus-line', String(Math.floor(Number(focusLine))));
    }
    const result = await runPythonScript('analyze_hierarchy_patterns.py', args);
    if (!result.ok) {
      return [];
    }
    const candidates = Array.isArray(result.json) ? result.json : [];
    if (!candidates.length) {
      return [];
    }

    const artifactsDir = resolveArtifactsDir();
    await fs.mkdir(artifactsDir, { recursive: true });
    const labels = getDb().prepare(`
      SELECT
        pattern_kind,
        candidate_text,
        recommendation_label,
        final_action,
        final_label,
        sample_lines_json,
        sample_texts_json
      FROM hierarchy_labels
      ORDER BY created_at ASC
    `).all().map((row) => ({
      pattern_kind: String(row.pattern_kind || ''),
      candidate_text: String(row.candidate_text || ''),
      recommendation_label: String(row.recommendation_label || ''),
      final_action: String(row.final_action || ''),
      final_label: String(row.final_label || ''),
      sample_lines: JSON.parse(row.sample_lines_json || '[]'),
      sample_texts: JSON.parse(row.sample_texts_json || '[]'),
    }));
    const labelsPath = path.join(artifactsDir, 'hierarchy_labels_source.json');
    const candidatesPath = path.join(artifactsDir, 'hierarchy_candidates_latest.json');
    await fs.writeFile(labelsPath, JSON.stringify(labels, null, 2), 'utf8');
    await fs.writeFile(candidatesPath, JSON.stringify(candidates, null, 2), 'utf8');

    const trainResult = await runPythonScript('hierarchy_ml/train_model.py', [
      '--labels-json',
      labelsPath,
      '--artifacts-dir',
      artifactsDir,
    ]);
    if (!trainResult.ok) {
      return candidates.map((item) => ({ ...item, recommendationSource: 'PY' }));
    }

    const scoreResult = await runPythonScript('hierarchy_ml/score_candidates.py', [
      '--candidates-json',
      candidatesPath,
      '--artifacts-dir',
      artifactsDir,
    ]);
    if (!scoreResult.ok || !Array.isArray(scoreResult.json)) {
      return candidates.map((item) => ({ ...item, recommendationSource: 'PY' }));
    }
    return scoreResult.json;
  });
}

module.exports = {
  registerAnalyzeHierarchyHandler,
};
