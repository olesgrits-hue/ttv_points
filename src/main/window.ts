import * as path from 'path';
import { BrowserWindow, app } from 'electron';

const VITE_DEV_URL = 'http://localhost:5173';

/**
 * Create the main BrowserWindow with security flags.
 * Sandboxed renderer — no Node access; all communication via contextBridge.
 */
export function createWindow(): BrowserWindow {
  const win = new BrowserWindow({
    width: 900,
    height: 700,
    webPreferences: {
      contextIsolation: true,
      sandbox: true,
      nodeIntegration: false,
      preload: path.join(__dirname, 'preload.js'),
    },
  });

  if (!app.isPackaged) {
    win.loadURL(VITE_DEV_URL).catch(console.error);
  } else {
    win.loadFile(path.join(__dirname, '../renderer/index.html')).catch(console.error);
  }

  return win;
}
