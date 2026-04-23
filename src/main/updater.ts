import { ipcMain, BrowserWindow } from 'electron';
import { autoUpdater } from 'electron-updater';

export function setupAutoUpdater(): void {
  autoUpdater.autoDownload = true;
  autoUpdater.autoInstallOnAppQuit = true;

  autoUpdater.on('update-available', (info) => {
    broadcast('update:available', { version: info.version });
  });

  autoUpdater.on('update-downloaded', (info) => {
    broadcast('update:downloaded', { version: info.version });
  });

  autoUpdater.on('error', () => {
    // Silently ignore update errors — no reason to surface to user
  });

  ipcMain.handle('update:install', () => {
    autoUpdater.quitAndInstall(false, true);
  });

  // Check for updates after a short delay (let app finish initializing)
  setTimeout(() => {
    autoUpdater.checkForUpdatesAndNotify().catch(() => { /* ignore */ });
  }, 5_000);
}

function broadcast(channel: string, payload: unknown): void {
  for (const win of BrowserWindow.getAllWindows()) {
    win.webContents.send(channel, payload);
  }
}
