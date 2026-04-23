import { Config } from './types';

export const KEYTAR_SERVICE = 'ttweaks';
export const KEYTAR_ACCOUNT_ACCESS = 'access_token';
export const KEYTAR_ACCOUNT_REFRESH = 'refresh_token';
export const KEYTAR_ACCOUNT_YAM = 'yandex_token';
export const DEV_ENV_VAR = 'TWITCH_HELPER_ACCESS_TOKEN';

export interface Tokens {
  accessToken: string;
  refreshToken: string;
}

// Minimal surface of keytar we depend on — lets us inject a stub in tests
// and isolates us from the archived upstream API surface.
export interface KeytarLike {
  setPassword(service: string, account: string, password: string): Promise<void>;
  getPassword(service: string, account: string): Promise<string | null>;
  deletePassword(service: string, account: string): Promise<boolean>;
}

/**
 * Lazily require keytar so unit tests (and dev environments without the native
 * binary) do not crash at import time. Returns null when the module is not
 * available — callers then fall back to the dev env var or no-op.
 */
export function loadKeytar(): KeytarLike | null {
  try {
    // eslint-disable-next-line @typescript-eslint/no-var-requires, @typescript-eslint/no-require-imports
    const mod = require('keytar') as KeytarLike;
    return mod;
  } catch {
    return null;
  }
}

export class AuthStore {
  private readonly keytar: KeytarLike | null;
  private readonly isDev: boolean;

  constructor(options: { keytar?: KeytarLike | null; isDev?: boolean } = {}) {
    this.keytar =
      options.keytar !== undefined ? options.keytar : loadKeytar();
    this.isDev = options.isDev ?? !isProductionEnv();
  }

  async saveTokens(accessToken: string, refreshToken: string): Promise<void> {
    if (!this.keytar) {
      // In dev we allow running without keytar; in prod we refuse silently-
      // storing tokens would violate Decision 4. Surface the error so caller
      // can decide (e.g., show "Credential Manager unavailable" to user).
      throw new Error('keytar unavailable — cannot persist tokens securely');
    }
    await this.keytar.setPassword(KEYTAR_SERVICE, KEYTAR_ACCOUNT_ACCESS, accessToken);
    await this.keytar.setPassword(KEYTAR_SERVICE, KEYTAR_ACCOUNT_REFRESH, refreshToken);
  }

  async getTokens(): Promise<Tokens | null> {
    if (this.keytar) {
      try {
        const accessToken = await this.keytar.getPassword(
          KEYTAR_SERVICE,
          KEYTAR_ACCOUNT_ACCESS,
        );
        const refreshToken = await this.keytar.getPassword(
          KEYTAR_SERVICE,
          KEYTAR_ACCOUNT_REFRESH,
        );
        if (accessToken && refreshToken) {
          return { accessToken, refreshToken };
        }
        // Dev fallback only applies when nothing is stored yet.
      } catch {
        // keytar can throw if Credential Manager is unreachable. Fall through
        // to the dev env var so a developer can still run the app.
      }
    }

    if (this.isDev) {
      const envToken = process.env[DEV_ENV_VAR];
      if (envToken && envToken.length > 0) {
        return { accessToken: envToken, refreshToken: '' };
      }
    }

    return null;
  }

  async saveYamToken(token: string): Promise<void> {
    if (!this.keytar) throw new Error('keytar unavailable — cannot persist Yandex token');
    await this.keytar.setPassword(KEYTAR_SERVICE, KEYTAR_ACCOUNT_YAM, token);
  }

  async getYamToken(): Promise<string | null> {
    if (!this.keytar) return null;
    try {
      return await this.keytar.getPassword(KEYTAR_SERVICE, KEYTAR_ACCOUNT_YAM);
    } catch {
      return null;
    }
  }

  async deleteYamToken(): Promise<void> {
    if (!this.keytar) return;
    try {
      await this.keytar.deletePassword(KEYTAR_SERVICE, KEYTAR_ACCOUNT_YAM);
    } catch { /* best-effort */ }
  }

  async deleteTokens(): Promise<void> {
    if (!this.keytar) return;
    try {
      await this.keytar.deletePassword(KEYTAR_SERVICE, KEYTAR_ACCOUNT_ACCESS);
    } catch {
      /* best-effort — token may not exist */
    }
    try {
      await this.keytar.deletePassword(KEYTAR_SERVICE, KEYTAR_ACCOUNT_REFRESH);
    } catch {
      /* best-effort */
    }
  }

  /**
   * Treats a missing/invalid tokenExpiresAt as expired — forces re-auth rather
   * than letting an unknown-state token hit Twitch and fail at runtime.
   */
  isTokenExpired(config: Pick<Config, 'tokenExpiresAt'>): boolean {
    const iso = config.tokenExpiresAt;
    if (!iso) return true;
    const expiresMs = Date.parse(iso);
    if (Number.isNaN(expiresMs)) return true;
    return expiresMs <= Date.now();
  }
}

function isProductionEnv(): boolean {
  return process.env.NODE_ENV === 'production';
}
