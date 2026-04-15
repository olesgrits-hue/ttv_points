import { ipcMain } from 'electron';
import { SnapLensSearch } from '../snap/search';

const snapSearch = new SnapLensSearch();

const MAX_QUERY_LEN = 200;

export function registerSnapIpcHandlers(): void {
  ipcMain.handle('snap:search', async (_event, query: unknown) => {
    if (typeof query !== 'string' || query.length === 0 || query.length > MAX_QUERY_LEN) {
      throw new Error(`IPC validation failed: query must be a non-empty string (max ${MAX_QUERY_LEN})`);
    }
    const result = await snapSearch.search(query);
    if (Array.isArray(result)) {
      // Map from internal { id, name } to renderer-expected { lensId, lensName }
      return result.map((r) => ({ lensId: r.id, lensName: r.name }));
    }
    // SnapUnavailableError → renderer-expected { error: string }
    return { error: result.message };
  });
}
