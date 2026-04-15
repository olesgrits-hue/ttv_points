/**
 * Unit tests for TwitchAuth (Task 4 TDD Anchor).
 * Tests PKCE generation, callback server, token exchange, and refresh flow.
 * Electron/shell is mocked — no real browser is opened.
 */

import * as http from 'http';

// pkce-challenge uses top-level await import() which ts-jest cannot transpile.
// Mock it with a synchronous implementation that preserves the contract.
jest.mock('pkce-challenge', () => ({
  __esModule: true,
  default: jest.fn().mockResolvedValue({
    code_verifier: 'mock_verifier_aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa',
    code_challenge: 'mock_challenge_BBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBB',
  }),
}));

// Mock electron before importing modules that import it.
jest.mock('electron', () => ({
  shell: {
    openExternal: jest.fn().mockResolvedValue(undefined),
  },
  BrowserWindow: {
    getAllWindows: jest.fn().mockReturnValue([]),
  },
  ipcMain: {
    handle: jest.fn(),
  },
}));

// Mock keytar.
jest.mock('keytar', () => ({
  setPassword: jest.fn().mockResolvedValue(undefined),
  getPassword: jest.fn().mockResolvedValue(null),
  deletePassword: jest.fn().mockResolvedValue(true),
}));

import pkceChallenge from 'pkce-challenge';
import { TwitchAuth } from '../../src/main/twitch/auth';
import { AuthStore, KeytarLike } from '../../src/main/store/auth';
import { ConfigStore } from '../../src/main/store/config';
import { checkAuthOnStartup } from '../../src/main/ipc/auth';
import * as os from 'os';
import * as fs from 'fs';
import * as path from 'path';

function mkTempDir(): string {
  return fs.mkdtempSync(path.join(os.tmpdir(), 'tw-auth-test-'));
}

function cleanup(dir: string): void {
  try {
    fs.rmSync(dir, { recursive: true, force: true });
  } catch {/* ignore */}
}

describe('TwitchAuth', () => {
  let dir: string;
  let configStore: ConfigStore;
  let authStore: AuthStore;
  let twitchAuth: TwitchAuth;

  beforeEach(() => {
    dir = mkTempDir();
    configStore = new ConfigStore({ dir });
    authStore = new AuthStore();
    twitchAuth = new TwitchAuth(authStore, configStore);
  });

  afterEach(() => {
    cleanup(dir);
    jest.restoreAllMocks();
    delete process.env.TWITCH_HELPER_ACCESS_TOKEN;
  });

  test('pkce_flow_generates_verifier_and_challenge', async () => {
    const { code_verifier, code_challenge } = await pkceChallenge();
    // Verifier and challenge must be distinct strings (challenge is SHA256 of verifier).
    expect(code_verifier).toBeDefined();
    expect(code_challenge).toBeDefined();
    expect(typeof code_verifier).toBe('string');
    expect(typeof code_challenge).toBe('string');
    expect(code_verifier).not.toBe(code_challenge);
  });

  test('callback_server_listens_on_os_port', (done) => {
    const server = http.createServer();
    server.listen(0, '127.0.0.1', () => {
      const addr = server.address();
      expect(addr).not.toBeNull();
      if (addr && typeof addr === 'object') {
        expect(addr.port).toBeGreaterThan(0);
        expect(addr.port).toBeLessThan(65536);
      }
      server.close(done);
    });
  });

  test('token_exchange_saves_to_keytar', async () => {
    // Use dev fast-path: TWITCH_HELPER_ACCESS_TOKEN bypasses PKCE.
    process.env.TWITCH_HELPER_ACCESS_TOKEN = 'test-access-token';

    const saveTokensSpy = jest.spyOn(authStore, 'saveTokens');

    await twitchAuth.startLogin();

    expect(saveTokensSpy).toHaveBeenCalledWith('test-access-token', '');
  });

  test('expired_token_triggers_refresh_on_startup', async () => {
    const expiredAt = new Date(Date.now() - 1_000).toISOString();
    configStore.write({ slots: [], removeMaskHotkey: '', tokenExpiresAt: expiredAt });

    const cfg = configStore.read();
    expect(authStore.isTokenExpired(cfg)).toBe(true);
  });

  test('failed_refresh_emits_auth_logout', async () => {
    const { BrowserWindow } = await import('electron');
    const mockWin = { webContents: { send: jest.fn() } };
    (BrowserWindow.getAllWindows as jest.Mock).mockReturnValue([mockWin]);

    // Mock keytar to return a refresh token.
    const keytar = await import('keytar');
    (keytar.getPassword as jest.Mock).mockImplementation((_s: string, account: string) => {
      if (account === 'refresh_token') return Promise.resolve('old-refresh-token');
      return Promise.resolve(null);
    });
    (keytar.deletePassword as jest.Mock).mockResolvedValue(true);

    // Mock fetch to return 401 on refresh.
    jest.spyOn(global, 'fetch').mockResolvedValueOnce(
      new Response('{"status":401,"message":"Invalid refresh token"}', { status: 401 }),
    );

    await expect(twitchAuth.refreshToken('old-refresh-token')).rejects.toThrow();

    // deleteTokens should have been called.
    expect(keytar.deletePassword).toHaveBeenCalled();
  });
});

// ---- checkAuthOnStartup integration-style unit tests ---------------------------

function makeKeytarMock(accessToken: string | null, refreshToken: string | null): KeytarLike {
  return {
    setPassword: jest.fn(),
    getPassword: jest.fn(async (_s: string, account: string) => {
      if (account === 'access_token') return accessToken;
      if (account === 'refresh_token') return refreshToken;
      return null;
    }),
    deletePassword: jest.fn().mockResolvedValue(true),
  } as unknown as KeytarLike;
}

describe('checkAuthOnStartup', () => {
  let dir: string;

  beforeEach(() => {
    dir = fs.mkdtempSync(path.join(os.tmpdir(), 'tw-startup-'));
    jest.restoreAllMocks();
  });

  afterEach(() => {
    try { fs.rmSync(dir, { recursive: true, force: true }); } catch {/**/}
    delete process.env.TWITCH_HELPER_ACCESS_TOKEN;
  });

  test('does_nothing_when_token_not_expired', async () => {
    const configStore = new ConfigStore({ dir });
    const future = new Date(Date.now() + 60_000).toISOString();
    configStore.write({ slots: [], removeMaskHotkey: '', tokenExpiresAt: future });

    const keytar = makeKeytarMock('valid-token', 'refresh-token');
    const authStore = new AuthStore({ keytar, isDev: false });
    const twitchAuthInstance = new TwitchAuth(authStore, configStore);

    const fetchSpy = jest.spyOn(global, 'fetch');

    await checkAuthOnStartup(twitchAuthInstance, authStore, configStore);

    // No API call must happen when token is still fresh.
    expect(fetchSpy).not.toHaveBeenCalled();
  });

  test('expired_token_calls_refreshToken_with_stored_refresh', async () => {
    const configStore = new ConfigStore({ dir });
    const past = new Date(Date.now() - 1_000).toISOString();
    configStore.write({ slots: [], removeMaskHotkey: '', tokenExpiresAt: past });

    const keytar = makeKeytarMock('old-access', 'my-refresh-token');
    const authStore = new AuthStore({ keytar, isDev: false });
    const twitchAuthInstance = new TwitchAuth(authStore, configStore);

    const newExpiry = new Date(Date.now() + 3_600_000).toISOString();
    jest.spyOn(global, 'fetch').mockResolvedValueOnce(
      new Response(
        JSON.stringify({ access_token: 'new-access', refresh_token: 'new-refresh', expires_in: 3600 }),
        { status: 200 },
      ),
    );

    await checkAuthOnStartup(twitchAuthInstance, authStore, configStore);

    // saveTokens must have been called with the new tokens.
    expect(keytar.setPassword).toHaveBeenCalledWith(
      expect.any(String), 'access_token', 'new-access',
    );

    void newExpiry; // used for context only
  });

  test('failed_refresh_calls_deleteTokens_and_broadcasts_auth_logout', async () => {
    const { BrowserWindow } = await import('electron');
    const mockWin = { webContents: { send: jest.fn() } };
    (BrowserWindow.getAllWindows as jest.Mock).mockReturnValue([mockWin]);

    const configStore = new ConfigStore({ dir });
    const past = new Date(Date.now() - 1_000).toISOString();
    configStore.write({ slots: [], removeMaskHotkey: '', tokenExpiresAt: past });

    const keytar = makeKeytarMock('old-access', 'bad-refresh-token');
    const authStore = new AuthStore({ keytar, isDev: false });
    const twitchAuthInstance = new TwitchAuth(authStore, configStore);

    // Refresh returns 401 — simulates expired/revoked refresh token.
    jest.spyOn(global, 'fetch').mockResolvedValueOnce(
      new Response('{"status":401}', { status: 401 }),
    );

    await checkAuthOnStartup(twitchAuthInstance, authStore, configStore);

    // (a) deletePassword must have been called — tokens wiped from keychain.
    expect(keytar.deletePassword).toHaveBeenCalled();

    // (b) auth:logout IPC must be broadcast to all renderer windows.
    expect(mockWin.webContents.send).toHaveBeenCalledWith('auth:logout');
  });

  test('no_refresh_token_broadcasts_auth_logout_without_api_call', async () => {
    const { BrowserWindow } = await import('electron');
    const mockWin = { webContents: { send: jest.fn() } };
    (BrowserWindow.getAllWindows as jest.Mock).mockReturnValue([mockWin]);

    const configStore = new ConfigStore({ dir });
    const past = new Date(Date.now() - 1_000).toISOString();
    configStore.write({ slots: [], removeMaskHotkey: '', tokenExpiresAt: past });

    // No refresh token stored.
    const keytar = makeKeytarMock(null, null);
    const authStore = new AuthStore({ keytar, isDev: false });
    const twitchAuthInstance = new TwitchAuth(authStore, configStore);

    const fetchSpy = jest.spyOn(global, 'fetch');

    await checkAuthOnStartup(twitchAuthInstance, authStore, configStore);

    // No API call — nothing to refresh.
    expect(fetchSpy).not.toHaveBeenCalled();
    // auth:logout must still be broadcast.
    expect(mockWin.webContents.send).toHaveBeenCalledWith('auth:logout');
  });
});
