import { ipcMain } from 'electron';
import { SnapLensSearch } from '../snap/search';

const snapSearch = new SnapLensSearch();

export function registerSnapIpcHandlers(): void {
  ipcMain.handle('snap:search', (_event, query: string) => {
    return snapSearch.search(query);
  });
}
