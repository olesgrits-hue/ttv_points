import { ipcMain } from 'electron';
import { ConfigStore } from '../store/config';
import { AlertConfig, DEFAULT_ALERT_CONFIG } from '../store/types';
import { OverlayServer } from '../overlay/server';
import { alertLogger } from '../alert-logger';

export function registerAlertIpcHandlers(
  configStore: ConfigStore,
  overlayServer: OverlayServer,
): void {
  ipcMain.handle('alert:getConfig', (): AlertConfig => {
    return configStore.read().alertConfig ?? { ...DEFAULT_ALERT_CONFIG };
  });

  ipcMain.handle('alert:setConfig', (_event, config: AlertConfig): void => {
    const cfg = configStore.read();
    configStore.write({ ...cfg, alertConfig: config });
    // Push updated config to connected alert overlays in real time.
    overlayServer.pushAlertConfig(config);
  });

  ipcMain.handle('alert:trigger', (_event, nick: string): void => {
    alertLogger.log('ipc', 'alert:trigger called', { nick });
    overlayServer.fireAlert(nick || 'TestUser');
  });
}
