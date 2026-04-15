/**
 * Electron main process entry point.
 * Real bootstrap (TwitchClient, Queue, OverlayServer, ConfigStore, IPC) will
 * be wired up in later tasks — this file intentionally minimal for Task 1.
 */
import { app, BrowserWindow } from 'electron';
import * as path from 'path';

function createMainWindow(): BrowserWindow {
  const win = new BrowserWindow({
    width: 1024,
    height: 720,
    show: false,
    webPreferences: {
      contextIsolation: true,
      sandbox: true,
      nodeIntegration: false,
    },
  });

  if (!app.isPackaged && process.env.VITE_DEV_SERVER_URL) {
    void win.loadURL(`${process.env.VITE_DEV_SERVER_URL}/renderer/index.html`);
  } else {
    void win.loadFile(path.join(__dirname, '..', 'web', 'renderer', 'index.html'));
  }

  win.once('ready-to-show', () => win.show());
  return win;
}

app.whenReady().then(() => {
  createMainWindow();

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) {
      createMainWindow();
    }
  });
});

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') {
    app.quit();
  }
});
