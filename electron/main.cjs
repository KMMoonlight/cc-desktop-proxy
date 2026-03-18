const path = require('path');
const { app, BrowserWindow } = require('electron');

const { ClaudeDesktopRuntime } = require('./runtime.cjs');

let runtime = null;

function createWindow() {
  const mainWindow = new BrowserWindow({
    width: 1440,
    height: 980,
    minWidth: 1180,
    minHeight: 760,
    titleBarStyle: 'hiddenInset',
    backgroundColor: '#f7f1e7',
    webPreferences: {
      contextIsolation: true,
      nodeIntegration: false,
      preload: path.join(__dirname, 'preload.cjs'),
      sandbox: false,
    },
  });

  const contentsId = mainWindow.webContents.id;

  if (process.env.ELECTRON_RENDERER_URL) {
    mainWindow.loadURL(process.env.ELECTRON_RENDERER_URL);
  } else {
    mainWindow.loadFile(path.join(__dirname, '..', 'dist', 'index.html'));
  }

  mainWindow.webContents.setWindowOpenHandler(() => ({ action: 'deny' }));

  mainWindow.on('closed', () => {
    runtime?.disposeWindow(contentsId);
  });
}

app.whenReady().then(() => {
  runtime = new ClaudeDesktopRuntime();
  runtime.registerIpc();
  createWindow();

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) {
      createWindow();
    }
  });
});

app.on('before-quit', () => {
  runtime?.disposeAll();
});

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') {
    app.quit();
  }
});
