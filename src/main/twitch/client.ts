import { EventEmitter } from 'events';
import { BrowserWindow } from 'electron';
import { TwitchApiClient } from './api';
import { EventSubClient, RedemptionEvent } from './eventsub';
import { AuthStore } from '../store/auth';
import { ConfigStore } from '../store/config';
import { TwitchAuth } from './auth';

/**
 * TwitchClient is the public facade that combines the REST API client and
 * the EventSub WebSocket client. Owns lifecycle (start/stop) and pushes
 * IPC status updates to all renderer windows.
 */
export class TwitchClient extends EventEmitter {
  readonly api: TwitchApiClient;
  readonly eventSub: EventSubClient;

  private _connected = false;

  constructor(
    configStore: ConfigStore,
    authStore: AuthStore,
    twitchAuth: TwitchAuth,
  ) {
    super();
    this.api = new TwitchApiClient(configStore, authStore, twitchAuth);
    this.eventSub = new EventSubClient(authStore, configStore);

    this.eventSub.on('connected', () => {
      this._connected = true;
      this.emit('connected');
      _broadcastStatus(true);
    });

    this.eventSub.on('disconnected', () => {
      this._connected = false;
      this.emit('disconnected');
      _broadcastStatus(false);
    });

    this.eventSub.on('redemption', (ev: RedemptionEvent) => {
      this.emit('redemption', ev);
    });

    this.eventSub.on('follow', (ev: { userId: string; userLogin: string; userDisplayName: string; followedAt: string }) => {
      this.emit('follow', ev);
    });
  }

  get connected(): boolean {
    return this._connected;
  }

  start(): void {
    this.eventSub.connect();
  }

  stop(): void {
    this.eventSub.stop();
  }
}

function _broadcastStatus(connected: boolean): void {
  for (const win of BrowserWindow.getAllWindows()) {
    win.webContents.send('twitch:status', { connected });
  }
}
