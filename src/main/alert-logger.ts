/**
 * Alert debug logger — writes alert-debug.json next to the exe / config.json.
 * Keeps the last MAX_ENTRIES entries, flushes to disk with a short debounce.
 */
import * as fs from 'fs';
import * as path from 'path';
import { app } from 'electron';
import { resolveConfigDir } from './store/config';

const MAX_ENTRIES = 500;
const FLUSH_DELAY_MS = 400;
const LOG_FILENAME = 'alert-debug.json';

export interface LogRecord {
  ts: string;      // ISO timestamp
  cat: string;     // category: eventsub | ws | ipc | alert | follow
  msg: string;
  data?: unknown;
}

class AlertLogger {
  private entries: LogRecord[] = [];
  private filePath = '';
  private flushTimer: NodeJS.Timeout | null = null;
  private initialized = false;

  init(isPackaged: boolean): void {
    if (this.initialized) return;
    this.initialized = true;
    const dir = resolveConfigDir(isPackaged);
    this.filePath = path.join(dir, LOG_FILENAME);
    // Load existing entries from previous session.
    try {
      const raw = fs.readFileSync(this.filePath, 'utf-8');
      const parsed = JSON.parse(raw) as LogRecord[];
      if (Array.isArray(parsed)) {
        this.entries = parsed.slice(-MAX_ENTRIES);
      }
    } catch {
      this.entries = [];
    }
    this.log('logger', 'Logger initialized', { file: this.filePath });
  }

  log(cat: string, msg: string, data?: unknown): void {
    const record: LogRecord = { ts: new Date().toISOString(), cat, msg };
    if (data !== undefined) record.data = data;
    this.entries.push(record);
    if (this.entries.length > MAX_ENTRIES) {
      this.entries = this.entries.slice(-MAX_ENTRIES);
    }
    // eslint-disable-next-line no-console
    console.log(`[alert-logger] [${cat}] ${msg}`, data ?? '');
    this.scheduleFlush();
  }

  private scheduleFlush(): void {
    if (this.flushTimer) return;
    this.flushTimer = setTimeout(() => {
      this.flushTimer = null;
      this.flush();
    }, FLUSH_DELAY_MS);
  }

  private flush(): void {
    if (!this.filePath) return;
    try {
      fs.writeFileSync(this.filePath, JSON.stringify(this.entries, null, 2), 'utf-8');
    } catch (e) {
      console.error('[alert-logger] flush error:', e);
    }
  }

  getEntries(): LogRecord[] {
    return [...this.entries];
  }
}

export const alertLogger = new AlertLogger();
