import { EventEmitter } from 'events';
import WebSocket from 'ws';
import { AuthStore } from '../store/auth';
import { ConfigStore } from '../store/config';

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
  redeemedAt: string; // ISO 8601
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
    event: {
      id: string;
      reward: { id: string; title: string };
      user_id: string;
      user_name: string;
      user_login: string;
    };
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
      const ev = notif.payload.event;
      const redemption: RedemptionEvent = {
        id: ev.id,
        rewardId: ev.reward.id,
        rewardTitle: ev.reward.title,
        userId: ev.user_id,
        userName: ev.user_name,
        userLogin: ev.user_login,
        userDisplayName: ev.user_name,  // Twitch user_name IS the display name
        redemptionId: ev.id,
        redeemedAt: (ev.redeemed_at as string | undefined) ?? new Date().toISOString(),
      };
      this.emit('redemption', redemption);
    }
  }

  private async _subscribe(sessionId: string): Promise<void> {
    const cfg = this.configStore.read();
    const broadcasterId = cfg.broadcasterId ?? '';
    const { accessToken } = await this.authStore.getTokens();
    const clientId = process.env.TWITCH_CLIENT_ID ?? '';

    const res = await fetch(SUBSCRIPTION_API, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${accessToken}`,
        'Client-Id': clientId,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        type: 'channel.channel_points_custom_reward_redemption.add',
        version: '1',
        condition: { broadcaster_user_id: broadcasterId },
        transport: { method: 'websocket', session_id: sessionId },
      }),
    });

    if (res.status === 401) {
      // Signal refresh needed — handled at higher level.
      this.emit('auth_error', new Error('401 from subscription endpoint'));
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
