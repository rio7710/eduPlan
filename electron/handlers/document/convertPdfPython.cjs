const fs = require('node:fs/promises');
const path = require('node:path');
const { runPythonScript } = require('../../lib/python/runner.cjs');
const { upsertDocumentRecord } = require('./shared.cjs');

function registerConvertPdfPythonHandler(ipcMain, db) {
  ipcMain.handle('document:convert-pdf-python', async (_event, filePath) => {
    const absolutePdfPath = path.resolve(String(filePath || ''));
    if (!absolutePdfPath.toLowerCase().endsWith('.pdf')) {
      return { doc: null, reviewItems: [], error: 'pdf 파일 경로가 아닙니다.' };
    }

    const outputDir = path.join(path.dirname(absolutePdfPath), `${path.basename(absolutePdfPath, '.pdf')}_py`);
    await fs.mkdir(outputDir, { recursive: true });

    const result = await runPythonScript('pdf_to_md_pages.py', [absolutePdfPath, '-o', outputDir, '--extract-images', '--merged-only']);
    if (!result.ok) {
      return { doc: null, reviewItems: [], error: result.error || result.stderr || 'python 실행 실패' };
    }

    const markdownPath = path.join(outputDir, `${path.basename(absolutePdfPath, '.pdf')}.md`);
    try {
      const content = await fs.readFile(markdownPath, 'utf8');
      const doc = upsertDocumentRecord(db, {
        filePath: markdownPath,
        fileName: path.basename(markdownPath),
        content,
        markSaved: true,
      });
      return { doc, reviewItems: [] };
    } catch (error) {
      return { doc: null, reviewItems: [], error: String(error?.message || error) };
    }
  });
}

module.exports = {
  registerConvertPdfPythonHandler,
};
