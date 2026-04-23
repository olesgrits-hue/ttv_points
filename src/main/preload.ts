import { contextBridge, ipcRenderer } from 'electron';

export interface LogEntry {
  id: string;
  timestamp: Date | string;
  viewerName: string;
  rewardTitle: string;
  status: 'success' | 'error';
  errorMessage?: string;
}

export type SlotType = 'media' | 'meme' | 'music';

export interface BaseSlot {
  id: string;
  type: SlotType;
  enabled: boolean;
  rewardId: string;
  rewardTitle: string;
  groupId?: string;
}

export interface MediaSlot extends BaseSlot { type: 'media'; filePath: string; scale?: number; }
export interface MemeSlot extends BaseSlot { type: 'meme'; folderPath: string; scale?: number; }
export interface MusicSlot extends BaseSlot { type: 'music'; }
export type Slot = MediaSlot | MemeSlot | MusicSlot;

export interface RewardInfo { rewardId: string; rewardTitle: string; }
export interface SlotGroup { id: string; name: string; }

export interface QueueItemState {
  current: { rewardTitle: string; userDisplayName: string } | null;
  pending: Array<{ rewardTitle: string; userDisplayName: string }>;
}

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
  slotsSetScale: (payload: { id: string; scale: number }) => Promise<void>;
  slotsSetGroup: (payload: { id: string; groupId: string | undefined }) => Promise<void>;
  // Rewards
  rewardsList: () => Promise<RewardInfo[]>;
  rewardsCreate: (payload: { name: string; cost: number; cooldownMinutes: number }) => Promise<RewardInfo>;
  // Dialogs
  dialogOpenFile: () => Promise<string | null>;
  dialogOpenFolder: () => Promise<string | null>;
  // Groups
  groupsList: () => Promise<SlotGroup[]>;
  groupsCreate: (name: string) => Promise<SlotGroup>;
  groupsDelete: (id: string) => Promise<void>;
  // Shell
  shellOpenExternal: (url: string) => Promise<void>;
  // Settings
  settingsGetYamToken: () => Promise<string | undefined>;
  settingsSetYamToken: (token: string) => Promise<void>;
  settingsYamDeviceAuth: () => Promise<string>;
  onYamDeviceProgress: (cb: (p: { verification_url: string; user_code: string }) => void) => () => void;
  // Queue
  queueGetState: () => Promise<{ media: QueueItemState; music: QueueItemState }>;
  queueSkip: () => Promise<void>;
  queueClearMedia: () => Promise<void>;
  queueClearMusic: () => Promise<void>;
  onQueueState: (cb: (state: { media: QueueItemState; music: QueueItemState }) => void) => () => void;
  // Onboarding
  onboardingCheck: () => Promise<boolean>;
  onboardingComplete: () => Promise<void>;
  // Auto-update
  onUpdateAvailable: (cb: (info: { version: string }) => void) => () => void;
  onUpdateDownloaded: (cb: (info: { version: string }) => void) => () => void;
  updateInstall: () => Promise<void>;
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
    ipcRenderer.on('log:entry', listener);
    return (): void => { ipcRenderer.removeListener('log:entry', listener); };
  },

  slotsList: (): Promise<Slot[]> => ipcRenderer.invoke('slots:list'),
  slotsCreate: (payload: Omit<Slot, 'id'>): Promise<Slot> => ipcRenderer.invoke('slots:create', payload),
  slotsDelete: (id: string): Promise<void> => ipcRenderer.invoke('slots:delete', id),
  slotsToggle: (payload: { id: string; enabled: boolean }): Promise<Slot> => ipcRenderer.invoke('slots:toggle', payload),
  slotsSetScale: (payload: { id: string; scale: number }): Promise<void> => ipcRenderer.invoke('slots:setScale', payload),
  slotsSetGroup: (payload: { id: string; groupId: string | undefined }): Promise<void> => ipcRenderer.invoke('slots:setGroup', payload),

  rewardsList: (): Promise<RewardInfo[]> => ipcRenderer.invoke('rewards:list'),
  rewardsCreate: (payload: { name: string; cost: number; cooldownMinutes: number }): Promise<RewardInfo> =>
    ipcRenderer.invoke('rewards:create', payload),

  dialogOpenFile: (): Promise<string | null> => ipcRenderer.invoke('dialog:openFile'),
  dialogOpenFolder: (): Promise<string | null> => ipcRenderer.invoke('dialog:openFolder'),

  shellOpenExternal: (url: string): Promise<void> => ipcRenderer.invoke('shell:openExternal', url),

  groupsList: (): Promise<SlotGroup[]> => ipcRenderer.invoke('groups:list'),
  groupsCreate: (name: string): Promise<SlotGroup> => ipcRenderer.invoke('groups:create', name),
  groupsDelete: (id: string): Promise<void> => ipcRenderer.invoke('groups:delete', id),

  settingsGetYamToken: (): Promise<string | undefined> => ipcRenderer.invoke('settings:getYamToken'),
  settingsSetYamToken: (token: string): Promise<void> => ipcRenderer.invoke('settings:setYamToken', token),
  settingsYamDeviceAuth: (): Promise<string> => ipcRenderer.invoke('settings:yamDeviceAuth'),
  onYamDeviceProgress: (cb: (p: { verification_url: string; user_code: string }) => void): (() => void) => {
    const listener = (_e: Electron.IpcRendererEvent, p: { verification_url: string; user_code: string }): void => cb(p);
    ipcRenderer.on('settings:yamDeviceProgress', listener);
    return (): void => { ipcRenderer.removeListener('settings:yamDeviceProgress', listener); };
  },

  queueGetState: () => ipcRenderer.invoke('queue:getState'),
  queueSkip: () => ipcRenderer.invoke('queue:skip'),
  queueClearMedia: () => ipcRenderer.invoke('queue:clearMedia'),
  queueClearMusic: () => ipcRenderer.invoke('queue:clearMusic'),
  onQueueState: (cb) => {
    const listener = (_e: Electron.IpcRendererEvent, state: { media: QueueItemState; music: QueueItemState }): void => cb(state);
    ipcRenderer.on('queue:state', listener);
    return (): void => { ipcRenderer.removeListener('queue:state', listener); };
  },

  onboardingCheck: () => ipcRenderer.invoke('onboarding:check'),
  onboardingComplete: () => ipcRenderer.invoke('onboarding:complete'),

  onUpdateAvailable: (cb) => {
    const listener = (_e: Electron.IpcRendererEvent, info: { version: string }): void => cb(info);
    ipcRenderer.on('update:available', listener);
    return (): void => { ipcRenderer.removeListener('update:available', listener); };
  },
  onUpdateDownloaded: (cb) => {
    const listener = (_e: Electron.IpcRendererEvent, info: { version: string }): void => cb(info);
    ipcRenderer.on('update:downloaded', listener);
    return (): void => { ipcRenderer.removeListener('update:downloaded', listener); };
  },
  updateInstall: () => ipcRenderer.invoke('update:install'),
} satisfies ElectronAPI);
