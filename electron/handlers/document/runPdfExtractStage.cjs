const fs = require('node:fs/promises');
const path = require('node:path');
const { runPythonScript } = require('../../lib/python/runner.cjs');
const { buildPdfTempPaths } = require('../../lib/convertPaths.cjs');

function parseStageResult(stdout) {
  try {
    return JSON.parse(String(stdout || '').trim());
  } catch {
    return null;
  }
}

function registerRunPdfExtractStageHandler(ipcMain) {
  ipcMain.handle('document:run-pdf-extract-stage', async (_event, filePath, stage) => {
    const absolutePdfPath = path.resolve(String(filePath || ''));
    const stageName = String(stage || '').trim();
    if (!absolutePdfPath.toLowerCase().endsWith('.pdf')) {
      return { ok: false, error: 'pdf 파일 경로가 아닙니다.' };
    }
    if (!stageName) {
      return { ok: false, error: 'stage가 비어 있습니다.' };
    }

    const outputDir = path.join(buildPdfTempPaths(absolutePdfPath).rootDir, 'dev');
    await fs.mkdir(outputDir, { recursive: true });
    const result = await runPythonScript('pdf_extract_stages.py', [
      absolutePdfPath,
      '--stage',
      stageName,
      '-o',
      outputDir,
    ]);
    if (!result.ok) {
      return { ok: false, error: result.error || result.stderr || 'python 실행 실패' };
    }

    const payload = parseStageResult(result.stdout);
    if (!payload) {
      return { ok: false, error: 'stage 결과를 해석하지 못했습니다.' };
    }

    return {
      ok: true,
      outputDir,
      stage: stageName,
      result: payload,
    };
  });
}

module.exports = {
  registerRunPdfExtractStageHandler,
};
