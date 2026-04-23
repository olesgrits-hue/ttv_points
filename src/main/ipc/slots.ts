import { ipcMain, dialog, shell } from 'electron';
import { randomUUID } from 'crypto';
import { SlotService } from '../slots/service';
import { TwitchApiClient } from '../twitch/api';
import type { Slot } from '../store/types';

const VALID_SLOT_TYPES = new Set(['media', 'meme', 'music']);
const MAX_STRING_LEN = 500;

/** Throw if val is not a non-empty string within an acceptable length. */
function assertString(val: unknown, field: string): asserts val is string {
  if (typeof val !== 'string' || val.length === 0 || val.length > MAX_STRING_LEN) {
    throw new Error(`IPC validation failed: field "${field}" must be a non-empty string (max ${MAX_STRING_LEN})`);
  }
}

function assertBoolean(val: unknown, field: string): asserts val is boolean {
  if (typeof val !== 'boolean') {
    throw new Error(`IPC validation failed: field "${field}" must be a boolean`);
  }
}

function assertNumber(val: unknown, field: string): asserts val is number {
  if (typeof val !== 'number' || !isFinite(val)) {
    throw new Error(`IPC validation failed: field "${field}" must be a finite number`);
  }
}

/** Validate a slot create payload — no prototype pollution, no unknown types. */
function validateSlotPayload(payload: unknown): Omit<Slot, 'id'> {
  if (!payload || typeof payload !== 'object' || Array.isArray(payload)) {
    throw new Error('IPC validation failed: slot payload must be an object');
  }
  const p = payload as Record<string, unknown>;

  assertString(p['type'], 'type');
  if (!VALID_SLOT_TYPES.has(p['type'] as string)) {
    throw new Error(`IPC validation failed: unknown slot type "${p['type']}"`);
  }
  assertBoolean(p['enabled'], 'enabled');
  assertString(p['rewardId'], 'rewardId');
  assertString(p['rewardTitle'], 'rewardTitle');

  const type = p['type'] as 'media' | 'meme' | 'music';
  const base = { enabled: p['enabled'] as boolean, rewardId: p['rewardId'] as string, rewardTitle: p['rewardTitle'] as string };
  if (type === 'music') {
    const showPlayer = typeof p['showPlayer'] === 'boolean' ? p['showPlayer'] : true;
    return { ...base, type, showPlayer } as Omit<Slot, 'id'>;
  }
  const overlayWidth = typeof p['overlayWidth'] === 'number' && isFinite(p['overlayWidth'] as number) ? p['overlayWidth'] as number : undefined;
  const overlayHeight = typeof p['overlayHeight'] === 'number' && isFinite(p['overlayHeight'] as number) ? p['overlayHeight'] as number : undefined;
  if (type === 'media') {
    assertString(p['filePath'], 'filePath');
    const scale = typeof p['scale'] === 'number' ? Math.min(5, Math.max(1, Math.round(p['scale']))) : 3;
    return { ...base, type, filePath: p['filePath'] as string, scale, overlayWidth, overlayHeight } as Omit<Slot, 'id'>;
  }
  // meme
  assertString(p['folderPath'], 'folderPath');
  const scale = typeof p['scale'] === 'number' ? Math.min(5, Math.max(1, Math.round(p['scale']))) : 3;
  return { ...base, type, folderPath: p['folderPath'] as string, scale, overlayWidth, overlayHeight } as Omit<Slot, 'id'>;
}

export function registerSlotIpcHandlers(
  slotService: SlotService,
  twitchApi: TwitchApiClient,
): void {
  ipcMain.handle('slots:list', () => {
    return slotService.getSlots();
  });

  ipcMain.handle('slots:create', (_event, payload: unknown) => {
    const validated = validateSlotPayload(payload);
    const slot = { ...validated, id: randomUUID() } as Slot;
    return slotService.addSlot(slot);
  });

  ipcMain.handle('slots:delete', (_event, id: unknown) => {
    assertString(id, 'id');
    slotService.removeSlot(id);
  });

  ipcMain.handle('slots:toggle', (_event, raw: unknown) => {
    if (!raw || typeof raw !== 'object' || Array.isArray(raw)) {
      throw new Error('IPC validation failed: expected {id, enabled} object');
    }
    const { id, enabled } = raw as Record<string, unknown>;
    assertString(id, 'id');
    assertBoolean(enabled, 'enabled');
    slotService.toggleSlot(id, enabled);
    const slots = slotService.getSlots();
    const updated = slots.find((s) => s.id === id);
    if (!updated) throw new Error(`Slot ${id} not found after toggle`);
    return updated;
  });

  ipcMain.handle('slots:setScale', (_event, raw: unknown) => {
    if (!raw || typeof raw !== 'object' || Array.isArray(raw)) {
      throw new Error('IPC validation failed: expected {id, scale}');
    }
    const { id, scale } = raw as Record<string, unknown>;
    assertString(id, 'id');
    assertNumber(scale, 'scale');
    slotService.setSlotScale(id, Math.min(5, Math.max(1, Math.round(scale as number))));
  });

  ipcMain.handle('slots:setGroup', (_event, raw: unknown) => {
    if (!raw || typeof raw !== 'object' || Array.isArray(raw)) {
      throw new Error('IPC validation failed: expected {id, groupId}');
    }
    const { id, groupId } = raw as Record<string, unknown>;
    assertString(id, 'id');
    if (groupId !== undefined && groupId !== null && typeof groupId !== 'string') {
      throw new Error('IPC validation failed: groupId must be a string or null');
    }
    slotService.setSlotGroup(id, groupId as string | undefined);
  });

  ipcMain.handle('shell:openExternal', (_event, url: unknown) => {
    if (typeof url !== 'string' || !url.startsWith('https://')) {
      throw new Error('Invalid URL');
    }
    return shell.openExternal(url);
  });

  ipcMain.handle('rewards:list', async () => {
    const rewards = await twitchApi.listRewards();
    return rewards.map((r) => ({ rewardId: r.id, rewardTitle: r.title }));
  });

  ipcMain.handle('rewards:create', async (_event, raw: unknown) => {
    if (!raw || typeof raw !== 'object' || Array.isArray(raw)) {
      throw new Error('IPC validation failed: expected {name, cost, cooldownMinutes}');
    }
    const { name, cost, cooldownMinutes } = raw as Record<string, unknown>;
    assertString(name, 'name');
    assertNumber(cost, 'cost');
    assertNumber(cooldownMinutes, 'cooldownMinutes');
    const reward = await twitchApi.createReward(name, cost, cooldownMinutes * 60);
    return { rewardId: reward.id, rewardTitle: reward.title };
  });

  ipcMain.handle('dialog:openFile', async () => {
    const result = await dialog.showOpenDialog({
      properties: ['openFile'],
      filters: [{ name: 'Media', extensions: ['mp4', 'webm', 'gif', 'png', 'jpg', 'jpeg', 'mp3', 'wav', 'ogg', 'aac', 'flac', 'm4a'] }],
    });
    return result.canceled ? null : result.filePaths[0] ?? null;
  });

  ipcMain.handle('dialog:openFolder', async () => {
    const result = await dialog.showOpenDialog({
      properties: ['openDirectory'],
    });
    return result.canceled ? null : result.filePaths[0] ?? null;
  });
}
