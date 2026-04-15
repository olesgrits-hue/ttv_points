import { ipcMain, dialog } from 'electron';
import { randomUUID } from 'crypto';
import { SlotService } from '../slots/service';
import { TwitchApiClient } from '../twitch/api';
import type { Slot } from '../store/types';

export function registerSlotIpcHandlers(
  slotService: SlotService,
  twitchApi: TwitchApiClient,
): void {
  ipcMain.handle('slots:list', () => {
    return slotService.getSlots();
  });

  ipcMain.handle('slots:create', (_event, payload: Omit<Slot, 'id'>) => {
    const slot = { ...payload, id: randomUUID() } as Slot;
    return slotService.addSlot(slot);
  });

  ipcMain.handle('slots:delete', (_event, id: string) => {
    slotService.removeSlot(id);
  });

  ipcMain.handle('slots:toggle', (_event, { id, enabled }: { id: string; enabled: boolean }) => {
    slotService.toggleSlot(id, enabled);
    // Return the updated slot
    const slots = slotService.getSlots();
    const updated = slots.find((s) => s.id === id);
    if (!updated) throw new Error(`Slot ${id} not found after toggle`);
    return updated;
  });

  ipcMain.handle('rewards:list', async () => {
    const rewards = await twitchApi.listRewards();
    return rewards.map((r) => ({ rewardId: r.id, rewardTitle: r.title }));
  });

  ipcMain.handle(
    'rewards:create',
    async (_event, { name, cost, cooldownMinutes }: { name: string; cost: number; cooldownMinutes: number }) => {
      const reward = await twitchApi.createReward(name, cost, cooldownMinutes * 60);
      return { rewardId: reward.id, rewardTitle: reward.title };
    },
  );

  ipcMain.handle('dialog:openFile', async () => {
    const result = await dialog.showOpenDialog({
      properties: ['openFile'],
      filters: [{ name: 'Media', extensions: ['mp4', 'webm', 'gif', 'png', 'jpg', 'jpeg'] }],
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
