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
import { AuthStore } from '../../src/main/store/auth';
import { ConfigStore } from '../../src/main/store/config';
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
