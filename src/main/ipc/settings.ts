import { ipcMain } from 'electron';
import { AuthStore } from '../store/auth';
import { loginWithDeviceFlow, DeviceAuthProgress } from '../yandex/auth-window';

export function registerSettingsIpcHandlers(authStore: AuthStore): void {
  ipcMain.handle('settings:getYamToken', () => {
    return authStore.getYamToken();
  });

  ipcMain.handle('settings:setYamToken', async (_event, token: unknown) => {
    if (typeof token !== 'string') throw new Error('token must be a string');
    const trimmed = token.trim();
    if (trimmed) {
      await authStore.saveYamToken(trimmed);
    } else {
      await authStore.deleteYamToken();
    }
  });

  ipcMain.handle('settings:yamDeviceAuth', async (event) => {
    const token = await loginWithDeviceFlow((progress: DeviceAuthProgress) => {
      event.sender.send('settings:yamDeviceProgress', progress);
    });
    await authStore.saveYamToken(token);
    return token;
  });
}
