jest.mock('electron', () => ({
  BrowserWindow: { getAllWindows: jest.fn().mockReturnValue([]) },
}));

jest.mock('keytar', () => ({
  setPassword: jest.fn().mockResolvedValue(undefined),
  getPassword: jest.fn().mockResolvedValue('mock-token'),
  deletePassword: jest.fn().mockResolvedValue(true),
}));

// Mock robotjs — native module; not available in test environment.
jest.mock('robotjs', () => ({
  keyTap: jest.fn(),
}));

import * as os from 'os';
import * as fs from 'fs';
import * as path from 'path';
import { MaskAction } from '../../src/main/actions/mask';
import { ConfigStore } from '../../src/main/store/config';
import { TwitchApiClient } from '../../src/main/twitch/api';
import { MaskSlot } from '../../src/main/store/types';
import { RedemptionEvent } from '../../src/main/queue/types';

function mkTempDir(): string {
  return fs.mkdtempSync(path.join(os.tmpdir(), 'tw-mask-'));
}

function cleanup(dir: string): void {
  try { fs.rmSync(dir, { recursive: true, force: true }); } catch {/**/}
}

const mockRedemption: RedemptionEvent = {
  id: 'redemption-1',
  rewardId: 'reward-1',
  rewardTitle: 'Test Reward',
  userLogin: 'testuser',
  userDisplayName: 'TestUser',
  redeemedAt: new Date().toISOString(),
};

const mockSlot: MaskSlot = {
  id: 'slot-1',
  type: 'mask',
  enabled: true,
  rewardId: 'reward-1',
  rewardTitle: 'Test Reward',
  lensId: 'lens-1',
  lensName: 'Test Lens',
  hotkey: 'ctrl+shift+1',
};

describe('MaskAction', () => {
  let dir: string;
  let configStore: ConfigStore;
  let mockTwitchApi: jest.Mocked<TwitchApiClient>;
  let action: MaskAction;
  let robotMock: { keyTap: jest.Mock };

  beforeEach(() => {
    jest.useFakeTimers();
    dir = mkTempDir();
    configStore = new ConfigStore({ dir });
    configStore.write({ slots: [], removeMaskHotkey: 'ctrl+shift+0' });

    mockTwitchApi = {
      fulfillRedemption: jest.fn().mockResolvedValue(undefined),
      cancelRedemption: jest.fn().mockResolvedValue(undefined),
    } as unknown as jest.Mocked<TwitchApiClient>;

    action = new MaskAction(configStore, mockTwitchApi);
    robotMock = require('robotjs') as { keyTap: jest.Mock };
    robotMock.keyTap.mockClear();
  });

  afterEach(() => {
    cleanup(dir);
    jest.useRealTimers();
    jest.restoreAllMocks();
  });

  test('full_sequence_with_fake_timers', async () => {
    const executePromise = action.execute(mockSlot, mockRedemption);

    // (a) Apply hotkey must fire IMMEDIATELY — before any timer advance.
    expect(robotMock.keyTap).toHaveBeenCalledTimes(1);
    expect(robotMock.keyTap).toHaveBeenCalledWith('1', ['control', 'shift']);
    // fulfillRedemption must NOT have been called yet (mask still active).
    expect(mockTwitchApi.fulfillRedemption).not.toHaveBeenCalled();

    // (b) Advance 30 seconds — triggers remove-mask + fulfill.
    jest.advanceTimersByTime(30_000);

    await executePromise;

    // (c) Remove mask hotkey (ctrl+shift+0) must have fired AFTER the advance.
    expect(robotMock.keyTap).toHaveBeenCalledTimes(2);
    // Verify call ORDER: first call = apply (index 0), second call = remove (index 1).
    expect(robotMock.keyTap.mock.calls[0]).toEqual(['1', ['control', 'shift']]);
    expect(robotMock.keyTap.mock.calls[1]).toEqual(['0', ['control', 'shift']]);
    // fulfillRedemption called exactly once after the sequence.
    expect(mockTwitchApi.fulfillRedemption).toHaveBeenCalledTimes(1);
    expect(mockTwitchApi.fulfillRedemption).toHaveBeenCalledWith('reward-1', 'redemption-1');
    expect(mockTwitchApi.cancelRedemption).not.toHaveBeenCalled();
  });

  test('cancel_on_robotjs_error', async () => {
    robotMock.keyTap.mockImplementationOnce(() => {
      throw new Error('robotjs error');
    });

    await action.execute(mockSlot, mockRedemption);

    expect(mockTwitchApi.cancelRedemption).toHaveBeenCalledWith('reward-1', 'redemption-1');
    expect(mockTwitchApi.fulfillRedemption).not.toHaveBeenCalled();
  });

  test('skips_remove_mask_when_hotkey_empty', async () => {
    configStore.write({ slots: [], removeMaskHotkey: '' });

    const executePromise = action.execute(mockSlot, mockRedemption);
    jest.advanceTimersByTime(30_000);
    await executePromise;

    // Only the apply hotkey should have fired.
    expect(robotMock.keyTap).toHaveBeenCalledTimes(1);
    expect(mockTwitchApi.fulfillRedemption).toHaveBeenCalled();
  });
});
