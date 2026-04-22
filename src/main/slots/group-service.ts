import { randomUUID } from 'crypto';
import { ConfigStore } from '../store/config';
import { SlotGroup } from '../store/types';

export class GroupService {
  constructor(private readonly config: ConfigStore) {}

  getGroups(): SlotGroup[] {
    return this.config.read().groups;
  }

  createGroup(name: string): SlotGroup {
    const cfg = this.config.read();
    const group: SlotGroup = { id: randomUUID(), name };
    this.config.write({ ...cfg, groups: [...cfg.groups, group] });
    return group;
  }

  deleteGroup(id: string): void {
    const cfg = this.config.read();
    const groups = cfg.groups.filter((g) => g.id !== id);
    // Clear groupId from any slots that belonged to this group
    const slots = cfg.slots.map((s) => (s.groupId === id ? { ...s, groupId: undefined } : s));
    this.config.write({ ...cfg, groups, slots });
  }
}
