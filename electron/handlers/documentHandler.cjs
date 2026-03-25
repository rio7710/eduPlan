const { ipcMain } = require('electron');
const { getDb } = require('../lib/dbEngine.cjs');
const { registerOpenRecentHandler } = require('./document/openRecent.cjs');
const { registerSaveDocumentHandler } = require('./document/saveDocument.cjs');
const { registerSaveAsDocumentHandler } = require('./document/saveAsDocument.cjs');
const { registerConvertPdfPythonHandler } = require('./document/convertPdfPython.cjs');
const { registerAnalyzeHierarchyHandler } = require('./document/analyzeHierarchy.cjs');
const { registerDeletePathHandler } = require('./document/deletePath.cjs');

function registerDocumentHandlers(mainWindow) {
  const db = getDb();
  registerOpenRecentHandler(ipcMain, db);
  registerSaveDocumentHandler(ipcMain, mainWindow, db);
  registerSaveAsDocumentHandler(ipcMain, mainWindow, db);
  registerConvertPdfPythonHandler(ipcMain, db);
  registerAnalyzeHierarchyHandler(ipcMain);
  registerDeletePathHandler(ipcMain);
}

module.exports = { registerDocumentHandlers };
