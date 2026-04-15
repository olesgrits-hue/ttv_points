import { ConfigStore } from '../store/config';
import { Slot, MAX_SLOTS } from '../store/types';

export class SlotLimitError extends Error {
  constructor(max: number) {
    super(`Slot limit reached: cannot add more than ${max} slots`);
    this.name = 'SlotLimitError';
  }
}

export class SlotNotFoundError extends Error {
  constructor(id: string) {
    super(`Slot not found: ${id}`);
    this.name = 'SlotNotFoundError';
  }
}

/**
 * SlotService centralises mutations of config.slots. Every mutation goes
 * through read-modify-write on ConfigStore so the persisted file stays the
 * source of truth and atomic write semantics are preserved.
 */
export class SlotService {
  constructor(private readonly config: ConfigStore) {}

  getSlots(): Slot[] {
    return this.config.read().slots;
  }

  addSlot(slot: Slot): Slot {
    const cfg = this.config.read();
    if (cfg.slots.length >= MAX_SLOTS) {
      throw new SlotLimitError(MAX_SLOTS);
    }
    // Guard against duplicate ids caused by a bad caller.
    if (cfg.slots.some((s) => s.id === slot.id)) {
      throw new Error(`Slot with id ${slot.id} already exists`);
    }
    const next = { ...cfg, slots: [...cfg.slots, slot] };
    this.config.write(next);
    return slot;
  }

  removeSlot(id: string): void {
    const cfg = this.config.read();
    const filtered = cfg.slots.filter((s) => s.id !== id);
    if (filtered.length === cfg.slots.length) {
      throw new SlotNotFoundError(id);
    }
    this.config.write({ ...cfg, slots: filtered });
  }

  toggleSlot(id: string, enabled: boolean): void {
    const cfg = this.config.read();
    let found = false;
    const slots = cfg.slots.map((s) => {
      if (s.id === id) {
        found = true;
        return { ...s, enabled };
      }
      return s;
    });
    if (!found) {
      throw new SlotNotFoundError(id);
    }
    this.config.write({ ...cfg, slots });
  }
}
