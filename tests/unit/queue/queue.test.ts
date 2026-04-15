jest.mock('electron', () => ({
  BrowserWindow: { getAllWindows: jest.fn().mockReturnValue([]) },
}));
jest.mock('keytar', () => ({
  setPassword: jest.fn().mockResolvedValue(undefined),
  getPassword: jest.fn().mockResolvedValue('mock-token'),
  deletePassword: jest.fn().mockResolvedValue(true),
}));

import { EventEmitter } from 'events';
import { Queue } from '../../../src/main/queue/index';
import { registerActionHandlers } from '../../../src/main/queue/dispatcher';
import { RedemptionEvent } from '../../../src/main/queue/types';

function makeRedemption(id: string, rewardId = 'reward-1'): RedemptionEvent {
  return {
    id,
    rewardId,
    rewardTitle: 'Test',
    userLogin: 'user',
    userDisplayName: 'User',
    redeemedAt: new Date().toISOString(),
  };
}

function makeConfigStore(slotCount = 1) {
  return {
    getSlots: jest.fn(() => Array.from({ length: slotCount }, (_, i) => ({
      id: `slot-${i}`,
      type: 'mask',
      enabled: true,
      rewardId: 'reward-1',
      rewardTitle: 'Test',
      lensId: 'l',
      lensName: 'L',
      hotkey: 'ctrl+1',
    }))),
  } as unknown as import('../../../src/main/store/config').ConfigStore;
}

function makeApi() {
  return {
    cancelRedemption: jest.fn().mockResolvedValue(undefined),
    fulfillRedemption: jest.fn().mockResolvedValue(undefined),
  } as unknown as import('../../../src/main/twitch/api').TwitchApiClient;
}

class MockTwitchClient extends EventEmitter {
  api = makeApi();
}

describe('Queue', () => {
  beforeEach(() => {
    // Register handlers that succeed.
    registerActionHandlers(
      jest.fn().mockResolvedValue(undefined),
      jest.fn().mockResolvedValue(undefined),
    );
  });

  afterEach(() => jest.restoreAllMocks());

  test('fifo_order', async () => {
    const order: string[] = [];
    registerActionHandlers(
      jest.fn().mockImplementation(async (_slot, redemption: RedemptionEvent) => {
        order.push(redemption.id);
      }),
      jest.fn(),
    );

    const mockClient = new MockTwitchClient();
    const queue = new Queue(makeConfigStore(1), mockClient as never, mockClient.api);

    queue.enqueue(makeRedemption('A'));
    queue.enqueue(makeRedemption('B'));
    queue.enqueue(makeRedemption('C'));

    // Wait for all items to process.
    await new Promise<void>((resolve) => {
      const check = (): void => {
        if (queue.size() === 0) {
          // Give one more tick for the last item's async to complete.
          Promise.resolve().then(resolve);
        } else {
          setTimeout(check, 10);
        }
      };
      setTimeout(check, 10);
    });

    expect(order).toEqual(['A', 'B', 'C']);
  });

  test('max_5_slots_rejected', async () => {
    // When the configured slot count is already at max (5), enqueue should cancel.
    const api = makeApi();
    const mockClient = new MockTwitchClient();
    mockClient.api = api;

    // 5 slots already configured.
    const configStore = makeConfigStore(5);
    const queue = new Queue(configStore, mockClient as never, api);

    const handlerSpy = jest.fn().mockResolvedValue(undefined);
    registerActionHandlers(handlerSpy, jest.fn());

    queue.enqueue(makeRedemption('over-limit'));

    await new Promise<void>((r) => setTimeout(r, 50));

    // The dispatcher should have been called but with __max_slots_exceeded__ rewardId
    // which triggers cancel (slot not found path).
    expect(api.cancelRedemption).toHaveBeenCalled();
    // The real handler should NOT have been called.
    expect(handlerSpy).not.toHaveBeenCalled();
  });

  test('pause_resume_preserves_items', async () => {
    const processed: string[] = [];
    registerActionHandlers(
      jest.fn().mockImplementation(async (_slot, redemption: RedemptionEvent) => {
        processed.push(redemption.id);
      }),
      jest.fn(),
    );

    const mockClient = new MockTwitchClient();
    const queue = new Queue(makeConfigStore(1), mockClient as never, mockClient.api);

    queue.pause();
    queue.enqueue(makeRedemption('X'));
    queue.enqueue(makeRedemption('Y'));
    queue.enqueue(makeRedemption('Z'));

    expect(queue.size()).toBe(3);
    expect(processed).toHaveLength(0);

    queue.resume();

    // Wait for processing.
    await new Promise<void>((resolve) => {
      const check = (): void => {
        if (queue.size() === 0 && processed.length === 3) {
          Promise.resolve().then(resolve);
        } else {
          setTimeout(check, 10);
        }
      };
      setTimeout(check, 10);
    });

    expect(processed).toEqual(['X', 'Y', 'Z']);
  });

  test('disconnected_event_pauses_queue', () => {
    const mockClient = new MockTwitchClient();
    const queue = new Queue(makeConfigStore(1), mockClient as never, mockClient.api);

    mockClient.emit('disconnected');

    // After disconnect, size should reflect paused state on new enqueue.
    queue.enqueue(makeRedemption('D'));
    expect(queue.size()).toBe(1); // item queued but not dequeued yet
  });

  test('connected_event_resumes_queue', async () => {
    const processed: string[] = [];
    registerActionHandlers(
      jest.fn().mockImplementation(async (_slot, r: RedemptionEvent) => { processed.push(r.id); }),
      jest.fn(),
    );

    const mockClient = new MockTwitchClient();
    const queue = new Queue(makeConfigStore(1), mockClient as never, mockClient.api);

    mockClient.emit('disconnected');
    queue.enqueue(makeRedemption('R1'));
    expect(queue.size()).toBe(1);

    mockClient.emit('connected');

    await new Promise<void>((resolve) => {
      const check = (): void => {
        if (processed.length >= 1) Promise.resolve().then(resolve);
        else setTimeout(check, 10);
      };
      setTimeout(check, 10);
    });

    expect(processed).toContain('R1');
  });
});
