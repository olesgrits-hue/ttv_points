import { ipcMain } from 'electron';
import { AuthStore } from '../store/auth';
import { ConfigStore } from '../store/config';
import { loginWithDeviceFlow, DeviceAuthProgress } from '../yandex/auth-window';

export function registerSettingsIpcHandlers(authStore: AuthStore, configStore?: ConfigStore): void {
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

  ipcMain.handle('onboarding:check', () => {
    if (!configStore) return true;
    return configStore.read().onboardingDone === true;
  });

  ipcMain.handle('onboarding:complete', () => {
    if (!configStore) return;
    const cfg = configStore.read();
    configStore.write({ ...cfg, onboardingDone: true });
  });
}
