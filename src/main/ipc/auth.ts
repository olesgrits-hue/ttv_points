import { ipcMain, BrowserWindow } from 'electron';
import { TwitchAuth } from '../twitch/auth';
import { AuthStore } from '../store/auth';
import { ConfigStore } from '../store/config';

/**
 * Register IPC handlers for authentication flows.
 * Called once during app startup after the main window is created.
 */
export function registerAuthIpcHandlers(
  twitchAuth: TwitchAuth,
  authStore: AuthStore,
  configStore: ConfigStore,
): void {
  ipcMain.handle('auth:login', async () => {
    await twitchAuth.startLogin();
  });

  ipcMain.handle('auth:check', async () => {
    const cfg = configStore.read();
    const { accessToken } = await authStore.getTokens();
    if (!accessToken) return false;
    // Token exists and has not expired → authenticated.
    return !authStore.isTokenExpired(cfg);
  });

  ipcMain.handle('auth:logout', async () => {
    await authStore.deleteTokens();
    const cfg = configStore.read();
    configStore.write({
      ...cfg,
      userId: undefined,
      broadcasterId: undefined,
      tokenExpiresAt: undefined,
    });
  });
}

/**
 * Called on app startup: checks token expiry and attempts a silent refresh.
 * If refresh fails, emits 'auth:logout' to all renderer windows.
 */
export async function checkAuthOnStartup(
  twitchAuth: TwitchAuth,
  authStore: AuthStore,
  configStore: ConfigStore,
): Promise<void> {
  const cfg = configStore.read();
  if (!authStore.isTokenExpired(cfg)) return;

  const { refreshToken } = await authStore.getTokens();
  if (!refreshToken) {
    _broadcastLogout();
    return;
  }

  try {
    await twitchAuth.refreshToken(refreshToken);
  } catch {
    await authStore.deleteTokens();
    _broadcastLogout();
  }
}

function _broadcastLogout(): void {
  for (const win of BrowserWindow.getAllWindows()) {
    win.webContents.send('auth:logout');
  }
}
