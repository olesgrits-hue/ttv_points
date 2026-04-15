import { contextBridge, ipcRenderer } from 'electron';

export interface LogEntry {
  id: string;
  timestamp: Date | string;
  viewerName: string;
  rewardTitle: string;
  status: 'success' | 'error';
  errorMessage?: string;
}

export interface ElectronAPI {
  login: () => Promise<void>;
  checkAuth: () => Promise<boolean>;
  onAuthLogout: (cb: () => void) => () => void;
  onTwitchStatus: (cb: (payload: { connected: boolean }) => void) => () => void;
  onLogEntry: (cb: (entry: LogEntry) => void) => () => void;
}

contextBridge.exposeInMainWorld('electronAPI', {
  login: (): Promise<void> => ipcRenderer.invoke('auth:login'),

  checkAuth: (): Promise<boolean> => ipcRenderer.invoke('auth:check'),

  onAuthLogout: (cb: () => void): (() => void) => {
    const listener = (): void => cb();
    ipcRenderer.on('auth:logout', listener);
    return (): void => { ipcRenderer.removeListener('auth:logout', listener); };
  },

  onTwitchStatus: (cb: (payload: { connected: boolean }) => void): (() => void) => {
    const listener = (_event: Electron.IpcRendererEvent, payload: { connected: boolean }): void => cb(payload);
    ipcRenderer.on('twitch:status', listener);
    return (): void => { ipcRenderer.removeListener('twitch:status', listener); };
  },

  onLogEntry: (cb: (entry: LogEntry) => void): (() => void) => {
    const listener = (_event: Electron.IpcRendererEvent, entry: LogEntry): void => cb(entry);
    ipcRenderer.on('twitch:log', listener);
    return (): void => { ipcRenderer.removeListener('twitch:log', listener); };
  },
} satisfies ElectronAPI);
