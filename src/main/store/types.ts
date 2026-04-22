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
}

export interface MemeSlot extends BaseSlot {
  type: 'meme';
  folderPath: string;
  scale?: number; // 1–5, default 3
}

export interface MusicSlot extends BaseSlot {
  type: 'music';
  scale?: number;
}

export type Slot = MediaSlot | MemeSlot | MusicSlot;

export interface Config {
  slots: Slot[];
  groups: SlotGroup[];
  clientId?: string;
  clientSecret?: string;
  userId?: string;
  broadcasterId?: string;
  tokenExpiresAt?: string;
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
