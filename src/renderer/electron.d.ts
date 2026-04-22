import type { LogEntry, Slot, SlotGroup } from '../main/store/types';

export interface RewardInfo { rewardId: string; rewardTitle: string; }

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
  // Shell
  shellOpenExternal: (url: string) => Promise<void>;
  // Groups
  groupsList: () => Promise<SlotGroup[]>;
  groupsCreate: (name: string) => Promise<SlotGroup>;
  groupsDelete: (id: string) => Promise<void>;
  // Settings
  settingsGetYamToken: () => Promise<string | undefined>;
  settingsSetYamToken: (token: string) => Promise<void>;
  settingsYamDeviceAuth: () => Promise<string>;
  onYamDeviceProgress: (cb: (p: { verification_url: string; user_code: string }) => void) => () => void;
}

declare global {
  interface Window {
    electronAPI: ElectronAPI;
  }
}
