/**
 * Unit tests for EventSubClient (Task 5 TDD Anchor).
 * Uses a mock WebSocket server to simulate Twitch EventSub messages.
 */

import { EventEmitter } from 'events';

// Mock electron before importing.
jest.mock('electron', () => ({
  BrowserWindow: { getAllWindows: jest.fn().mockReturnValue([]) },
  ipcMain: { handle: jest.fn() },
}));

// Mock keytar.
jest.mock('keytar', () => ({
  setPassword: jest.fn().mockResolvedValue(undefined),
  getPassword: jest.fn().mockResolvedValue('mock-access-token'),
  deletePassword: jest.fn().mockResolvedValue(true),
}));

// Mock ws — we control what the client receives.
let mockWsInstance: MockWs;

class MockWs extends EventEmitter {
  static lastUrl: string;
  url: string;
  readyState = 1;

  constructor(url: string) {
    super();
    this.url = url;
    MockWs.lastUrl = url;
    mockWsInstance = this;
    // Emit open synchronously in next microtask (unaffected by fake timers).
    Promise.resolve().then(() => this.emit('open'));
  }

  close(code?: number, reason?: string) {
    Promise.resolve().then(() => this.emit('close', code, reason));
  }

  send(_data: string) { /* no-op */ }
}

jest.mock('ws', () => MockWs);

import { EventSubClient } from '../../src/main/twitch/eventsub';
import { AuthStore } from '../../src/main/store/auth';
import { ConfigStore } from '../../src/main/store/config';
import * as os from 'os';
import * as fs from 'fs';
import * as path from 'path';

function mkTempDir(): string {
  return fs.mkdtempSync(path.join(os.tmpdir(), 'tw-eventsub-'));
}

function cleanup(dir: string): void {
  try { fs.rmSync(dir, { recursive: true, force: true }); } catch {/**/}
}

function makeWelcomeMsg(sessionId: string, keepaliveS = 10): string {
  return JSON.stringify({
    metadata: { message_type: 'session_welcome' },
    payload: { session: { id: sessionId, keepalive_timeout_seconds: keepaliveS } },
  });
}

function makeReconnectMsg(sessionId: string, reconnectUrl: string): string {
  return JSON.stringify({
    metadata: { message_type: 'session_reconnect' },
    payload: { session: { id: sessionId, reconnect_url: reconnectUrl } },
  });
}

function makeNotificationMsg(rewardId: string, rewardTitle: string): string {
  return JSON.stringify({
    metadata: { message_type: 'notification' },
    payload: {
      event: {
        id: 'evt-1',
        reward: { id: rewardId, title: rewardTitle },
        user_id: 'u1',
        user_name: 'User1',
        user_login: 'user1',
      },
    },
  });
}

/** Flush all pending microtasks (handles deeply nested async chains). */
async function flush(rounds = 20): Promise<void> {
  for (let i = 0; i < rounds; i++) await Promise.resolve();
}

describe('EventSubClient', () => {
  let dir: string;
  let configStore: ConfigStore;
  let authStore: AuthStore;
  let client: EventSubClient;

  beforeEach(() => {
    dir = mkTempDir();
    configStore = new ConfigStore({ dir });
    configStore.write({ slots: [], removeMaskHotkey: '', broadcasterId: 'b123' });
    authStore = new AuthStore();
    jest.useFakeTimers();
  });

  afterEach(async () => {
    client?.stop();
    cleanup(dir);
    jest.useRealTimers();
    jest.restoreAllMocks();
  });

  test('parses_session_welcome_and_subscribes', async () => {
    const fetchMock = jest.spyOn(global, 'fetch').mockResolvedValue(
      new Response('{}', { status: 200 }),
    );

    client = new EventSubClient(authStore, configStore);
    client.connect('ws://mock');

    // Wait for open.
    await flush();

    // Send welcome.
    mockWsInstance.emit('message', Buffer.from(makeWelcomeMsg('sess-abc')));

    // Wait for async subscribe.
    await flush();

    expect(fetchMock).toHaveBeenCalledWith(
      expect.stringContaining('eventsub/subscriptions'),
      expect.objectContaining({
        method: 'POST',
        body: expect.stringContaining('sess-abc'),
      }),
    );
  });

  test('reconnect_resubscribes_with_new_session_id', async () => {
    const fetchMock = jest.spyOn(global, 'fetch').mockResolvedValue(
      new Response('{}', { status: 200 }),
    );

    client = new EventSubClient(authStore, configStore);
    client.connect('ws://mock');

    await flush();

    // Welcome with first session — triggers subscribe(sess-1).
    mockWsInstance.emit('message', Buffer.from(makeWelcomeMsg('sess-1')));
    await flush();

    // Reconnect to a new URL — creates new MockWs, closes old one.
    mockWsInstance.emit('message', Buffer.from(makeReconnectMsg('sess-2', 'ws://new-endpoint')));
    await flush();

    // Welcome on new connection — triggers subscribe(sess-2).
    mockWsInstance.emit('message', Buffer.from(makeWelcomeMsg('sess-2')));
    await flush();

    // New WS should be at reconnect URL.
    expect(MockWs.lastUrl).toBe('ws://new-endpoint');

    // Last subscription call should use sess-2.
    const calls = fetchMock.mock.calls;
    const lastBody = calls[calls.length - 1]?.[1]?.body as string;
    expect(lastBody).toContain('sess-2');
  });

  test('keepalive_watchdog_reconnects_after_60s', async () => {
    jest.spyOn(global, 'fetch').mockResolvedValue(new Response('{}', { status: 200 }));

    client = new EventSubClient(authStore, configStore);
    const disconnectPromise = new Promise<void>((resolve) => client.once('disconnected', resolve));

    client.connect('ws://mock');
    await flush();

    // Capture the original WS instance BEFORE the watchdog fires.
    const originalWs = mockWsInstance;
    const closeSpy = jest.spyOn(originalWs, 'close');

    // Welcome with 10s keepalive (watchdog = 10+5 = 15s).
    originalWs.emit('message', Buffer.from(makeWelcomeMsg('sess-1', 10)));
    await flush();

    // Advance past watchdog window.
    jest.advanceTimersByTime(16_000);

    // Flush microtasks for MockWs.close() → emit('close').
    await flush();

    // (a) ws.close() must have been called — watchdog fired.
    expect(closeSpy).toHaveBeenCalled();

    // disconnected event must have been emitted.
    await disconnectPromise;

    // Flush the 3s reconnect delay timer.
    jest.advanceTimersByTime(3_100);
    await flush();

    // (b) A new WS connection must have been opened (mockWsInstance replaced).
    expect(mockWsInstance).not.toBe(originalWs);
  });

  test('notification_emits_redemption_event', async () => {
    jest.spyOn(global, 'fetch').mockResolvedValue(new Response('{}', { status: 200 }));

    client = new EventSubClient(authStore, configStore);
    const redemptions: unknown[] = [];
    client.on('redemption', (ev) => redemptions.push(ev));

    client.connect('ws://mock');
    await flush();
    mockWsInstance.emit('message', Buffer.from(makeWelcomeMsg('sess-1')));
    await Promise.resolve();

    mockWsInstance.emit('message', Buffer.from(makeNotificationMsg('reward-x', 'My Reward')));

    expect(redemptions).toHaveLength(1);
    expect(redemptions[0]).toMatchObject({ rewardId: 'reward-x', rewardTitle: 'My Reward' });
  });

  test('401_triggers_auth_error_event', async () => {
    jest.spyOn(global, 'fetch').mockResolvedValue(new Response('', { status: 401 }));

    client = new EventSubClient(authStore, configStore);
    const authErrorPromise = new Promise<unknown>((resolve) => client.once('auth_error', resolve));

    client.connect('ws://mock');
    await flush();
    mockWsInstance.emit('message', Buffer.from(makeWelcomeMsg('sess-1')));
    await flush();

    await authErrorPromise;
  });
});
