import { ipcMain } from 'electron';
import { GroupService } from '../slots/group-service';

function assertString(val: unknown, field: string): asserts val is string {
  if (typeof val !== 'string' || val.length === 0 || val.length > 200) {
    throw new Error(`IPC validation failed: "${field}" must be a non-empty string (max 200)`);
  }
}

export function registerGroupIpcHandlers(groupService: GroupService): void {
  ipcMain.handle('groups:list', () => groupService.getGroups());

  ipcMain.handle('groups:create', (_event, name: unknown) => {
    assertString(name, 'name');
    return groupService.createGroup(name);
  });

  ipcMain.handle('groups:delete', (_event, id: unknown) => {
    assertString(id, 'id');
    groupService.deleteGroup(id);
  });
}
