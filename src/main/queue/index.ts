import { EventEmitter } from 'events';
import { ConfigStore } from '../store/config';
import { TwitchApiClient } from '../twitch/api';
import { TwitchClient } from '../twitch/client';
import { Dispatcher } from './dispatcher';
import { RedemptionEvent } from './types';

// TODO(bootstrap): in main/index.ts create Queue singleton, pass ConfigStore + TwitchClient + TwitchApiClient

export interface QueueState {
  current: RedemptionEvent | null;
  pending: RedemptionEvent[];
}

/**
 * FIFO redemption queue. Processes one item at a time.
 *
 * Events:
 *   'paused'     — processing paused (disconnected or manual)
 *   'resumed'    — processing resumed (connected or manual)
 *   'stateChange' — QueueState changed (enqueue/skip/clear/dispatch start|end)
 *   'skip'       — skip current item requested (listeners should abort playback)
 */
export class Queue extends EventEmitter {
  private readonly _items: RedemptionEvent[] = [];
  private _processing = false;
  private _paused = false;
  private _current: RedemptionEvent | null = null;
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
    this._emitState();
    this._processNext();
  }

  /** Emit 'skip' to signal that the current playback should be aborted. */
  skip(): void {
    this.emit('skip');
  }

  /** Remove all pending (not yet started) items from the queue. */
  clear(): void {
    this._items.length = 0;
    this._emitState();
  }

  getState(): QueueState {
    return { current: this._current, pending: [...this._items] };
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
    this._current = this._items.shift()!;
    this._emitState();

    this.dispatcher
      .dispatch(this._current)
      .catch(() => {/* dispatcher catches all errors internally */})
      .finally(() => {
        this._processing = false;
        this._current = null;
        this._emitState();
        this._processNext();
      });
  }

  private _emitState(): void {
    this.emit('stateChange', this.getState());
  }
}
