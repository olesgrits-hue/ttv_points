// Shared data-model types for config store and in-memory registries.
// Mirror tech-spec "Data Models" section — keep in sync if the spec changes.

export interface SlotGroup {
  id: string;
  name: string;
}

export interface BaseSlot {
  id: string;
  type: 'media' | 'meme' | 'music';
  enabled: boolean;
  rewardId: string;
  rewardTitle: string;
  groupId?: string;
}

export interface MediaSlot extends BaseSlot {
  type: 'media';
  filePath: string;
  scale?: number; // 1–5, default 3
  overlayWidth?: number;
  overlayHeight?: number;
}

export interface MemeSlot extends BaseSlot {
  type: 'meme';
  folderPath: string;
  scale?: number; // 1–5, default 3
  overlayWidth?: number;
  overlayHeight?: number;
}

export interface MusicSlot extends BaseSlot {
  type: 'music';
  scale?: number;
  showPlayer?: boolean; // default true — false plays audio only, no vinyl UI
}

export type Slot = MediaSlot | MemeSlot | MusicSlot;

export interface AlertConfig {
  enabled: boolean;
  subtitleText: string;
  nickColor: string;
  nickFontSize: number;
  animationSpeed: number;
}

export const DEFAULT_ALERT_CONFIG: AlertConfig = {
  enabled: true,
  subtitleText: 'десантировался на канал',
  nickColor: '#ff2e7e',
  nickFontSize: 52,
  animationSpeed: 1.0,
};

export interface Config {
  slots: Slot[];
  groups: SlotGroup[];
  clientId?: string;
  clientSecret?: string;
  userId?: string;
  broadcasterId?: string;
  userLogin?: string;
  tokenExpiresAt?: string;
  onboardingDone?: boolean;
  alertConfig?: AlertConfig;
}

export interface LogEntry {
  id: string;
  timestamp: Date;
  viewerName: string;
  rewardTitle: string;
  status: 'success' | 'error';
  errorMessage?: string;
}

export interface MediaRegistryEntry {
  id: string;
  filePath: string;
}

export const DEFAULT_CONFIG: Config = {
  slots: [],
  groups: [],
};

export const MAX_SLOTS = 5;
