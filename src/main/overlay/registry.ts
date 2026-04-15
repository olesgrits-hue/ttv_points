import { v4 as uuidv4 } from 'uuid';

/**
 * In-memory registry that maps uuid → absolute media file path.
 * Used by OverlayServer to serve files via /media/:id without exposing
 * real filesystem paths to OBS Browser Source.
 */
export class MediaRegistry {
  private readonly entries = new Map<string, string>();

  /** Register a file path and return its generated id. */
  register(filePath: string): string {
    if (typeof filePath !== 'string' || filePath.length === 0) {
      throw new Error('MediaRegistry.register: filePath must be a non-empty string');
    }
    const id = uuidv4();
    this.entries.set(id, filePath);
    return id;
  }

  /** Resolve id → file path, or undefined if not registered. */
  resolve(id: string): string | undefined {
    return this.entries.get(id);
  }

  /** Remove id from registry. Returns true if id existed. */
  deregister(id: string): boolean {
    return this.entries.delete(id);
  }

  /** Number of currently registered entries (for tests / debugging). */
  get size(): number {
    return this.entries.size;
  }
}
