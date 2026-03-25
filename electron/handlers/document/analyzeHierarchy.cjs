const { runPythonScript } = require('../../lib/python/runner.cjs');

function registerAnalyzeHierarchyHandler(ipcMain) {
  ipcMain.handle('document:analyze-hierarchy-patterns', async (_event, markdownPath) => {
    const result = await runPythonScript('analyze_hierarchy_patterns.py', ['--markdown', String(markdownPath || '')]);
    if (!result.ok) {
      return [];
    }
    return Array.isArray(result.json) ? result.json : [];
  });
}

module.exports = {
  registerAnalyzeHierarchyHandler,
};
