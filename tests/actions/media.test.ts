jest.mock('electron', () => ({
  BrowserWindow: { getAllWindows: jest.fn().mockReturnValue([]) },
  ipcMain: { handle: jest.fn() },
}));
jest.mock('keytar', () => ({
  setPassword: jest.fn().mockResolvedValue(undefined),
  getPassword: jest.fn().mockResolvedValue('mock-token'),
  deletePassword: jest.fn().mockResolvedValue(true),
}));

import * as os from 'os';
import * as fs from 'fs';
import * as path from 'path';
import { MediaAction } from '../../src/main/actions/media';
import { MediaSlot, MemeSlot } from '../../src/main/store/types';
import { RedemptionEvent } from '../../src/main/queue/types';

function mkTempDir(): string {
  return fs.mkdtempSync(path.join(os.tmpdir(), 'tw-media-'));
}
function cleanup(dir: string): void {
  try { fs.rmSync(dir, { recursive: true, force: true }); } catch {/**/}
}

const mockRedemption: RedemptionEvent = {
  id: 'redemption-1',
  rewardId: 'reward-1',
  rewardTitle: 'Media Reward',
  userLogin: 'user1',
  userDisplayName: 'User1',
  redeemedAt: new Date().toISOString(),
};

function makeOverlayServer(registeredId = 'uuid-1') {
  return {
    registry: {
      register: jest.fn().mockReturnValue(registeredId),
      deregister: jest.fn(),
    },
    play: jest.fn().mockResolvedValue(undefined),
  } as unknown as import('../../src/main/overlay/server').OverlayServer;
}

function makeApi() {
  return {
    fulfillRedemption: jest.fn().mockResolvedValue(undefined),
    cancelRedemption: jest.fn().mockResolvedValue(undefined),
  } as unknown as import('../../src/main/twitch/api').TwitchApiClient;
}

describe('MediaAction', () => {
  let dir: string;

  beforeEach(() => {
    dir = mkTempDir();
  });

  afterEach(() => {
    cleanup(dir);
    jest.restoreAllMocks();
  });

  test('resolves specific media file path', async () => {
    const filePath = path.join(dir, 'video.mp4');
    fs.writeFileSync(filePath, 'fake-video');

    const slot: MediaSlot = {
      id: 's1', type: 'media', enabled: true,
      rewardId: 'reward-1', rewardTitle: 'Media Reward', filePath,
    };
    const overlayServer = makeOverlayServer();
    const api = makeApi();
    const action = new MediaAction(overlayServer, api);

    await action.execute(slot, mockRedemption);

    expect(overlayServer.registry.register).toHaveBeenCalledWith(filePath);
    expect(api.fulfillRedemption).toHaveBeenCalledWith('reward-1', 'redemption-1');
  });

  test('picks random file from non-empty meme folder', async () => {
    const files = ['a.mp4', 'b.mp4', 'c.mp4'].map((f) => {
      const p = path.join(dir, f);
      fs.writeFileSync(p, 'bytes');
      return p;
    });

    const slot: MemeSlot = {
      id: 's1', type: 'meme', enabled: true,
      rewardId: 'reward-1', rewardTitle: 'Meme Reward', folderPath: dir,
    };
    const overlayServer = makeOverlayServer();
    const api = makeApi();
    const action = new MediaAction(overlayServer, api);

    await action.execute(slot, mockRedemption);

    const registeredPath = (overlayServer.registry.register as jest.Mock).mock.calls[0][0];
    expect(files).toContain(registeredPath);
    expect(api.fulfillRedemption).toHaveBeenCalled();
  });

  test('empty meme folder triggers cancel and refund', async () => {
    const slot: MemeSlot = {
      id: 's1', type: 'meme', enabled: true,
      rewardId: 'reward-1', rewardTitle: 'Meme Reward', folderPath: dir,
    };
    const overlayServer = makeOverlayServer();
    const api = makeApi();
    const action = new MediaAction(overlayServer, api);

    await action.execute(slot, mockRedemption);

    expect(api.cancelRedemption).toHaveBeenCalledWith('reward-1', 'redemption-1');
    expect(api.fulfillRedemption).not.toHaveBeenCalled();
    expect(overlayServer.registry.register).not.toHaveBeenCalled();
  });

  test('missing meme folder triggers cancel and refund', async () => {
    const slot: MemeSlot = {
      id: 's1', type: 'meme', enabled: true,
      rewardId: 'reward-1', rewardTitle: 'Meme Reward',
      folderPath: path.join(dir, 'nonexistent'),
    };
    const overlayServer = makeOverlayServer();
    const api = makeApi();
    const action = new MediaAction(overlayServer, api);

    await action.execute(slot, mockRedemption);

    expect(api.cancelRedemption).toHaveBeenCalledWith('reward-1', 'redemption-1');
    expect(api.fulfillRedemption).not.toHaveBeenCalled();
  });

  test('120s timeout triggers fulfill when overlay WS disconnected', async () => {
    jest.useFakeTimers();

    const filePath = path.join(dir, 'video.mp4');
    fs.writeFileSync(filePath, 'bytes');

    // Mock fs.promises.access so it resolves synchronously (microtask),
    // avoiding real I/O that would complete outside the fake-timer context.
    jest.spyOn(fs.promises, 'access').mockResolvedValue(undefined);

    const slot: MediaSlot = {
      id: 's1', type: 'media', enabled: true,
      rewardId: 'reward-1', rewardTitle: 'Media Reward', filePath,
    };

    // Simulate overlay.play() timing out after 120s (like the real implementation).
    const overlayServer = makeOverlayServer();
    (overlayServer.play as jest.Mock).mockImplementation(
      () => new Promise<void>((resolve) => setTimeout(resolve, 120_000)),
    );
    const api = makeApi();
    const action = new MediaAction(overlayServer, api);

    const execPromise = action.execute(slot, mockRedemption);

    // Flush microtasks so resolveFilePath + registry.register + play() call complete.
    for (let i = 0; i < 20; i++) await Promise.resolve();

    jest.advanceTimersByTime(120_000);

    // Flush the now-resolved setTimeout microtask.
    for (let i = 0; i < 10; i++) await Promise.resolve();

    await execPromise;

    expect(api.fulfillRedemption).toHaveBeenCalledWith('reward-1', 'redemption-1');
    expect(overlayServer.registry.deregister).toHaveBeenCalledWith('uuid-1');

    jest.useRealTimers();
  });

  test('path traversal attempt is blocked', async () => {
    const maliciousPath = path.join(dir, '..', '..', 'etc', 'passwd');
    const slot: MediaSlot = {
      id: 's1', type: 'media', enabled: true,
      rewardId: 'reward-1', rewardTitle: 'Media Reward', filePath: maliciousPath,
    };
    const overlayServer = makeOverlayServer();
    const api = makeApi();
    const action = new MediaAction(overlayServer, api);

    await action.execute(slot, mockRedemption);

    expect(api.cancelRedemption).toHaveBeenCalledWith('reward-1', 'redemption-1');
    expect(overlayServer.registry.register).not.toHaveBeenCalled();
  });

  test('deregisters media after playback_ended', async () => {
    const filePath = path.join(dir, 'video.mp4');
    fs.writeFileSync(filePath, 'bytes');

    const slot: MediaSlot = {
      id: 's1', type: 'media', enabled: true,
      rewardId: 'reward-1', rewardTitle: 'Media Reward', filePath,
    };
    const overlayServer = makeOverlayServer('my-uuid');
    const api = makeApi();
    const action = new MediaAction(overlayServer, api);

    await action.execute(slot, mockRedemption);

    expect(overlayServer.registry.deregister).toHaveBeenCalledWith('my-uuid');
    expect(api.fulfillRedemption).toHaveBeenCalled();
  });
});
