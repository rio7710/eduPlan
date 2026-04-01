const path = require('node:path');

function buildPdfTempPaths(pdfPath) {
  const absolutePdfPath = path.resolve(String(pdfPath || ''));
  const sourceDir = path.dirname(absolutePdfPath);
  const pdfStem = path.basename(absolutePdfPath, path.extname(absolutePdfPath));
  const rootDir = path.join(sourceDir, 'edufix_trans', `${pdfStem}_temp`);
  return {
    pdfStem,
    rootDir,
    mdDir: path.join(rootDir, 'md'),
    imgDir: path.join(rootDir, 'img'),
    layoutDir: path.join(rootDir, 'layout'),
    reportDir: path.join(rootDir, 'report'),
  };
}

module.exports = {
  buildPdfTempPaths,
};
