// Shared data-model types for config store and in-memory registries.
// Mirror tech-spec "Data Models" section — keep in sync if the spec changes.

export interface BaseSlot {
  id: string;
  type: 'mask' | 'media' | 'meme';
  enabled: boolean;
  rewardId: string;
  rewardTitle: string;
}

export interface MaskSlot extends BaseSlot {
  type: 'mask';
  lensId: string;
  lensName: string;
  hotkey: string;
}

export interface MediaSlot extends BaseSlot {
  type: 'media';
  filePath: string;
}

export interface MemeSlot extends BaseSlot {
  type: 'meme';
  folderPath: string;
}

export type Slot = MaskSlot | MediaSlot | MemeSlot;

export interface Config {
  slots: Slot[];
  removeMaskHotkey: string;
  userId?: string;
  broadcasterId?: string;
  tokenExpiresAt?: string; // ISO 8601
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
  removeMaskHotkey: '',
};

export const MAX_SLOTS = 5;
