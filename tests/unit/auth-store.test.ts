import {
  AuthStore,
  KeytarLike,
  KEYTAR_SERVICE,
  KEYTAR_ACCOUNT_ACCESS,
  KEYTAR_ACCOUNT_REFRESH,
  DEV_ENV_VAR,
} from '../../src/main/store/auth';

function makeKeytarMock(): jest.Mocked<KeytarLike> {
  const store = new Map<string, string>();
  const key = (s: string, a: string) => `${s}:${a}`;
  return {
    setPassword: jest.fn(async (s: string, a: string, p: string) => {
      store.set(key(s, a), p);
    }),
    getPassword: jest.fn(async (s: string, a: string) => store.get(key(s, a)) ?? null),
    deletePassword: jest.fn(async (s: string, a: string) => store.delete(key(s, a))),
  } as unknown as jest.Mocked<KeytarLike>;
}

describe('AuthStore', () => {
  test('save_and_read_tokens', async () => {
    const keytar = makeKeytarMock();
    const auth = new AuthStore({ keytar, isDev: false });

    await auth.saveTokens('access-xyz', 'refresh-abc');

    expect(keytar.setPassword).toHaveBeenCalledWith(
      KEYTAR_SERVICE,
      KEYTAR_ACCOUNT_ACCESS,
      'access-xyz',
    );
    expect(keytar.setPassword).toHaveBeenCalledWith(
      KEYTAR_SERVICE,
      KEYTAR_ACCOUNT_REFRESH,
      'refresh-abc',
    );

    const tokens = await auth.getTokens();
    expect(tokens).toEqual({ accessToken: 'access-xyz', refreshToken: 'refresh-abc' });
  });

  test('getTokens returns null when nothing saved and not dev', async () => {
    const keytar = makeKeytarMock();
    const auth = new AuthStore({ keytar, isDev: false });
    expect(await auth.getTokens()).toBeNull();
  });

  test('deleteTokens clears both accounts', async () => {
    const keytar = makeKeytarMock();
    const auth = new AuthStore({ keytar, isDev: false });
    await auth.saveTokens('a', 'b');
    await auth.deleteTokens();
    expect(keytar.deletePassword).toHaveBeenCalledWith(
      KEYTAR_SERVICE,
      KEYTAR_ACCOUNT_ACCESS,
    );
    expect(keytar.deletePassword).toHaveBeenCalledWith(
      KEYTAR_SERVICE,
      KEYTAR_ACCOUNT_REFRESH,
    );
    expect(await auth.getTokens()).toBeNull();
  });

  test('saveTokens throws when keytar unavailable', async () => {
    const auth = new AuthStore({ keytar: null, isDev: true });
    await expect(auth.saveTokens('a', 'b')).rejects.toThrow(/keytar unavailable/);
  });

  test('dev fallback reads TWITCH_HELPER_ACCESS_TOKEN env var', async () => {
    const prev = process.env[DEV_ENV_VAR];
    process.env[DEV_ENV_VAR] = 'dev-access-token';
    try {
      const auth = new AuthStore({ keytar: null, isDev: true });
      const tokens = await auth.getTokens();
      expect(tokens).toEqual({ accessToken: 'dev-access-token', refreshToken: '' });
    } finally {
      if (prev === undefined) delete process.env[DEV_ENV_VAR];
      else process.env[DEV_ENV_VAR] = prev;
    }
  });

  test('dev fallback ignored when isDev=false', async () => {
    const prev = process.env[DEV_ENV_VAR];
    process.env[DEV_ENV_VAR] = 'should-be-ignored';
    try {
      const auth = new AuthStore({ keytar: null, isDev: false });
      expect(await auth.getTokens()).toBeNull();
    } finally {
      if (prev === undefined) delete process.env[DEV_ENV_VAR];
      else process.env[DEV_ENV_VAR] = prev;
    }
  });

  test('getTokens falls back to env when keytar throws', async () => {
    const keytar: KeytarLike = {
      setPassword: jest.fn(),
      getPassword: jest.fn(async () => {
        throw new Error('Credential Manager unreachable');
      }),
      deletePassword: jest.fn(async () => true),
    };
    const prev = process.env[DEV_ENV_VAR];
    process.env[DEV_ENV_VAR] = 'fallback-token';
    try {
      const auth = new AuthStore({ keytar, isDev: true });
      const tokens = await auth.getTokens();
      expect(tokens).toEqual({ accessToken: 'fallback-token', refreshToken: '' });
    } finally {
      if (prev === undefined) delete process.env[DEV_ENV_VAR];
      else process.env[DEV_ENV_VAR] = prev;
    }
  });

  test('expired_token_detected', () => {
    const auth = new AuthStore({ keytar: null, isDev: true });
    const past = new Date(Date.now() - 1000).toISOString();
    expect(auth.isTokenExpired({ tokenExpiresAt: past })).toBe(true);
  });

  test('fresh token not expired', () => {
    const auth = new AuthStore({ keytar: null, isDev: true });
    const future = new Date(Date.now() + 60_000).toISOString();
    expect(auth.isTokenExpired({ tokenExpiresAt: future })).toBe(false);
  });

  test('missing tokenExpiresAt treated as expired', () => {
    const auth = new AuthStore({ keytar: null, isDev: true });
    expect(auth.isTokenExpired({})).toBe(true);
    expect(auth.isTokenExpired({ tokenExpiresAt: 'not-a-date' })).toBe(true);
  });
});
