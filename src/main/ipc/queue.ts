import { ipcMain, BrowserWindow } from 'electron';
import { Queue, QueueState } from '../queue';
import { OverlayServer } from '../overlay/server';

export function registerQueueIpcHandlers(
  mediaQueue: Queue,
  musicQueue: Queue,
  overlayServer: OverlayServer,
): void {
  ipcMain.handle('queue:getState', () => ({
    media: mediaQueue.getState(),
    music: musicQueue.getState(),
  }));

  ipcMain.handle('queue:skip', () => {
    mediaQueue.skip();
    musicQueue.skip();
    overlayServer.skipAll();
  });

  ipcMain.handle('queue:clearMedia', () => {
    mediaQueue.clear();
  });

  ipcMain.handle('queue:clearMusic', () => {
    musicQueue.clear();
  });

  // Push state changes to renderer
  const pushState = (): void => {
    const state = {
      media: mediaQueue.getState(),
      music: musicQueue.getState(),
    };
    for (const win of BrowserWindow.getAllWindows()) {
      win.webContents.send('queue:state', state);
    }
  };

  mediaQueue.on('stateChange', pushState);
  musicQueue.on('stateChange', pushState);
}
