/**
 * Overlay player — runs in OBS Browser Source (Chromium renderer).
 *
 * Connects to the WS server at ws://127.0.0.1:7891/ws, authenticates with
 * the nonce embedded in the page URL, and handles `play` commands by
 * creating a <video> element at a random position/rotation within the viewport.
 */

const WS_URL = 'ws://127.0.0.1:7891/ws';
const VIDEO_WIDTH = 400;
const VIDEO_HEIGHT = 300;
const MAX_ROTATION_DEG = 15;

function getNonce(): string {
  const params = new URLSearchParams(window.location.search);
  return params.get('nonce') ?? '';
}

function randomBetween(min: number, max: number): number {
  return Math.floor(Math.random() * (max - min + 1)) + min;
}

function createVideoElement(url: string): HTMLVideoElement {
  const x = randomBetween(0, Math.max(0, window.innerWidth - VIDEO_WIDTH));
  const y = randomBetween(0, Math.max(0, window.innerHeight - VIDEO_HEIGHT));
  const deg = randomBetween(-MAX_ROTATION_DEG, MAX_ROTATION_DEG);

  const video = document.createElement('video');
  video.src = url;
  video.width = VIDEO_WIDTH;
  video.height = VIDEO_HEIGHT;
  video.autoplay = true;
  video.muted = false;
  video.style.position = 'absolute';
  video.style.left = `${x}px`;
  video.style.top = `${y}px`;
  video.style.width = `${VIDEO_WIDTH}px`;
  video.style.height = `${VIDEO_HEIGHT}px`;
  video.style.transform = `rotate(${deg}deg)`;
  video.style.pointerEvents = 'none';
  return video;
}

interface PlayMessage {
  type: 'play';
  id?: string;
  url: string;
}

interface AuthMessage {
  type: 'auth';
  nonce: string;
}

function connect(): void {
  const nonce = getNonce();
  const ws = new WebSocket(WS_URL);

  ws.addEventListener('open', () => {
    const msg: AuthMessage = { type: 'auth', nonce };
    ws.send(JSON.stringify(msg));
  });

  ws.addEventListener('message', (event: MessageEvent) => {
    let msg: PlayMessage;
    try {
      msg = JSON.parse(event.data as string) as PlayMessage;
    } catch {
      return;
    }

    if (msg.type !== 'play' || !msg.url) return;

    const video = createVideoElement(msg.url);
    document.body.appendChild(video);

    const cleanup = (): void => {
      video.remove();
      ws.send(JSON.stringify({ type: 'playback_ended' }));
    };

    video.addEventListener('ended', cleanup, { once: true });
    video.addEventListener('error', cleanup, { once: true });
  });

  ws.addEventListener('close', () => {
    // Reconnect after a brief delay so overlay recovers if the main process restarts.
    setTimeout(connect, 3_000);
  });

  ws.addEventListener('error', () => {
    // Error fires before close — let the close handler do the reconnect.
  });
}

connect();
