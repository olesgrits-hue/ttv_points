import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';
import { ConfigStore } from '../../src/main/store/config';
import { Config, MaskSlot } from '../../src/main/store/types';
import { SlotService } from '../../src/main/slots/service';

function mkTempDir(): string {
  return fs.mkdtempSync(path.join(os.tmpdir(), 'twitch-helper-cfg-'));
}

function cleanup(dir: string): void {
  try {
    fs.rmSync(dir, { recursive: true, force: true });
  } catch {
    /* ignore */
  }
}

describe('ConfigStore', () => {
  let dir: string;
  let store: ConfigStore;

  beforeEach(() => {
    dir = mkTempDir();
    store = new ConfigStore({ dir });
  });

  afterEach(() => cleanup(dir));

  test('read_returns_defaults_when_file_missing', () => {
    const cfg = store.read();
    expect(cfg).toEqual({ slots: [], removeMaskHotkey: '' });
  });

  test('read_returns_defaults_on_corrupt_json', () => {
    fs.writeFileSync(path.join(dir, 'config.json'), '{not json at all');
    const cfg = store.read();
    expect(cfg).toEqual({ slots: [], removeMaskHotkey: '' });
  });

  test('write_read_roundtrip', () => {
    const slot: MaskSlot = {
      id: 'slot-1',
      type: 'mask',
      enabled: true,
      rewardId: 'r1',
      rewardTitle: 'Test',
      lensId: 'lens-1',
      lensName: 'Lens One',
      hotkey: 'ctrl+shift+1',
    };
    const cfg: Config = {
      slots: [slot],
      removeMaskHotkey: 'ctrl+shift+0',
      userId: 'u1',
      broadcasterId: 'b1',
      tokenExpiresAt: '2030-01-01T00:00:00.000Z',
    };
    store.write(cfg);
    expect(store.read()).toEqual(cfg);
  });

  test('write_is_atomic_via_tmp_file', () => {
    // After a successful write the .tmp file must not linger.
    store.write({ slots: [], removeMaskHotkey: '' });
    expect(fs.existsSync(path.join(dir, 'config.json'))).toBe(true);
    expect(fs.existsSync(path.join(dir, 'config.json.tmp'))).toBe(false);
  });

  test('resolves_dev_path_from_cwd_when_not_packaged', () => {
    const s = new ConfigStore({ isPackaged: false });
    expect(s.getFilePath()).toBe(path.join(process.cwd(), 'config.json'));
  });

  test('resolves_portable_path_when_packaged', () => {
    const prev = process.env.PORTABLE_EXECUTABLE_DIR;
    process.env.PORTABLE_EXECUTABLE_DIR = dir;
    try {
      const s = new ConfigStore({ isPackaged: true });
      expect(s.getFilePath()).toBe(path.join(dir, 'config.json'));
    } finally {
      if (prev === undefined) delete process.env.PORTABLE_EXECUTABLE_DIR;
      else process.env.PORTABLE_EXECUTABLE_DIR = prev;
    }
  });
});

describe('SlotService', () => {
  let dir: string;
  let store: ConfigStore;
  let service: SlotService;

  const makeSlot = (id: string): MaskSlot => ({
    id,
    type: 'mask',
    enabled: true,
    rewardId: `r-${id}`,
    rewardTitle: `Reward ${id}`,
    lensId: 'lens',
    lensName: 'Lens',
    hotkey: 'ctrl+1',
  });

  beforeEach(() => {
    dir = mkTempDir();
    store = new ConfigStore({ dir });
    service = new SlotService(store);
  });

  afterEach(() => cleanup(dir));

  test('rejects_sixth_slot', () => {
    for (let i = 0; i < 5; i++) service.addSlot(makeSlot(`s${i}`));
    expect(() => service.addSlot(makeSlot('s5'))).toThrow(/Slot limit/i);
    expect(service.getSlots()).toHaveLength(5);
  });

  test('addSlot persists via ConfigStore', () => {
    service.addSlot(makeSlot('a'));
    expect(store.read().slots.map((s) => s.id)).toEqual(['a']);
  });

  test('removeSlot removes by id and throws when missing', () => {
    service.addSlot(makeSlot('a'));
    service.addSlot(makeSlot('b'));
    service.removeSlot('a');
    expect(service.getSlots().map((s) => s.id)).toEqual(['b']);
    expect(() => service.removeSlot('missing')).toThrow(/Slot not found/);
  });

  test('toggleSlot updates enabled flag', () => {
    service.addSlot(makeSlot('a'));
    service.toggleSlot('a', false);
    expect(service.getSlots()[0].enabled).toBe(false);
    service.toggleSlot('a', true);
    expect(service.getSlots()[0].enabled).toBe(true);
    expect(() => service.toggleSlot('missing', true)).toThrow(/Slot not found/);
  });

  test('addSlot rejects duplicate id', () => {
    service.addSlot(makeSlot('a'));
    expect(() => service.addSlot(makeSlot('a'))).toThrow(/already exists/);
  });
});
