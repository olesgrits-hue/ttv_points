import { v4 as uuid } from 'uuid';
import { BrowserWindow } from 'electron';
import { ConfigStore } from '../store/config';
import { TwitchApiClient } from '../twitch/api';
import { Slot } from '../store/types';
import { LogEntry } from '../store/types';
import { RedemptionEvent } from './types';

// Lazy imports of action handlers — implemented in Tasks 8 and 9.
// Imported lazily to avoid circular deps during task-by-task implementation.
export type ExecuteFn = (slot: Slot, redemption: RedemptionEvent) => Promise<void>;

let _mediaExecute: ExecuteFn | null = null;
let _musicExecute: ExecuteFn | null = null;

/** Register action handlers (called during bootstrap in main/index.ts). */
export function registerActionHandlers(
  mediaExecute: ExecuteFn,
  musicExecute: ExecuteFn,
): void {
  _mediaExecute = mediaExecute;
  _musicExecute = musicExecute;
}

/**
 * Dispatcher resolves the slot for a redemption and routes to the
 * appropriate action handler. On failure (slot missing, disabled, or
 * handler error) it cancels the redemption and emits an error log entry.
 */
export class Dispatcher {
  constructor(
    private readonly configStore: ConfigStore,
    private readonly twitchApi: TwitchApiClient,
  ) {}

  async dispatch(redemption: RedemptionEvent): Promise<void> {
    const slots = this.configStore.getSlots();
    const slot = slots.find((s) => s.rewardId === redemption.rewardId);

    if (!slot) {
      await this._cancelAndLog(
        redemption,
        null,
        `Slot not found for reward "${redemption.rewardTitle}"`,
      );
      return;
    }

    if (!slot.enabled) {
      await this._cancelAndLog(
        redemption,
        slot,
        `Slot "${slot.rewardTitle}" is disabled`,
      );
      return;
    }

    try {
      if (slot.type === 'music') {
        if (!_musicExecute) throw new Error('MusicAction handler not registered');
        await _musicExecute(slot, redemption);
      } else {
        if (!_mediaExecute) throw new Error('MediaAction handler not registered');
        await _mediaExecute(slot, redemption);
      }
    } catch (err) {
      await this._cancelAndLog(
        redemption,
        slot,
        err instanceof Error ? err.message : String(err),
      );
    }
  }

  // ---- Private ---------------------------------------------------------------

  private async _cancelAndLog(
    redemption: RedemptionEvent,
    slot: (Slot & { type: string }) | null,
    errorMessage: string,
  ): Promise<void> {
    try {
      await this.twitchApi.cancelRedemption(redemption.rewardId, redemption.id);
    } catch (cancelErr) {
      // Log the cancel failure but do not re-throw — queue must not stall.
      console.error('[Dispatcher] cancelRedemption failed:', cancelErr);
    }

    const logEntry: LogEntry = {
      id: uuid(),
      timestamp: new Date(),
      viewerName: redemption.userDisplayName,
      rewardTitle: slot?.rewardTitle ?? redemption.rewardTitle,
      status: 'error',
      errorMessage,
    };
    _broadcastLog(logEntry);
  }
}

function _broadcastLog(entry: LogEntry): void {
  for (const win of BrowserWindow.getAllWindows()) {
    win.webContents.send('log:entry', entry);
  }
}

