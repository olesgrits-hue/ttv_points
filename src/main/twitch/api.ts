import { ConfigStore } from '../store/config';
import { AuthStore } from '../store/auth';
import { TwitchAuth } from './auth';
import { BrowserWindow } from 'electron';
import { TWITCH_CLIENT_ID as BUNDLED_CLIENT_ID } from './twitch-creds';

const API_BASE = 'https://api.twitch.tv/helix';

export interface TwitchReward {
  id: string;
  title: string;
  cost: number;
  broadcaster_id: string;
}

export interface TwitchRedemption {
  id: string;
  reward_id: string;
  user_id: string;
  user_name: string;
  user_login: string;
  status: string;
}

type RedemptionStatus = 'FULFILLED' | 'CANCELED';

export class TwitchApiClient {
  constructor(
    private readonly configStore: ConfigStore,
    private readonly authStore: AuthStore,
    private readonly twitchAuth: TwitchAuth,
  ) {}

  async createReward(title: string, cost: number, cooldownSeconds: number): Promise<TwitchReward> {
    const cfg = this.configStore.read();
    const broadcasterId = cfg.broadcasterId ?? '';

    const res = await this._fetch(
      `${API_BASE}/channel_points/custom_rewards?broadcaster_id=${broadcasterId}`,
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          title,
          cost,
          ...(cooldownSeconds > 0
            ? { is_global_cooldown_enabled: true, global_cooldown_seconds: cooldownSeconds }
            : {}),
        }),
      },
    );

    if (res.status === 400) {
      const body = (await res.json()) as { message?: string };
      if (body.message?.includes('CREATE_CUSTOM_REWARD_DUPLICATE_REWARD')) {
        throw new Error(`A reward named "${title}" already exists`);
      }
      throw new Error(`createReward failed: ${body.message ?? res.status}`);
    }

    if (!res.ok) {
      throw new Error(`createReward failed: HTTP ${res.status}`);
    }

    const body = (await res.json()) as { data: TwitchReward[] };
    return body.data[0];
  }

  async listRewards(): Promise<TwitchReward[]> {
    const cfg = this.configStore.read();
    const broadcasterId = cfg.broadcasterId ?? '';

    const res = await this._fetch(
      `${API_BASE}/channel_points/custom_rewards?broadcaster_id=${broadcasterId}&only_manageable_rewards=true`,
    );

    if (!res.ok) {
      throw new Error(`listRewards failed: HTTP ${res.status}`);
    }

    const body = (await res.json()) as { data: TwitchReward[] };
    return body.data;
  }

  async deleteReward(rewardId: string): Promise<void> {
    const cfg = this.configStore.read();
    const broadcasterId = cfg.broadcasterId ?? '';

    const res = await this._fetch(
      `${API_BASE}/channel_points/custom_rewards?broadcaster_id=${broadcasterId}&id=${rewardId}`,
      { method: 'DELETE' },
    );

    if (res.status === 404) return; // already gone — treat as success
    if (!res.ok) {
      throw new Error(`deleteReward failed: HTTP ${res.status}`);
    }
  }

  async fulfillRedemption(rewardId: string, redemptionId: string): Promise<void> {
    await this._updateRedemption(rewardId, redemptionId, 'FULFILLED');
  }

  async cancelRedemption(rewardId: string, redemptionId: string): Promise<void> {
    await this._updateRedemption(rewardId, redemptionId, 'CANCELED');
  }

  // ---- Private ----------------------------------------------------------------

  private async _updateRedemption(
    rewardId: string,
    redemptionId: string,
    status: RedemptionStatus,
  ): Promise<void> {
    const cfg = this.configStore.read();
    const broadcasterId = cfg.broadcasterId ?? '';

    const res = await this._fetch(
      `${API_BASE}/channel_points/custom_rewards/redemptions?broadcaster_id=${broadcasterId}&reward_id=${rewardId}&id=${redemptionId}`,
      {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ status }),
      },
    );

    if (!res.ok) {
      throw new Error(`updateRedemption(${status}) failed: HTTP ${res.status}`);
    }
  }

  /**
   * Authenticated fetch with automatic 401 → refresh → retry logic.
   * On second 401 (refresh failed) emits auth:logout to all renderer windows.
   */
  private async _fetch(url: string, init: RequestInit = {}): Promise<Response> {
    const tokens = await this.authStore.getTokens();
    if (!tokens) {
      _broadcastLogout();
      return new Response(null, { status: 401 });
    }
    const { accessToken } = tokens;
    const cfg = this.configStore.read();
    const clientId = cfg.clientId ?? process.env.TWITCH_CLIENT_ID ?? BUNDLED_CLIENT_ID;

    const headers = {
      Authorization: `Bearer ${accessToken}`,
      'Client-Id': clientId,
      ...(init.headers as Record<string, string> | undefined),
    };

    let res = await fetch(url, { ...init, headers });

    if (res.status !== 401) return res;

    // Attempt refresh.
    const tokens2 = await this.authStore.getTokens();
    if (!tokens2?.refreshToken) {
      _broadcastLogout();
      return res;
    }

    try {
      await this.twitchAuth.refreshToken(tokens2.refreshToken);
    } catch {
      _broadcastLogout();
      return res;
    }

    // Retry with fresh token.
    const freshTokens = await this.authStore.getTokens();
    const newToken = freshTokens?.accessToken ?? '';
    const retryHeaders = {
      ...headers,
      Authorization: `Bearer ${newToken}`,
    };
    res = await fetch(url, { ...init, headers: retryHeaders });

    if (res.status === 401) {
      _broadcastLogout();
    }

    return res;

    // Suppress unused cfg warning — broadcasterId is read via cfg.broadcasterId above.
    void cfg;
  }
}

function _broadcastLogout(): void {
  for (const win of BrowserWindow.getAllWindows()) {
    win.webContents.send('auth:logout');
  }
}
