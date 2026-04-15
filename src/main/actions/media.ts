import * as fs from 'fs';
import * as path from 'path';
import { v4 as uuid } from 'uuid';
import { BrowserWindow } from 'electron';
import { MediaSlot, MemeSlot, Slot, LogEntry } from '../store/types';
import { OverlayServer } from '../overlay/server';
import { TwitchApiClient } from '../twitch/api';
import { RedemptionEvent } from '../queue/types';

/**
 * Validate that `filePath` does not escape `baseDir` via path traversal.
 * Throws if traversal is detected.
 */
function validatePath(filePath: string, baseDir: string): void {
  const rel = path.relative(baseDir, filePath);
  if (rel.startsWith('..') || path.isAbsolute(rel)) {
    throw new Error(`Path traversal blocked: ${filePath}`);
  }
}

/**
 * Resolve the file path for a slot:
 *   - MediaSlot → slot.filePath (normalized + traversal-checked)
 *   - MemeSlot  → random file from slot.folderPath
 */
async function resolveFilePath(slot: MediaSlot | MemeSlot): Promise<string> {
  if (slot.type === 'media') {
    const resolved = path.normalize(slot.filePath);
    const baseDir = path.dirname(resolved);
    validatePath(resolved, baseDir);

    // Verify the file exists before registering.
    await fs.promises.access(resolved, fs.constants.R_OK);
    return resolved;
  }

  // MemeSlot: pick a random file from the folder.
  let entries: fs.Dirent[];
  try {
    entries = await fs.promises.readdir(slot.folderPath, { withFileTypes: true });
  } catch (err) {
    const isNotFound =
      typeof err === 'object' && err !== null && (err as NodeJS.ErrnoException).code === 'ENOENT';
    throw new Error(
      isNotFound
        ? `Meme folder not found: ${slot.folderPath}`
        : `Cannot read meme folder: ${(err as Error).message}`,
    );
  }

  const files = entries
    .filter((e) => e.isFile())
    .map((e) => path.join(slot.folderPath, e.name));

  if (files.length === 0) {
    throw new Error(`Meme folder is empty: ${slot.folderPath}`);
  }

  const chosen = files[Math.floor(Math.random() * files.length)];
  validatePath(chosen, slot.folderPath);
  return chosen;
}

/**
 * MediaAction handles media/meme slot redemptions:
 * 1. Resolve file path and validate (no traversal).
 * 2. Register in OverlayServer registry → get UUID.
 * 3. Push play command to overlay; await playback_ended or 120s timeout.
 * 4. Deregister from registry.
 * 5. Fulfill redemption on success (including timeout) or cancel on error.
 */
export class MediaAction {
  constructor(
    private readonly overlayServer: OverlayServer,
    private readonly twitchApi: TwitchApiClient,
  ) {}

  async execute(slot: Slot, redemption: RedemptionEvent): Promise<void> {
    if (slot.type !== 'media' && slot.type !== 'meme') {
      throw new Error(`MediaAction: unexpected slot type "${slot.type}"`);
    }

    let filePath: string;
    let success = false;
    let errorMessage: string | undefined;

    try {
      filePath = await resolveFilePath(slot as MediaSlot | MemeSlot);
    } catch (err) {
      errorMessage = err instanceof Error ? err.message : String(err);
      try {
        await this.twitchApi.cancelRedemption(redemption.rewardId, redemption.id);
      } catch {/* logged upstream */}
      _broadcastLog({
        id: uuid(),
        timestamp: new Date(),
        viewerName: redemption.userDisplayName,
        rewardTitle: slot.rewardTitle,
        status: 'error',
        errorMessage,
      });
      return;
    }

    const id = this.overlayServer.registry.register(filePath);
    try {
      // play() pushes the WS command and waits for playback_ended OR 120s timeout.
      await this.overlayServer.play(id, filePath);
      await this.twitchApi.fulfillRedemption(redemption.rewardId, redemption.id);
      success = true;
    } catch (err) {
      errorMessage = err instanceof Error ? err.message : String(err);
      try {
        await this.twitchApi.cancelRedemption(redemption.rewardId, redemption.id);
      } catch {/* logged upstream */}
    } finally {
      this.overlayServer.registry.deregister(id);
    }

    _broadcastLog({
      id: uuid(),
      timestamp: new Date(),
      viewerName: redemption.userDisplayName,
      rewardTitle: slot.rewardTitle,
      status: success ? 'success' : 'error',
      errorMessage,
    });
  }
}

function _broadcastLog(entry: LogEntry): void {
  for (const win of BrowserWindow.getAllWindows()) {
    win.webContents.send('log:entry', entry);
  }
}
