import type { LogEntry, Slot, SlotGroup } from '../main/store/types';

export interface RewardInfo { rewardId: string; rewardTitle: string; }

export interface AlertConfig {
  enabled: boolean;
  subtitleText: string;
  nickColor: string;
  nickFontSize: number;
  animationSpeed: number;
}

export interface QueueItemState {
  current: { rewardTitle: string; userDisplayName: string; userInput?: string } | null;
  pending: Array<{ rewardTitle: string; userDisplayName: string; userInput?: string }>;
}

export interface ElectronAPI {
  login: () => Promise<void>;
  checkAuth: () => Promise<boolean>;
  getUser: () => Promise<{ userLogin: string | null }>;
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
  // Queue
  queueGetState: () => Promise<{ media: QueueItemState; music: QueueItemState }>;
  queueSkip: () => Promise<void>;
  queueClearMedia: () => Promise<void>;
  queueClearMusic: () => Promise<void>;
  onQueueState: (cb: (state: { media: QueueItemState; music: QueueItemState }) => void) => () => void;
  // Follower Alerts
  alertGetConfig: () => Promise<AlertConfig>;
  alertSetConfig: (config: AlertConfig) => Promise<void>;
  alertTrigger: (nick: string) => Promise<void>;
  // Onboarding
  onboardingCheck: () => Promise<boolean>;
  onboardingComplete: () => Promise<void>;
  // Auto-update
  onUpdateAvailable: (cb: (info: { version: string }) => void) => () => void;
  onUpdateDownloaded: (cb: (info: { version: string }) => void) => () => void;
  updateInstall: () => Promise<void>;
}

declare global {
  interface Window {
    electronAPI: ElectronAPI;
  }
}
