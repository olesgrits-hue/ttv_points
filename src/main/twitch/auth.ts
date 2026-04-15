import * as http from 'http';
import { randomBytes } from 'crypto';
import { shell } from 'electron';
import pkceChallenge from 'pkce-challenge';
import { AuthStore } from '../store/auth';
import { ConfigStore } from '../store/config';

const TWITCH_AUTH_BASE = 'https://id.twitch.tv/oauth2';
const TWITCH_API_BASE = 'https://api.twitch.tv/helix';
const CLIENT_ID = process.env.TWITCH_CLIENT_ID ?? '';
const SCOPES = 'channel:read:redemptions channel:manage:redemptions';
const LOGIN_TIMEOUT_MS = 5 * 60 * 1_000; // 5 minutes

export interface Tokens {
  accessToken: string;
  refreshToken: string;
  expiresIn: number; // seconds
}

interface TokenResponse {
  access_token: string;
  refresh_token: string;
  expires_in: number;
}

interface TwitchUser {
  id: string;
  login: string;
}

/**
 * TwitchAuth handles OAuth 2.0 Authorization Code + PKCE flow.
 * Uses pkce-challenge for verifier/challenge generation.
 */
export class TwitchAuth {
  constructor(
    private readonly authStore: AuthStore,
    private readonly configStore: ConfigStore,
  ) {}

  /**
   * Start login: spin up a local callback server on an OS-assigned port,
   * open the browser at the Twitch auth URL, then wait for the code.
   * Saves tokens and user metadata on success.
   */
  async startLogin(): Promise<void> {
    // Dev fast-path: skip PKCE when token is pre-injected via env.
    const devToken = process.env.TWITCH_HELPER_ACCESS_TOKEN;
    if (devToken) {
      await this.authStore.saveTokens(devToken, '');
      return;
    }

    const { code_verifier, code_challenge } = await pkceChallenge();
    const state = randomBytes(16).toString('hex');

    const { port, code } = await this._waitForCallback(
      code_verifier,
      code_challenge,
      state,
    );

    const tokens = await this._exchangeCode(code, port, code_verifier);
    await this._saveTokens(tokens, port);
  }

  /**
   * Refresh the stored refresh token. Returns new tokens on success.
   * On 400/401, deletes stored tokens and throws.
   */
  async refreshToken(refreshToken: string): Promise<Tokens> {
    const res = await fetch(`${TWITCH_AUTH_BASE}/token`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({
        client_id: CLIENT_ID,
        grant_type: 'refresh_token',
        refresh_token: refreshToken,
      }).toString(),
    });

    if (res.status === 400 || res.status === 401) {
      await this.authStore.deleteTokens();
      throw Object.assign(new Error('Refresh token invalid or expired'), { status: res.status });
    }

    if (!res.ok) {
      throw new Error(`Token refresh failed with status ${res.status}`);
    }

    const body = (await res.json()) as TokenResponse;
    const tokens: Tokens = {
      accessToken: body.access_token,
      refreshToken: body.refresh_token,
      expiresIn: body.expires_in,
    };

    await this.authStore.saveTokens(tokens.accessToken, tokens.refreshToken);
    const expiresAt = new Date(Date.now() + body.expires_in * 1_000).toISOString();
    const cfg = this.configStore.read();
    this.configStore.write({ ...cfg, tokenExpiresAt: expiresAt });

    return tokens;
  }

  // ---- Private helpers -------------------------------------------------------

  private _waitForCallback(
    code_verifier: string,
    code_challenge: string,
    state: string,
  ): Promise<{ port: number; code: string }> {
    return new Promise((resolve, reject) => {
      const server = http.createServer((req, res) => {
        const url = new URL(req.url ?? '/', `http://localhost`);
        if (url.pathname !== '/callback') {
          res.writeHead(404).end();
          return;
        }

        const returnedState = url.searchParams.get('state');
        const code = url.searchParams.get('code');
        const error = url.searchParams.get('error');

        res.writeHead(200, { 'Content-Type': 'text/html' }).end(
          '<html><body>Authorization complete — you can close this tab.</body></html>',
        );
        server.close();
        clearTimeout(timeoutHandle);

        if (error) {
          reject(new Error(`Twitch auth error: ${error}`));
          return;
        }
        if (returnedState !== state) {
          reject(new Error('OAuth state mismatch (CSRF check failed)'));
          return;
        }
        if (!code) {
          reject(new Error('No code in callback'));
          return;
        }

        const addr = server.address();
        const port = typeof addr === 'object' && addr ? addr.port : 0;
        resolve({ port, code });
      });

      server.listen(0, '127.0.0.1', () => {
        const addr = server.address();
        const port = typeof addr === 'object' && addr ? addr.port : 0;
        const redirectUri = `http://localhost:${port}/callback`;

        const authUrl = new URL(`${TWITCH_AUTH_BASE}/authorize`);
        authUrl.searchParams.set('client_id', CLIENT_ID);
        authUrl.searchParams.set('redirect_uri', redirectUri);
        authUrl.searchParams.set('response_type', 'code');
        authUrl.searchParams.set('scope', SCOPES);
        authUrl.searchParams.set('state', state);
        authUrl.searchParams.set('code_challenge', code_challenge);
        authUrl.searchParams.set('code_challenge_method', 'S256');

        shell.openExternal(authUrl.toString()).catch(reject);
      });

      const timeoutHandle = setTimeout(() => {
        server.close();
        reject(new Error('Login timed out'));
      }, LOGIN_TIMEOUT_MS);
    });
  }

  private async _exchangeCode(code: string, port: number, verifier: string): Promise<Tokens> {
    const redirectUri = `http://localhost:${port}/callback`;
    const res = await fetch(`${TWITCH_AUTH_BASE}/token`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({
        client_id: CLIENT_ID,
        code,
        code_verifier: verifier,
        grant_type: 'authorization_code',
        redirect_uri: redirectUri,
      }).toString(),
    });

    if (!res.ok) {
      throw new Error(`Token exchange failed: HTTP ${res.status}`);
    }

    const body = (await res.json()) as TokenResponse;
    return {
      accessToken: body.access_token,
      refreshToken: body.refresh_token,
      expiresIn: body.expires_in,
    };
  }

  private async _saveTokens(tokens: Tokens, port: number): Promise<void> {
    await this.authStore.saveTokens(tokens.accessToken, tokens.refreshToken);

    // Fetch user metadata.
    const userRes = await fetch(`${TWITCH_API_BASE}/users`, {
      headers: {
        Authorization: `Bearer ${tokens.accessToken}`,
        'Client-Id': CLIENT_ID,
      },
    });

    const expiresAt = new Date(Date.now() + tokens.expiresIn * 1_000).toISOString();
    const cfg = this.configStore.read();
    const update = { ...cfg, tokenExpiresAt: expiresAt };

    if (userRes.ok) {
      const body = (await userRes.json()) as { data: TwitchUser[] };
      const user = body.data?.[0];
      if (user) {
        update.userId = user.id;
        update.broadcasterId = user.id;
      }
    }

    this.configStore.write(update);
    void port; // used in redirect_uri already
  }
}
