import { createHash } from 'crypto';

const API_BASE = 'https://api.music.yandex.net';
// Sign key for download-info HMAC — from Yandex Music mobile app source.
const SIGN_KEY = 'XGRlBW9FXlekgbPrRHuSiA';

export interface Track {
  id: string;
  title: string;
  artist: string;
  durationMs: number;
  coverUri?: string;
}

export class YandexMusicClient {
  constructor(private token: string) {}

  setToken(token: string): void {
    this.token = token;
  }

  async search(query: string): Promise<Track[]> {
    const url = `${API_BASE}/search?text=${encodeURIComponent(query)}&type=track&page=0`;
    const data = await this._get(url);
    const result = data['result'] as Record<string, unknown> | undefined;
    const tracksObj = result?.['tracks'] as Record<string, unknown> | undefined;
    const items = (tracksObj?.['results'] as unknown[]) ?? [];
    return items.slice(0, 5).map((t) => this._parseTrack(t));
  }

  async getTrack(trackId: string): Promise<Track> {
    const data = await this._get(`${API_BASE}/tracks/${trackId}`);
    const tracks = (data['result'] as unknown[]) ?? [];
    if (!tracks.length) throw new Error(`Track ${trackId} not found`);
    return this._parseTrack(tracks[0]);
  }

  async getStreamUrl(trackId: string): Promise<string> {
    const infoList = await this._get(`${API_BASE}/tracks/${trackId}/download-info`);
    const infos = (infoList['result'] as unknown[]) ?? [];
    // Prefer mp3 320 → mp3 192 → first available
    const sorted = [...infos].sort((a: unknown, b: unknown) => {
      const aCodec = (a as Record<string, unknown>).codec as string;
      const bCodec = (b as Record<string, unknown>).codec as string;
      const aBitrate = (a as Record<string, unknown>).bitrateInKbps as number;
      const bBitrate = (b as Record<string, unknown>).bitrateInKbps as number;
      if (aCodec === 'mp3' && bCodec !== 'mp3') return -1;
      if (bCodec === 'mp3' && aCodec !== 'mp3') return 1;
      return (bBitrate ?? 0) - (aBitrate ?? 0);
    });

    if (!sorted.length) throw new Error(`No download info for track ${trackId}`);

    const downloadUrl = (sorted[0] as Record<string, unknown>).downloadInfoUrl as string;
    if (!downloadUrl) throw new Error(`No downloadInfoUrl for track ${trackId}`);

    const xmlText = await this._getRaw(downloadUrl);
    return this._buildStreamUrl(xmlText);
  }

  private _buildStreamUrl(xmlText: string): string {
    const host = xmlText.match(/<host>([^<]+)<\/host>/)?.[1] ?? '';
    const path = xmlText.match(/<path>([^<]+)<\/path>/)?.[1] ?? '';
    const ts = xmlText.match(/<ts>([^<]+)<\/ts>/)?.[1] ?? '';
    const s = xmlText.match(/<s>([^<]+)<\/s>/)?.[1] ?? '';

    const sign = createHash('md5')
      .update(SIGN_KEY + path.slice(1) + s)
      .digest('hex');

    return `https://${host}/get-mp3/${sign}/${ts}${path}`;
  }

  private _parseTrack(t: unknown): Track {
    const obj = t as Record<string, unknown>;
    const id = String(obj.id ?? '');
    const title = String(obj.title ?? 'Unknown');
    const durationMs = (obj.durationMs as number) ?? 0;
    const artists: unknown[] = (obj.artists as unknown[]) ?? [];
    const artist = (artists[0] as Record<string, unknown>)?.name as string ?? 'Unknown';
    const albums: unknown[] = (obj.albums as unknown[]) ?? [];
    const albumCoverUri = (albums[0] as Record<string, unknown>)?.coverUri as string | undefined;
    const coverUri = albumCoverUri
      ? 'https://' + albumCoverUri.replace('%%', '200x200')
      : undefined;
    return { id, title, artist, durationMs, coverUri };
  }

  private async _get(url: string): Promise<Record<string, unknown>> {
    const res = await fetch(url, {
      headers: {
        Authorization: `OAuth ${this.token}`,
        'X-Yandex-Music-Client': 'YandexMusicAndroid/24023621',
        'X-Yandex-Music-Device': 'os=Android; os_version=12; manufacturer=Google; model=Pixel; clid=; device_id=random; uuid=random',
        'Accept': 'application/json',
        'Accept-Language': 'ru',
      },
    });
    if (!res.ok) throw new Error(`Yandex Music API ${res.status}: ${url}`);
    return res.json() as Promise<Record<string, unknown>>;
  }

  private async _getRaw(url: string): Promise<string> {
    const res = await fetch(url);
    if (!res.ok) throw new Error(`Download info fetch failed: ${res.status}`);
    return res.text();
  }
}

/** Extract track ID from a Yandex Music URL like music.yandex.ru/track/12345 */
export function extractTrackIdFromUrl(text: string): string | null {
  const match = text.match(/music\.yandex\.\w+\/(?:album\/\d+\/)?track\/(\d+)/);
  return match?.[1] ?? null;
}
