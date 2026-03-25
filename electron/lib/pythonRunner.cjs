const { runPythonScript } = require('./python/runner.cjs');

/**
 * Python 스크립트 실행 공통 함수
 */
async function runPythonScriptCompat(scriptName, args = []) {
  const result = await runPythonScript(scriptName, args);
  if (!result.ok) {
    const message = result.error || result.stderr || `Python Error (${scriptName})`;
    throw new Error(message);
  }
  return result.stdout;
}

/**
 * PDF 변환 실행
 */
async function convertPdf(pdfPath, outputDir) {
  return runPythonScriptCompat('pdf_to_md_pages.py', [pdfPath, outputDir]);
}

/**
 * 로고 필터링 실행
 */
async function filterLogos(imageDir) {
  return runPythonScriptCompat('filter_logo_images.py', [imageDir]);
}

module.exports = {
  runPythonScript: runPythonScriptCompat,
  convertPdf,
  filterLogos,
};
