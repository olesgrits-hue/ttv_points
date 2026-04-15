import type { LogEntry, Slot } from '../main/store/types';

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

declare global {
  interface Window {
    electronAPI: ElectronAPI;
  }
}
