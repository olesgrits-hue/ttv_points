import * as fs from 'fs';
import * as path from 'path';
import { Config, DEFAULT_CONFIG } from './types';

const CONFIG_FILENAME = 'config.json';

/**
 * Resolve directory where config.json lives.
 * - Packaged (portable exe): process.env.PORTABLE_EXECUTABLE_DIR — directory
 *   containing the .exe, survives self-updating/relocation of the binary.
 * - Dev mode: process.cwd() — project root.
 *
 * Exported for testability; consumers should use ConfigStore().
 */
export function resolveConfigDir(isPackaged: boolean): string {
  if (isPackaged) {
    const portableDir = process.env.PORTABLE_EXECUTABLE_DIR;
    if (portableDir && portableDir.length > 0) {
      return portableDir;
    }
    // Fallback so a misconfigured build never crashes; still better than temp dir.
    return process.cwd();
  }
  return process.cwd();
}

export class ConfigStore {
  private readonly filePath: string;
  private readonly tmpPath: string;

  constructor(options: { dir?: string; isPackaged?: boolean } = {}) {
    const dir = options.dir ?? resolveConfigDir(options.isPackaged ?? false);
    this.filePath = path.join(dir, CONFIG_FILENAME);
    this.tmpPath = `${this.filePath}.tmp`;
  }

  getFilePath(): string {
    return this.filePath;
  }

  getSlots(): import('./types').Slot[] {
    return this.read().slots;
  }

  /**
   * Reads config.json. Returns defaults when the file is missing or contains
   * invalid JSON — recovery over failure because a stale/corrupt file should
   * not brick the app (user can re-enter slots, but must not lose access).
   */
  read(): Config {
    let raw: string;
    try {
      raw = fs.readFileSync(this.filePath, 'utf-8');
    } catch (err: unknown) {
      if (isNodeError(err) && err.code === 'ENOENT') {
        return cloneDefaults();
      }
      // Read error other than missing file — propagate so caller can surface.
      throw err;
    }

    try {
      const parsed = JSON.parse(raw) as Partial<Config>;
      return normalize(parsed);
    } catch {
      // Corrupt JSON — treat as if fresh install.
      return cloneDefaults();
    }
  }

  /**
   * Atomic write: serialize to a sibling .tmp file, then rename over the
   * target. rename() is atomic on the same volume; the .tmp fallback path
   * (copy+unlink) handles the rare cross-drive case on Windows.
   */
  write(config: Config): void {
    const json = JSON.stringify(config, null, 2);
    fs.writeFileSync(this.tmpPath, json, { encoding: 'utf-8' });
    try {
      fs.renameSync(this.tmpPath, this.filePath);
    } catch (err: unknown) {
      if (isNodeError(err) && err.code === 'EXDEV') {
        // Cross-device rename — use copy + unlink.
        fs.copyFileSync(this.tmpPath, this.filePath);
        fs.unlinkSync(this.tmpPath);
        return;
      }
      // Clean up the .tmp file on any other failure so we don't leave garbage.
      try {
        fs.unlinkSync(this.tmpPath);
      } catch {
        /* ignore cleanup error — original error is more informative */
      }
      throw err;
    }
  }
}

function cloneDefaults(): Config {
  return { ...DEFAULT_CONFIG, slots: [] };
}

function normalize(parsed: Partial<Config>): Config {
  return {
    slots: Array.isArray(parsed.slots) ? parsed.slots : [],
    groups: Array.isArray(parsed.groups) ? parsed.groups : [],
    clientId: typeof parsed.clientId === 'string' ? parsed.clientId : undefined,
    clientSecret: typeof parsed.clientSecret === 'string' ? parsed.clientSecret : undefined,
    userId: typeof parsed.userId === 'string' ? parsed.userId : undefined,
    broadcasterId:
      typeof parsed.broadcasterId === 'string' ? parsed.broadcasterId : undefined,
    tokenExpiresAt:
      typeof parsed.tokenExpiresAt === 'string' ? parsed.tokenExpiresAt : undefined,
  };
}

function isNodeError(err: unknown): err is NodeJS.ErrnoException {
  return (
    typeof err === 'object' &&
    err !== null &&
    typeof (err as NodeJS.ErrnoException).code === 'string'
  );
}
