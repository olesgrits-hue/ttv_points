/**
 * Overlay player — runs in OBS Browser Source (Chromium renderer).
 * Connects to ws://127.0.0.1:7891/ws, registers with __GROUP_ID__,
 * handles 'play' and 'play_music' commands.
 */

const WS_URL = 'ws://127.0.0.1:7891/ws';
const BASE_LONG_SIDE = 400;
const MEME_PADDING = 15;
const MEME_BORDER_RADIUS = 12;
const MAX_ROTATION_DEG = 15;

// Shared AudioContext + DynamicsCompressor for auto-leveling all media/audio.
// One context reused for every element to avoid multiple audio graphs.
let _audioCtx: AudioContext | null = null;
let _compressor: DynamicsCompressorNode | null = null;

function getAudioGraph(): { ctx: AudioContext; compressor: DynamicsCompressorNode } {
  if (!_audioCtx || _audioCtx.state === 'closed') {
    _audioCtx = new AudioContext();
    _compressor = _audioCtx.createDynamicsCompressor();
    _compressor.threshold.value = -24;
    _compressor.knee.value = 30;
    _compressor.ratio.value = 12;
    _compressor.attack.value = 0.003;
    _compressor.release.value = 0.25;
    _compressor.connect(_audioCtx.destination);
  }
  return { ctx: _audioCtx, compressor: _compressor! };
}

function connectToCompressor(el: HTMLMediaElement): void {
  try {
    const { ctx, compressor } = getAudioGraph();
    const source = ctx.createMediaElementSource(el);
    source.connect(compressor);
    if (ctx.state === 'suspended') void ctx.resume();
  } catch { /* element may already be connected */ }
}

// Keep AudioContext alive when OBS hides the source (visibilitychange).
document.addEventListener('visibilitychange', () => {
  if (document.visibilityState === 'hidden' && _audioCtx) {
    void _audioCtx.resume();
  }
});

function getGroupId(): string {
  const w = window as Window & { __GROUP_ID__?: string };
  if (w.__GROUP_ID__) return w.__GROUP_ID__;
  const params = new URLSearchParams(window.location.search);
  return params.get('groupId') ?? 'default';
}

function randomBetween(min: number, max: number): number {
  return Math.floor(Math.random() * (max - min + 1)) + min;
}

function createMediaElement(url: string, scale: number, isMeme: boolean, isAudio = false, fixedWidth?: number, fixedHeight?: number): HTMLElement {
  if (isAudio) {
    const audio = document.createElement('audio');
    audio.src = url;
    audio.autoplay = true;
    audio.style.cssText = 'position:absolute;width:0;height:0;pointer-events:none;';
    connectToCompressor(audio);
    return audio;
  }

  const deg = randomBetween(-MAX_ROTATION_DEG, MAX_ROTATION_DEG);

  const video = document.createElement('video');
  video.src = url;
  video.autoplay = true;
  video.muted = false;
  video.style.display = 'block';
  video.style.pointerEvents = 'none';
  connectToCompressor(video);

  let container: HTMLElement;

  if (isMeme) {
    container = document.createElement('div');
    container.style.position = 'absolute';
    container.style.background = 'white';
    container.style.borderRadius = `${MEME_BORDER_RADIUS}px`;
    container.style.transform = `rotate(${deg}deg)`;
    container.style.pointerEvents = 'none';
    container.style.visibility = 'hidden';

    container.appendChild(video);

    video.addEventListener('loadedmetadata', () => {
      const longSide = BASE_LONG_SIDE * scale;
      const ratio = video.videoWidth / video.videoHeight;
      const vw = fixedWidth ?? (ratio >= 1 ? longSide : Math.round(longSide * ratio));
      const vh = fixedHeight ?? (ratio >= 1 ? Math.round(longSide / ratio) : longSide);
      video.style.width = `${vw}px`;
      video.style.height = `${vh}px`;
      container.style.padding = `${MEME_PADDING}px`;
      const totalW = vw + MEME_PADDING * 2;
      const totalH = vh + MEME_PADDING * 2;
      const x = randomBetween(0, Math.max(0, window.innerWidth - totalW));
      const y = randomBetween(0, Math.max(0, window.innerHeight - totalH));
      container.style.left = `${x}px`;
      container.style.top = `${y}px`;
      container.style.visibility = 'visible';
    }, { once: true });
  } else {
    video.style.position = 'absolute';
    video.style.transform = `rotate(${deg}deg)`;
    video.style.visibility = 'hidden';

    video.addEventListener('loadedmetadata', () => {
      const longSide = BASE_LONG_SIDE * scale;
      const ratio = video.videoWidth / video.videoHeight;
      const vw = fixedWidth ?? (ratio >= 1 ? longSide : Math.round(longSide * ratio));
      const vh = fixedHeight ?? (ratio >= 1 ? Math.round(longSide / ratio) : longSide);
      video.style.width = `${vw}px`;
      video.style.height = `${vh}px`;
      const x = randomBetween(0, Math.max(0, window.innerWidth - vw));
      const y = randomBetween(0, Math.max(0, window.innerHeight - vh));
      video.style.left = `${x}px`;
      video.style.top = `${y}px`;
      video.style.visibility = 'visible';
    }, { once: true });

    container = video;
  }

  return container;
}

function createMusicPlayer(url: string, title: string, artist: string, coverUrl: string, scale: number, showPlayer = true): { element: HTMLElement; audio: HTMLAudioElement } {
  if (!showPlayer) {
    const audio = document.createElement('audio');
    audio.src = url;
    audio.autoplay = true;
    audio.style.cssText = 'position:absolute;width:0;height:0;pointer-events:none;';
    connectToCompressor(audio);
    return { element: audio, audio };
  }

  const s = scale;
  const discSize = Math.round(64 * s);
  const pad = Math.round(12 * s);
  const padH = Math.round(20 * s);
  const gap = Math.round(16 * s);
  const radius = Math.round(16 * s);

  const wrap = document.createElement('div');
  wrap.style.cssText = `
    position: absolute;
    bottom: ${Math.round(40 * s)}px;
    left: 50%;
    transform: translateX(-50%) translateY(120%);
    display: flex;
    align-items: center;
    gap: ${gap}px;
    background: rgba(0,0,0,0.75);
    border-radius: ${radius}px;
    padding: ${pad}px ${padH}px;
    min-width: ${Math.round(320 * s)}px;
    max-width: ${Math.round(600 * s)}px;
    transition: transform 0.5s cubic-bezier(0.22, 1, 0.36, 1);
    pointer-events: none;
  `;

  const disc = document.createElement('div');
  disc.style.cssText = `
    width: ${discSize}px;
    height: ${discSize}px;
    border-radius: 50%;
    overflow: hidden;
    flex-shrink: 0;
    animation: vinyl-spin 20s linear infinite;
    background: #333;
  `;

  if (coverUrl) {
    const img = document.createElement('img');
    img.src = coverUrl;
    img.style.cssText = 'width:100%;height:100%;object-fit:cover;';
    disc.appendChild(img);
  }

  const info = document.createElement('div');
  info.style.cssText = 'color:#fff;overflow:hidden;flex:1;min-width:0;';

  const titleEl = document.createElement('div');
  titleEl.style.cssText = `font-size:${Math.round(22 * s)}px;font-weight:bold;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;`;
  titleEl.textContent = title;

  const artistEl = document.createElement('div');
  artistEl.style.cssText = `font-size:${Math.round(18 * s)}px;color:#aaa;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;margin-top:${Math.round(4 * s)}px;`;
  artistEl.textContent = artist;

  info.appendChild(titleEl);
  info.appendChild(artistEl);
  wrap.appendChild(disc);
  wrap.appendChild(info);

  const audio = document.createElement('audio');
  audio.src = url;
  audio.autoplay = true;
  wrap.appendChild(audio);
  connectToCompressor(audio);

  if (!document.getElementById('vinyl-spin-style')) {
    const style = document.createElement('style');
    style.id = 'vinyl-spin-style';
    style.textContent = '@keyframes vinyl-spin { from { transform: rotate(0deg); } to { transform: rotate(360deg); } }';
    document.head.appendChild(style);
  }

  (wrap as HTMLElement & { _stopEq: () => void })._stopEq = () => {};

  return { element: wrap, audio };
}

interface PlayMessage {
  type: 'play';
  id?: string;
  url: string;
  scale?: number;
  isMeme?: boolean;
  isAudio?: boolean;
  width?: number;
  height?: number;
}

interface PlayMusicMessage {
  type: 'play_music';
  url: string;
  title: string;
  artist: string;
  coverUrl: string;
  duration: number;
  scale?: number;
  showPlayer?: boolean;
}

function connect(): void {
  const groupId = getGroupId();
  const ws = new WebSocket(WS_URL);

  ws.addEventListener('open', () => {
    ws.send(JSON.stringify({ type: 'register', groupId }));
  });

  ws.addEventListener('message', (event: MessageEvent) => {
    let msg: PlayMessage | PlayMusicMessage;
    try {
      msg = JSON.parse(event.data as string) as PlayMessage | PlayMusicMessage;
    } catch {
      return;
    }

    if (msg.type === 'play') {
      const { url, scale = 3, isMeme = false, isAudio = false, id, width, height } = msg as PlayMessage;
      if (!url) return;
      const element = createMediaElement(url, scale, isMeme, isAudio, width, height);
      document.body.appendChild(element);
      const mediaEl = isAudio
        ? (element as HTMLAudioElement)
        : (element instanceof HTMLVideoElement ? element : element.querySelector('video')!);
      const cleanup = (): void => {
        element.remove();
        ws.send(JSON.stringify({ type: 'playback_ended', id }));
      };
      mediaEl.addEventListener('ended', cleanup, { once: true });
      mediaEl.addEventListener('error', cleanup, { once: true });
      return;
    }

    if (msg.type === 'play_music') {
      const { url, title, artist, coverUrl, duration, scale = 1, showPlayer = true } = msg as PlayMusicMessage;
      const { element, audio } = createMusicPlayer(url, title, artist, coverUrl, scale, showPlayer);
      document.body.appendChild(element);

      requestAnimationFrame(() => {
        requestAnimationFrame(() => {
          (element as HTMLElement).style.transform = 'translateX(-50%) translateY(0)';
        });
      });

      let finished = false;
      const finish = (): void => {
        if (finished) return;
        finished = true;
        (element as (HTMLElement & { _stopEq?: () => void }))._stopEq?.();
        (element as HTMLElement).style.transform = 'translateX(-50%) translateY(120%)';
        setTimeout(() => {
          element.remove();
          ws.send(JSON.stringify({ type: 'playback_ended' }));
        }, 500);
      };

      audio.addEventListener('ended', finish, { once: true });
      audio.addEventListener('error', finish, { once: true });
      setTimeout(finish, (duration + 10) * 1000);
    }
  });

  ws.addEventListener('close', () => {
    setTimeout(connect, 3_000);
  });

  ws.addEventListener('error', () => { /* handled by close */ });
}

connect();
