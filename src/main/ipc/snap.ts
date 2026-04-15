import { ipcMain } from 'electron';
import { SnapLensSearch } from '../snap/search';

const snapSearch = new SnapLensSearch();

export function registerSnapIpcHandlers(): void {
  ipcMain.handle('snap:search', async (_event, query: string) => {
    const result = await snapSearch.search(query);
    if (Array.isArray(result)) {
      // Map from internal { id, name } to renderer-expected { lensId, lensName }
      return result.map((r) => ({ lensId: r.id, lensName: r.name }));
    }
    // SnapUnavailableError → renderer-expected { error: string }
    return { error: result.message };
  });
}
