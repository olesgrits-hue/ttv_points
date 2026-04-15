jest.mock('electron', () => ({
  BrowserWindow: { getAllWindows: jest.fn().mockReturnValue([]) },
}));
jest.mock('keytar', () => ({
  setPassword: jest.fn().mockResolvedValue(undefined),
  getPassword: jest.fn().mockResolvedValue('mock-token'),
  deletePassword: jest.fn().mockResolvedValue(true),
}));

import { Dispatcher, registerActionHandlers } from '../../../src/main/queue/dispatcher';
import { RedemptionEvent } from '../../../src/main/queue/types';

const mockRedemption: RedemptionEvent = {
  id: 'r1',
  rewardId: 'reward-x',
  rewardTitle: 'My Reward',
  userLogin: 'user1',
  userDisplayName: 'User1',
  redeemedAt: new Date().toISOString(),
};

function makeConfigStore(slots: unknown[] = []) {
  return { getSlots: jest.fn(() => slots) } as unknown as import('../../../src/main/store/config').ConfigStore;
}

function makeApi() {
  return {
    cancelRedemption: jest.fn().mockResolvedValue(undefined),
    fulfillRedemption: jest.fn().mockResolvedValue(undefined),
  } as unknown as import('../../../src/main/twitch/api').TwitchApiClient;
}

describe('Dispatcher', () => {
  beforeEach(() => {
    // Register stub handlers for each test.
    registerActionHandlers(
      jest.fn().mockResolvedValue(undefined),
      jest.fn().mockResolvedValue(undefined),
    );
  });

  afterEach(() => jest.restoreAllMocks());

  test('slot_not_found_triggers_cancel', async () => {
    const api = makeApi();
    const dispatcher = new Dispatcher(makeConfigStore([]), api);

    await dispatcher.dispatch(mockRedemption);

    expect(api.cancelRedemption).toHaveBeenCalledWith('reward-x', 'r1');
  });

  test('disabled_slot_triggers_cancel_and_no_action_handler', async () => {
    const slot = {
      id: 'slot-1',
      type: 'mask',
      enabled: false,
      rewardId: 'reward-x',
      rewardTitle: 'My Reward',
    };
    const maskHandler = jest.fn().mockResolvedValue(undefined);
    const mediaHandler = jest.fn().mockResolvedValue(undefined);
    registerActionHandlers(maskHandler, mediaHandler);

    const api = makeApi();
    const dispatcher = new Dispatcher(makeConfigStore([slot]), api);

    await dispatcher.dispatch(mockRedemption);

    // Must cancel the redemption.
    expect(api.cancelRedemption).toHaveBeenCalledWith('reward-x', 'r1');
    // Must NOT invoke any action handler — slot is disabled.
    expect(maskHandler).not.toHaveBeenCalled();
    expect(mediaHandler).not.toHaveBeenCalled();
  });

  test('enabled_slot_routes_to_handler', async () => {
    const slot = {
      id: 'slot-1',
      type: 'mask',
      enabled: true,
      rewardId: 'reward-x',
      rewardTitle: 'My Reward',
      lensId: 'l1',
      lensName: 'Lens',
      hotkey: 'ctrl+1',
    };
    const maskHandler = jest.fn().mockResolvedValue(undefined);
    registerActionHandlers(maskHandler, jest.fn().mockResolvedValue(undefined));

    const api = makeApi();
    const dispatcher = new Dispatcher(makeConfigStore([slot]), api);

    await dispatcher.dispatch(mockRedemption);

    expect(maskHandler).toHaveBeenCalled();
    expect(api.cancelRedemption).not.toHaveBeenCalled();
  });

  test('error_propagation', async () => {
    const slot = {
      id: 'slot-1',
      type: 'mask',
      enabled: true,
      rewardId: 'reward-x',
      rewardTitle: 'My Reward',
      lensId: 'l1',
      lensName: 'Lens',
      hotkey: 'ctrl+1',
    };
    const maskHandler = jest.fn().mockRejectedValue(new Error('handler boom'));
    registerActionHandlers(maskHandler, jest.fn());

    const api = makeApi();
    const dispatcher = new Dispatcher(makeConfigStore([slot]), api);

    // Should NOT throw — errors are caught internally.
    await expect(dispatcher.dispatch(mockRedemption)).resolves.toBeUndefined();
    expect(api.cancelRedemption).toHaveBeenCalled();
  });
});
