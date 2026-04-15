import { contextBridge, ipcRenderer } from 'electron';

export interface LogEntry {
  id: string;
  timestamp: Date | string;
  viewerName: string;
  rewardTitle: string;
  status: 'success' | 'error';
  errorMessage?: string;
}

export type SlotType = 'mask' | 'media' | 'meme';

export interface BaseSlot {
  id: string;
  type: SlotType;
  enabled: boolean;
  rewardId: string;
  rewardTitle: string;
}

export interface MaskSlot extends BaseSlot { type: 'mask'; lensId: string; lensName: string; hotkey: string; }
export interface MediaSlot extends BaseSlot { type: 'media'; filePath: string; }
export interface MemeSlot extends BaseSlot { type: 'meme'; folderPath: string; }
export type Slot = MaskSlot | MediaSlot | MemeSlot;

export interface RewardInfo { rewardId: string; rewardTitle: string; }
export interface LensResult { lensId: string; lensName: string; }

export interface ElectronAPI {
  login: () => Promise<void>;
  checkAuth: () => Promise<boolean>;
  onAuthLogout: (cb: () => void) => () => void;
  onTwitchStatus: (cb: (payload: { connected: boolean }) => void) => () => void;
  onLogEntry: (cb: (entry: LogEntry) => void) => () => void;
  // Slots
  slotsList: () => Promise<Slot[]>;
  slotsCreate: (payload: Omit<Slot, 'id'>) => Promise<Slot>;
  slotsDelete: (id: string) => Promise<void>;
  slotsToggle: (payload: { id: string; enabled: boolean }) => Promise<Slot>;
  // Rewards
  rewardsList: () => Promise<RewardInfo[]>;
  rewardsCreate: (payload: { name: string; cost: number; cooldownMinutes: number }) => Promise<RewardInfo>;
  // Dialogs
  dialogOpenFile: () => Promise<string | null>;
  dialogOpenFolder: () => Promise<string | null>;
  // Snap
  snapSearch: (payload: { query: string }) => Promise<LensResult[] | { error: string }>;
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

  slotsList: (): Promise<Slot[]> => ipcRenderer.invoke('slots:list'),
  slotsCreate: (payload: Omit<Slot, 'id'>): Promise<Slot> => ipcRenderer.invoke('slots:create', payload),
  slotsDelete: (id: string): Promise<void> => ipcRenderer.invoke('slots:delete', id),
  slotsToggle: (payload: { id: string; enabled: boolean }): Promise<Slot> => ipcRenderer.invoke('slots:toggle', payload),

  rewardsList: (): Promise<RewardInfo[]> => ipcRenderer.invoke('rewards:list'),
  rewardsCreate: (payload: { name: string; cost: number; cooldownMinutes: number }): Promise<RewardInfo> =>
    ipcRenderer.invoke('rewards:create', payload),

  dialogOpenFile: (): Promise<string | null> => ipcRenderer.invoke('dialog:openFile'),
  dialogOpenFolder: (): Promise<string | null> => ipcRenderer.invoke('dialog:openFolder'),

  snapSearch: (payload: { query: string }): Promise<LensResult[] | { error: string }> =>
    ipcRenderer.invoke('snap:search', payload.query),
} satisfies ElectronAPI);
