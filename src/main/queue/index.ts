import { EventEmitter } from 'events';
import { ConfigStore } from '../store/config';
import { TwitchApiClient } from '../twitch/api';
import { TwitchClient } from '../twitch/client';
import { Dispatcher } from './dispatcher';
import { RedemptionEvent } from './types';

// TODO(bootstrap): in main/index.ts create Queue singleton, pass ConfigStore + TwitchClient + TwitchApiClient

/**
 * FIFO redemption queue. Processes one item at a time.
 *
 * Events:
 *   'paused'  — processing paused (disconnected or manual)
 *   'resumed' — processing resumed (connected or manual)
 */
export class Queue extends EventEmitter {
  private readonly _items: RedemptionEvent[] = [];
  private _processing = false;
  private _paused = false;
  private readonly dispatcher: Dispatcher;

  constructor(
    private readonly configStore: ConfigStore,
    twitchClient: TwitchClient,
    twitchApi: TwitchApiClient,
  ) {
    super();
    this.dispatcher = new Dispatcher(configStore, twitchApi);

    twitchClient.on('disconnected', () => this.pause());
    twitchClient.on('connected', () => this.resume());
  }

  /**
   * Add a redemption to the tail of the queue.
   * If the max-slots limit (configStore.getSlots().length) is already at 5,
   * cancel the redemption and emit an error log instead of enqueuing.
   */
  enqueue(redemption: RedemptionEvent): void {
    // For the max-5 check we guard against over-redemption when all 5 slots
    // are already occupied. Note: this is the slot COUNT, not queue depth.
    if (this.configStore.getSlots().length >= 5) {
      // Fire-and-forget cancel — errors already logged inside dispatcher.
      this.dispatcher
        .dispatch({
          ...redemption,
          rewardId: '__max_slots_exceeded__', // ensures slot not found → cancel path
        })
        .catch(() => {/* logged inside dispatcher */});
      return;
    }

    this._items.push(redemption);
    this._processNext();
  }

  pause(): void {
    if (this._paused) return;
    this._paused = true;
    this.emit('paused');
  }

  resume(): void {
    if (!this._paused) return;
    this._paused = false;
    this.emit('resumed');
    this._processNext();
  }

  size(): number {
    return this._items.length;
  }

  // ---- Private ---------------------------------------------------------------

  private _processNext(): void {
    if (this._paused || this._processing || this._items.length === 0) return;

    this._processing = true;
    const item = this._items.shift()!;

    this.dispatcher
      .dispatch(item)
      .catch(() => {/* dispatcher catches all errors internally */})
      .finally(() => {
        this._processing = false;
        this._processNext();
      });
  }
}
