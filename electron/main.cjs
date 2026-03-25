const { app, BrowserWindow } = require('electron');
const path = require('node:path');

// 초기화 및 핸들러 임포트
const { ensureDatabase } = require('./lib/dbEngine.cjs');
const { registerFileHandlers } = require('./handlers/fileHandler.cjs');
const { registerMainHandlers } = require('./handlers/mainHandler.cjs');
const { registerDocumentHandlers } = require('./handlers/documentHandler.cjs');
const { registerReviewHandlers } = require('./handlers/reviewHandler.cjs');
const { registerDatasetHandlers } = require('./handlers/datasetHandler.cjs');
const { registerFolderHandlers } = require('./handlers/folderHandler.cjs');

let mainWindow = null;
const rendererDevUrl = process.env.VITE_DEV_SERVER_URL;

if (!app.requestSingleInstanceLock()) {
  app.quit();
}

async function createWindow() {
  ensureDatabase();

  mainWindow = new BrowserWindow({
    width: 1600,
    height: 980,
    minWidth: 1180,
    minHeight: 760,
    backgroundColor: '#161616',
    titleBarStyle: 'hidden',
    webPreferences: {
      preload: path.join(__dirname, 'preload.cjs'),
      contextIsolation: true,
      nodeIntegration: false,
    },
  });

  // 모든 기능 핸들러 등록
  registerFileHandlers(mainWindow);
  registerMainHandlers(mainWindow);
  registerDocumentHandlers(mainWindow);
  registerReviewHandlers(mainWindow);
  registerDatasetHandlers(mainWindow);
  registerFolderHandlers(mainWindow);

  mainWindow.once('ready-to-show', () => {
    mainWindow.show();
    mainWindow.focus();
  });

  if (rendererDevUrl) {
    await mainWindow.loadURL(rendererDevUrl);
    mainWindow.webContents.openDevTools({ mode: 'detach' });
  } else {
    await mainWindow.loadFile(path.join(__dirname, '..', 'dist', 'index.html'));
  }
}

app.whenReady().then(createWindow);

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit();
});

app.on('activate', () => {
  if (BrowserWindow.getAllWindows().length === 0) createWindow();
});
