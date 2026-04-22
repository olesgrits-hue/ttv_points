import { v4 as uuid } from 'uuid';
import { BrowserWindow } from 'electron';
import { MusicSlot, Slot, LogEntry } from '../store/types';
import { OverlayServer } from '../overlay/server';
import { TwitchApiClient } from '../twitch/api';
import { AuthStore } from '../store/auth';
import { RedemptionEvent } from '../queue/types';
import { YandexMusicClient, extractTrackIdFromUrl } from '../yandex/client';

export class MusicAction {
  private ymClient: YandexMusicClient | null = null;

  constructor(
    private readonly authStore: AuthStore,
    private readonly overlayServer: OverlayServer,
    private readonly twitchApi: TwitchApiClient,
  ) {}

  async execute(slot: Slot, redemption: RedemptionEvent): Promise<void> {
    if (slot.type !== 'music') {
      throw new Error(`MusicAction: unexpected slot type "${slot.type}"`);
    }

    const yamToken = await this.authStore.getYamToken();
    if (!yamToken) {
      await this._cancelAndLog(slot as MusicSlot, redemption, 'Яндекс Музыка не настроена: токен отсутствует');
      return;
    }

    const client = this._getClient(yamToken);
    const query = redemption.userInput?.trim() ?? '';
    if (!query) {
      await this._cancelAndLog(slot as MusicSlot, redemption, 'Зритель не указал трек');
      return;
    }

    let trackId: string | null = extractTrackIdFromUrl(query);
    let success = false;
    let errorMessage: string | undefined;

    try {
      if (!trackId) {
        const results = await client.search(query);
        if (!results.length) throw new Error(`Трек не найден: "${query}"`);
        trackId = results[0].id;
      }

      const [track, streamUrl] = await Promise.all([
        client.getTrack(trackId),
        client.getStreamUrl(trackId),
      ]);

      const musicSlot = slot as MusicSlot;
      const groupId = musicSlot.groupId ?? 'default';
      await this.overlayServer.playMusic(
        {
          url: streamUrl,
          title: track.title,
          artist: track.artist,
          coverUrl: track.coverUri ?? '',
          duration: Math.ceil(track.durationMs / 1000),
          scale: musicSlot.scale ?? 1,
        },
        groupId,
      );

      // 30s gap between tracks so they don't overlap in queue
      await new Promise<void>((resolve) => setTimeout(resolve, 30_000));

      await this.twitchApi.fulfillRedemption(redemption.rewardId, redemption.id);
      success = true;
    } catch (err) {
      errorMessage = err instanceof Error ? err.message : String(err);
      try {
        await this.twitchApi.cancelRedemption(redemption.rewardId, redemption.id);
      } catch { /* logged upstream */ }
    }

    _broadcastLog({
      id: uuid(),
      timestamp: new Date(),
      viewerName: redemption.userDisplayName,
      rewardTitle: slot.rewardTitle,
      status: success ? 'success' : 'error',
      errorMessage,
    });
  }

  private _getClient(token: string): YandexMusicClient {
    if (!this.ymClient) {
      this.ymClient = new YandexMusicClient(token);
    } else {
      this.ymClient.setToken(token);
    }
    return this.ymClient;
  }

  private async _cancelAndLog(slot: MusicSlot, redemption: RedemptionEvent, errorMessage: string): Promise<void> {
    try {
      await this.twitchApi.cancelRedemption(redemption.rewardId, redemption.id);
    } catch { /* ignore */ }
    _broadcastLog({
      id: uuid(),
      timestamp: new Date(),
      viewerName: redemption.userDisplayName,
      rewardTitle: slot.rewardTitle,
      status: 'error',
      errorMessage,
    });
  }
}

function _broadcastLog(entry: LogEntry): void {
  for (const win of BrowserWindow.getAllWindows()) {
    win.webContents.send('log:entry', entry);
  }
}
