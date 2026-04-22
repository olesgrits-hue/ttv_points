/**
 * Electron main process entry point.
 * Bootstraps all singletons, registers IPC handlers, starts services.
 */
import { app } from 'electron';
import { createWindow } from './window';
import { ConfigStore } from './store/config';
import { AuthStore } from './store/auth';
import { TwitchAuth } from './twitch/auth';
import { TwitchApiClient } from './twitch/api';
import { TwitchClient } from './twitch/client';
import { OverlayServer } from './overlay/server';
import { SlotService } from './slots/service';
import { Queue } from './queue';
import { MediaAction } from './actions/media';
import { MusicAction } from './actions/music';
import { registerActionHandlers, type ExecuteFn } from './queue/dispatcher';
import { registerAuthIpcHandlers, checkAuthOnStartup } from './ipc/auth';
import { registerSlotIpcHandlers } from './ipc/slots';
import { registerGroupIpcHandlers } from './ipc/groups';
import { registerSettingsIpcHandlers } from './ipc/settings';
import { GroupService } from './slots/group-service';

// ---- Singletons (created exactly once) ----------------------------------------

const configStore = new ConfigStore({ isPackaged: app.isPackaged });
const authStore = new AuthStore();
const twitchAuth = new TwitchAuth(authStore, configStore);
const twitchApi = new TwitchApiClient(configStore, authStore, twitchAuth);
const twitchClient = new TwitchClient(configStore, authStore, twitchAuth);
const overlayServer = new OverlayServer();
const slotService = new SlotService(configStore);
const groupService = new GroupService(configStore);

// Action handlers constructed with shared singletons
const mediaAction = new MediaAction(overlayServer, twitchApi);
const musicAction = new MusicAction(authStore, overlayServer, twitchApi);

// Register action handlers in dispatcher (avoids circular deps)
registerActionHandlers(
  mediaAction.execute.bind(mediaAction) as ExecuteFn,
  musicAction.execute.bind(musicAction) as ExecuteFn,
);

// Queue wired to TwitchClient for pause/resume
const queue = new Queue(configStore, twitchClient, twitchApi);

// ---- App lifecycle ------------------------------------------------------------

app.whenReady().then(async () => {
  // Register all IPC handlers before creating the window
  registerAuthIpcHandlers(twitchAuth, authStore, configStore);
  registerSlotIpcHandlers(slotService, twitchApi);
  registerGroupIpcHandlers(groupService);
  registerSettingsIpcHandlers(authStore);

  const win = createWindow();

  // Start overlay server
  overlayServer.start();

  // Start Twitch connection + check auth on startup
  await checkAuthOnStartup(twitchAuth, authStore, configStore);
  twitchClient.start();

  // Forward Twitch redemption events into the queue
  twitchClient.on('redemption', (ev) => {
    queue.enqueue(ev);
  });

  app.on('activate', () => {
    // macOS: re-open window when dock icon clicked with no windows open
    const { BrowserWindow } = require('electron') as typeof import('electron');
    if (BrowserWindow.getAllWindows().length === 0) {
      createWindow();
    }
  });

  void win; // suppress unused warning — win is used by BrowserWindow.getAllWindows()
});

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') {
    overlayServer.stop();
    twitchClient.stop();
    app.quit();
  }
});
