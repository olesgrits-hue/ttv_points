import { v4 as uuid } from 'uuid';
import { BrowserWindow } from 'electron';
import { MaskSlot } from '../store/types';
import { LogEntry } from '../store/types';
import { ConfigStore } from '../store/config';
import { TwitchApiClient } from '../twitch/api';
import { RedemptionEvent } from '../queue/types';
import { parseHotkey } from './hotkey-parser';

const MASK_DURATION_MS = 30_000;

// robotjs is a native module — import lazily so tests can mock it.
// eslint-disable-next-line @typescript-eslint/no-var-requires
const robot = require('robotjs') as {
  keyTap: (key: string, modifiers?: string[]) => void;
};

/**
 * MaskAction executes a mask redemption:
 * 1. Press the slot's activation hotkey.
 * 2. Wait 30 seconds.
 * 3. Press the global remove-mask hotkey (if set).
 * 4. Fulfill the redemption.
 *
 * On any error → cancel redemption + error log.
 */
export class MaskAction {
  constructor(
    private readonly configStore: ConfigStore,
    private readonly twitchApi: TwitchApiClient,
  ) {}

  async execute(slot: MaskSlot, redemption: RedemptionEvent): Promise<void> {
    let success = false;
    let errorMessage: string | undefined;

    try {
      // Step 1: Apply mask.
      const { key: applyKey, modifiers: applyMods } = parseHotkey(slot.hotkey);
      robot.keyTap(applyKey, applyMods);

      // Step 2: Wait 30 seconds.
      await new Promise<void>((resolve) => setTimeout(resolve, MASK_DURATION_MS));

      // Step 3: Remove mask (best-effort — skip if hotkey not configured).
      const removeMaskHotkey = this.configStore.read().removeMaskHotkey;
      if (removeMaskHotkey && removeMaskHotkey.trim().length > 0) {
        try {
          const { key: removeKey, modifiers: removeMods } = parseHotkey(removeMaskHotkey);
          robot.keyTap(removeKey, removeMods);
        } catch (removeErr) {
          // Log warning but continue to fulfill — the mask was applied successfully.
          console.warn('[MaskAction] Failed to remove mask:', removeErr);
        }
      }

      // Step 4: Fulfill.
      await this.twitchApi.fulfillRedemption(redemption.rewardId, redemption.id);
      success = true;
    } catch (err) {
      errorMessage = err instanceof Error ? err.message : String(err);
      try {
        await this.twitchApi.cancelRedemption(redemption.rewardId, redemption.id);
      } catch (cancelErr) {
        console.error('[MaskAction] cancelRedemption failed:', cancelErr);
      }
    }

    const logEntry: LogEntry = {
      id: uuid(),
      timestamp: new Date(),
      viewerName: redemption.userDisplayName,
      rewardTitle: slot.rewardTitle,
      status: success ? 'success' : 'error',
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
