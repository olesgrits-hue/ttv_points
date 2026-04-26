import { EventEmitter } from 'events';
import WebSocket from 'ws';
import { AuthStore } from '../store/auth';
import { ConfigStore } from '../store/config';
import { TWITCH_CLIENT_ID as BUNDLED_CLIENT_ID } from './twitch-creds';
import { alertLogger } from '../alert-logger';

const EVENTSUB_URL = 'wss://eventsub.wss.twitch.tv/ws';
const SUBSCRIPTION_API = 'https://api.twitch.tv/helix/eventsub/subscriptions';
const DEFAULT_KEEPALIVE_S = 10;
const WATCHDOG_GRACE_S = 5; // extra seconds beyond keepalive_timeout_seconds

export interface RedemptionEvent {
  id: string;
  rewardId: string;
  rewardTitle: string;
  userId: string;
  userName: string;
  userLogin: string;
  userDisplayName: string;
  redemptionId: string;
  redeemedAt: string;
  userInput?: string;
}

interface WelcomePayload {
  metadata: { message_type: 'session_welcome' };
  payload: {
    session: {
      id: string;
      keepalive_timeout_seconds: number;
    };
  };
}

interface ReconnectPayload {
  metadata: { message_type: 'session_reconnect' };
  payload: {
    session: {
      id: string;
      reconnect_url: string;
    };
  };
}

interface NotificationPayload {
  metadata: { message_type: 'notification' };
  payload: {
    subscription: { type: string };
    event: Record<string, unknown>;
  };
}

type EventSubMessage = WelcomePayload | ReconnectPayload | NotificationPayload | { metadata: { message_type: string } };

/**
 * EventSubClient manages a WebSocket connection to Twitch EventSub.
 * Emits:
 *   'redemption' — RedemptionEvent
 *   'connected' — void
 *   'disconnected' — void
 */
export class EventSubClient extends EventEmitter {
  private ws: WebSocket | null = null;
  private watchdogTimer: NodeJS.Timeout | null = null;
  private keepaliveMs: number = DEFAULT_KEEPALIVE_S * 1_000;
  private stopped = false;
  private sessionId: string | null = null;

  constructor(
    private readonly authStore: AuthStore,
    private readonly configStore: ConfigStore,
  ) {
    super();
  }

  connect(url: string = EVENTSUB_URL): void {
    this.stopped = false;
    this._openConnection(url);
  }

  stop(): void {
    this.stopped = true;
    this._clearWatchdog();
    if (this.ws) {
      this.ws.close(1000, 'stop');
      this.ws = null;
    }
  }

  // ---- Private ---------------------------------------------------------------

  private _openConnection(url: string): void {
    const ws = new WebSocket(url);
    this.ws = ws;

    ws.on('open', () => {
      this._resetWatchdog();
    });

    ws.on('message', (raw: Buffer | string) => {
      this._resetWatchdog();
      let msg: EventSubMessage;
      try {
        msg = JSON.parse(raw.toString()) as EventSubMessage;
      } catch {
        return;
      }
      this._handleMessage(msg, ws);
    });

    ws.on('close', () => {
      // Ignore close events from connections that have already been replaced
      // (e.g., old connection closed after a session_reconnect handoff).
      if (this.ws !== ws && this.ws !== null) return;
      this.ws = null;
      this._clearWatchdog();
      this.emit('disconnected');
      if (!this.stopped) {
        // Reconnect after short delay.
        setTimeout(() => this._openConnection(EVENTSUB_URL), 3_000);
      }
    });

    ws.on('error', () => {
      // close event fires next — let it handle reconnect.
    });
  }

  private _handleMessage(msg: EventSubMessage, ws: WebSocket): void {
    const type = msg.metadata.message_type;

    if (type === 'session_welcome') {
      const welcome = msg as WelcomePayload;
      this.sessionId = welcome.payload.session.id;
      const keepaliveS =
        welcome.payload.session.keepalive_timeout_seconds ?? DEFAULT_KEEPALIVE_S;
      this.keepaliveMs = (keepaliveS + WATCHDOG_GRACE_S) * 1_000;
      this._resetWatchdog();
      this.emit('connected');
      this._subscribe(this.sessionId).catch(() => {/* logged upstream */});
    } else if (type === 'session_reconnect') {
      const reconnect = msg as ReconnectPayload;
      const newUrl = reconnect.payload.session.reconnect_url;
      const oldWs = ws;
      // Open new connection first (this.ws updated), THEN close old one.
      // The old WS close handler will skip reconnect because this.ws !== oldWs.
      this._openConnection(newUrl);
      oldWs.close(1000, 'reconnect');
    } else if (type === 'session_keepalive') {
      // No-op: watchdog was already reset by message receipt.
    } else if (type === 'notification') {
      const notif = msg as NotificationPayload;
      const subscriptionType = notif.payload.subscription?.type ?? '';
      const ev = notif.payload.event;

      alertLogger.log('eventsub', 'notification received', { subscriptionType });
      if (subscriptionType === 'channel.channel_points_custom_reward_redemption.add') {
        const redemption: RedemptionEvent = {
          id: ev['id'] as string,
          rewardId: (ev['reward'] as { id: string }).id,
          rewardTitle: (ev['reward'] as { title: string }).title,
          userId: ev['user_id'] as string,
          userName: ev['user_name'] as string,
          userLogin: ev['user_login'] as string,
          userDisplayName: ev['user_name'] as string,
          redemptionId: ev['id'] as string,
          redeemedAt: (ev['redeemed_at'] as string | undefined) ?? new Date().toISOString(),
          userInput: ev['user_input'] as string | undefined,
        };
        this.emit('redemption', redemption);
      } else if (subscriptionType === 'channel.follow') {
        const followEvent = {
          userId: ev['user_id'] as string,
          userLogin: ev['user_login'] as string,
          userDisplayName: ev['user_name'] as string,
          followedAt: (ev['followed_at'] as string | undefined) ?? new Date().toISOString(),
        };
        alertLogger.log('eventsub', 'follow event parsed, emitting', followEvent);
        this.emit('follow', followEvent);
      }
    }
  }

  private async _subscribe(sessionId: string): Promise<void> {
    const cfg = this.configStore.read();
    const broadcasterId = cfg.broadcasterId ?? '';
    const tokens = await this.authStore.getTokens();
    const accessToken = tokens?.accessToken ?? '';
    const clientId = cfg.clientId ?? process.env.TWITCH_CLIENT_ID ?? BUNDLED_CLIENT_ID;

    const headers = {
      Authorization: `Bearer ${accessToken}`,
      'Client-Id': clientId,
      'Content-Type': 'application/json',
    };
    const transport = { method: 'websocket', session_id: sessionId };

    alertLogger.log('eventsub', 'subscribing', { broadcasterId, sessionId });

    const redemptionRes = await fetch(SUBSCRIPTION_API, {
      method: 'POST',
      headers,
      body: JSON.stringify({
        type: 'channel.channel_points_custom_reward_redemption.add',
        version: '1',
        condition: { broadcaster_user_id: broadcasterId },
        transport,
      }),
    });

    alertLogger.log('eventsub', 'redemption subscription response', { status: redemptionRes.status });

    if (redemptionRes.status === 401) {
      this.emit('auth_error', new Error('401 from subscription endpoint'));
      return;
    }

    // Follow events — requires moderator:read:followers scope.
    // If scope missing (user authed before this feature), silently skip.
    if (broadcasterId) {
      try {
        const followRes = await fetch(SUBSCRIPTION_API, {
          method: 'POST',
          headers,
          body: JSON.stringify({
            type: 'channel.follow',
            version: '2',
            condition: { broadcaster_user_id: broadcasterId, moderator_user_id: broadcasterId },
            transport,
          }),
        });
        const followBody = await followRes.text();
        alertLogger.log('eventsub', 'follow subscription response', { status: followRes.status, body: followBody });
      } catch (e) {
        alertLogger.log('eventsub', 'follow subscription error', { error: String(e) });
      }
    }
  }

  private _resetWatchdog(): void {
    this._clearWatchdog();
    this.watchdogTimer = setTimeout(() => {
      // No keepalive received within the expected window — close to trigger reconnect.
      // Do NOT null out this.ws here; the 'close' event handler cleans up.
      if (this.ws) {
        this.ws.close(1006, 'keepalive timeout');
      }
    }, this.keepaliveMs);
  }

  private _clearWatchdog(): void {
    if (this.watchdogTimer !== null) {
      clearTimeout(this.watchdogTimer);
      this.watchdogTimer = null;
    }
  }
}
