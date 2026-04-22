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
async function resolveFilePath(slot: MediaSlot | MemeSlot, exclude: string[] = []): Promise<string> {
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

  const allFiles = entries
    .filter((e) => e.isFile())
    .map((e) => path.join(slot.folderPath, e.name));

  if (allFiles.length === 0) {
    throw new Error(`Meme folder is empty: ${slot.folderPath}`);
  }

  // Filter out recently played files; fall back to full list if all are excluded.
  const files = allFiles.length > exclude.length
    ? allFiles.filter((f) => !exclude.includes(f))
    : allFiles;

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
// How many recent files to remember per meme slot before allowing repeats.
const MEME_HISTORY_SIZE = 3;

export class MediaAction {
  // Per-slot recent file history to avoid consecutive duplicates.
  private readonly memeHistory = new Map<string, string[]>();

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
      filePath = await resolveFilePath(
        slot as MediaSlot | MemeSlot,
        slot.type === 'meme' ? this._getMemeHistory(slot.id) : [],
      );
      if (slot.type === 'meme') this._recordMeme(slot.id, filePath);
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
      const scale = (slot as MediaSlot | MemeSlot).scale ?? 3;
      await this.overlayServer.play(id, filePath, scale, slot.type === 'meme', slot.groupId ?? 'default');
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

  private _getMemeHistory(slotId: string): string[] {
    return this.memeHistory.get(slotId) ?? [];
  }

  private _recordMeme(slotId: string, filePath: string): void {
    const history = this.memeHistory.get(slotId) ?? [];
    history.push(filePath);
    if (history.length > MEME_HISTORY_SIZE) history.shift();
    this.memeHistory.set(slotId, history);
  }
}

function _broadcastLog(entry: LogEntry): void {
  for (const win of BrowserWindow.getAllWindows()) {
    win.webContents.send('log:entry', entry);
  }
}
