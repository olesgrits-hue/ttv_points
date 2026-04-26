import { EventEmitter } from 'events';
import express, { type Express, type NextFunction, type Request, type Response } from 'express';
import * as http from 'http';
import * as path from 'path';
import * as fs from 'fs';
import { WebSocketServer, WebSocket } from 'ws';
import { MediaRegistry } from './registry';
import { alertLogger } from '../alert-logger';

const HOST = '127.0.0.1';
const PORT = 7891;
const PLAYBACK_TIMEOUT_MS = 120_000;
const ALERT_GROUP_ID = '__alert__';

type PlaybackEndedMessage = { type: 'playback_ended'; id?: string };
type PlayMessage = { type: 'play'; id: string; url: string; scale: number; isMeme: boolean; isAudio: boolean; width?: number; height?: number };
type PlayMusicMessage = { type: 'play_music'; url: string; title: string; artist: string; coverUrl: string; duration: number; scale: number; showPlayer: boolean };
type RegisterMessage = { type: 'register'; groupId: string };
type ClientInbound = PlaybackEndedMessage | RegisterMessage | { type: string };

interface ConnectedClient {
  socket: WebSocket;
  groupId: string | null;
}

interface PendingPlayback {
  resolve: () => void;
  timer: NodeJS.Timeout;
}

/**
 * Overlay HTTP + WebSocket server on 127.0.0.1:7891.
 * Each group gets its own overlay URL: /overlay/:groupId
 * WS clients register their groupId by sending { type: 'register', groupId }.
 */
export class OverlayServer extends EventEmitter {
  readonly registry = new MediaRegistry();
  private readonly app: Express;
  private readonly httpServer: http.Server;
  private readonly wss: WebSocketServer;
  private readonly groupClients = new Map<string, Set<WebSocket>>();
  private readonly pendingPlaybacks = new Map<string, PendingPlayback>();
  private started = false;

  constructor(
    private readonly overlayHtmlPath: string = path.resolve(__dirname, '../../web/overlay/index.html'),
    private readonly webDir: string = path.resolve(__dirname, '../../web'),
    private readonly alertHtmlPath: string = path.resolve(__dirname, '../../web/overlay/alert/index.html'),
  ) {
    super();
    this.app = express();
    this.configureRoutes();
    this.httpServer = http.createServer(this.app);
    this.wss = new WebSocketServer({ noServer: true });
    this.httpServer.on('upgrade', (req, socket, head) => {
      const url = req.url ?? '';
      if (!url.startsWith('/ws')) {
        socket.destroy();
        return;
      }
      this.wss.handleUpgrade(req, socket, head, (ws) => {
        this.handleConnection(ws);
      });
    });
  }

  start(): Promise<void> {
    if (this.started) return Promise.resolve();
    return new Promise((resolve, reject) => {
      const onError = (err: Error): void => {
        this.httpServer.off('listening', onListening);
        reject(err);
      };
      const onListening = (): void => {
        this.httpServer.off('error', onError);
        this.started = true;
        resolve();
      };
      this.httpServer.once('error', onError);
      this.httpServer.once('listening', onListening);
      this.httpServer.listen(PORT, HOST);
    });
  }

  async stop(): Promise<void> {
    for (const [groupId, pending] of this.pendingPlaybacks) {
      clearTimeout(pending.timer);
      pending.resolve();
      this.pendingPlaybacks.delete(groupId);
    }
    for (const client of this.wss.clients) {
      client.terminate();
    }
    await new Promise<void>((resolve) => this.wss.close(() => resolve()));
    await new Promise<void>((resolve, reject) => {
      this.httpServer.close((err) => (err ? reject(err) : resolve()));
    });
    this.started = false;
  }

  address(): { address: string; port: number } | null {
    const addr = this.httpServer.address();
    if (addr === null || typeof addr === 'string') return null;
    return { address: addr.address, port: addr.port };
  }

  /** Broadcast a message to all connected clients of a group. Returns count sent. */
  private broadcast(groupId: string, data: string): number {
    const clients = this.groupClients.get(groupId);
    if (!clients) return 0;
    let sent = 0;
    for (const ws of clients) {
      if (ws.readyState === WebSocket.OPEN) {
        try { ws.send(data); sent++; } catch { /* ignore */ }
      }
    }
    return sent;
  }

  /** Push a play command to all overlay clients in the group and wait for playback_ended or timeout. */
  play(id: string, _filePath: string, scale = 3, isMeme = false, groupId = 'default', isAudio = false, width?: number, height?: number): Promise<void> {
    if (this.pendingPlaybacks.has(groupId)) {
      return Promise.reject(new Error(`OverlayServer.play: another playback is in progress for group ${groupId}`));
    }
    const clients = this.groupClients.get(groupId);
    if (!clients || clients.size === 0) {
      return Promise.reject(new Error(`OverlayServer.play: no connected overlay for group "${groupId}"`));
    }
    const msg: PlayMessage = { type: 'play', id, url: `/media/${id}`, scale, isMeme, isAudio, width, height };
    const data = JSON.stringify(msg);

    return new Promise<void>((resolve) => {
      const timer = setTimeout(() => {
        this.pendingPlaybacks.delete(groupId);
        resolve();
      }, PLAYBACK_TIMEOUT_MS);

      this.pendingPlaybacks.set(groupId, { resolve, timer });

      if (this.broadcast(groupId, data) === 0) {
        clearTimeout(timer);
        this.pendingPlaybacks.delete(groupId);
        resolve();
      }
    });
  }

  /** Push a music play command to all overlay clients in the group. */
  playMusic(payload: Omit<PlayMusicMessage, 'type'>, groupId = 'default'): Promise<void> {
    if (this.pendingPlaybacks.has(groupId)) {
      return Promise.reject(new Error(`OverlayServer.playMusic: another playback is in progress for group ${groupId}`));
    }
    const clients = this.groupClients.get(groupId);
    if (!clients || clients.size === 0) {
      return Promise.reject(new Error(`OverlayServer.playMusic: no connected overlay for group "${groupId}"`));
    }
    const msg: PlayMusicMessage = { ...payload, type: 'play_music', showPlayer: payload.showPlayer ?? true };
    const timeoutMs = payload.duration > 0
      ? (payload.duration + 45) * 1000
      : PLAYBACK_TIMEOUT_MS;
    const data = JSON.stringify(msg);

    return new Promise<void>((resolve) => {
      const timer = setTimeout(() => {
        this.pendingPlaybacks.delete(groupId);
        resolve();
      }, timeoutMs);

      this.pendingPlaybacks.set(groupId, { resolve, timer });

      if (this.broadcast(groupId, data) === 0) {
        clearTimeout(timer);
        this.pendingPlaybacks.delete(groupId);
        resolve();
      }
    });
  }

  /** Send a fire_alert message to all connected alert overlay clients. */
  fireAlert(nick: string): void {
    const clients = this.groupClients.get(ALERT_GROUP_ID);
    const clientCount = clients?.size ?? 0;
    alertLogger.log('ws', 'fireAlert called', { nick, alertClients: clientCount });
    const msg = JSON.stringify({ type: 'fire_alert', nick });
    const sent = this.broadcast(ALERT_GROUP_ID, msg);
    alertLogger.log('ws', 'fireAlert broadcast result', { sent });
  }

  /** Push updated alert config to all connected alert overlay clients. */
  pushAlertConfig(config: object): void {
    const msg = JSON.stringify({ type: 'alert_config', config });
    this.broadcast(ALERT_GROUP_ID, msg);
  }

  /** Immediately resolve all pending playbacks and stop overlay playback (used for skip). */
  skipAll(): void {
    for (const [groupId, pending] of this.pendingPlaybacks) {
      clearTimeout(pending.timer);
      this.pendingPlaybacks.delete(groupId);
      pending.resolve();
    }
    // Tell all overlay clients to stop immediately.
    const stopMsg = JSON.stringify({ type: 'stop' });
    for (const client of this.wss.clients) {
      if (client.readyState === WebSocket.OPEN) {
        try { client.send(stopMsg); } catch { /* ignore */ }
      }
    }
    // Signal pending 30s gaps in MusicAction to resolve early.
    this.emit('skip');
  }

  // --- Internal ---------------------------------------------------------

  private configureRoutes(): void {
    this.app.use((_req: Request, res: Response, next: NextFunction) => {
      res.setHeader('Cache-Control', 'no-store');
      next();
    });

    this.app.use('/assets', express.static(path.join(this.webDir, 'assets')));

    // Follower alert overlay — serves alert/index.html with config injection.
    this.app.get('/overlay/alert', (_req: Request, res: Response) => {
      this.serveAlertHtml(res);
    });

    // Alert overlay JS engine — served as a static asset.
    this.app.get('/overlay/alert/alert-engine.js', (_req: Request, res: Response) => {
      const jsPath = path.join(path.dirname(this.alertHtmlPath), 'alert-engine.js');
      res.setHeader('Content-Type', 'application/javascript; charset=utf-8');
      res.sendFile(path.resolve(jsPath), (err) => {
        if (err && !res.headersSent) res.status(404).end();
      });
    });

    // Per-group overlay page — injects __GROUP_ID__ for WS registration.
    this.app.get('/overlay/:groupId', (req: Request, res: Response) => {
      const groupId = Array.isArray(req.params.groupId) ? req.params.groupId[0] : req.params.groupId;
      if (!groupId || /[^\w-]/.test(groupId)) {
        res.status(400).end();
        return;
      }
      this.serveOverlayHtml(groupId, res);
    });

    // Legacy single-overlay route — uses 'default' as groupId.
    this.app.get('/overlay', (_req: Request, res: Response) => {
      this.serveOverlayHtml('default', res);
    });

    this.app.get('/media/:id', (req: Request, res: Response) => {
      const id = Array.isArray(req.params.id) ? req.params.id[0] : req.params.id;
      if (!id || /[\\/]|\.\./.test(id)) {
        res.status(400).end();
        return;
      }
      const filePath = this.registry.resolve(id);
      if (!filePath) {
        res.status(404).end();
        return;
      }
      res.sendFile(path.resolve(filePath), (err) => {
        if (err && !res.headersSent) {
          res.status(404).end();
        }
      });
    });
  }

  private serveAlertHtml(res: Response): void {
    res.setHeader('Content-Type', 'text/html; charset=utf-8');
    fs.readFile(this.alertHtmlPath, 'utf-8', (err, html) => {
      if (err) {
        res.status(500).send('Alert HTML not found');
        return;
      }
      // Inject <base> so relative paths (./alert-engine.js) resolve correctly
      // when the page is served at /overlay/alert (no trailing slash).
      const injected = html.replace(
        '<head>',
        '<head><base href="/overlay/alert/">',
      );
      res.status(200).send(injected);
    });
  }

  private serveOverlayHtml(groupId: string, res: Response): void {
    res.setHeader('Content-Type', 'text/html; charset=utf-8');
    fs.readFile(this.overlayHtmlPath, 'utf-8', (err, html) => {
      if (err) {
        res.status(500).send('Overlay HTML not found');
        return;
      }
      const injected = html.replace(
        '<head>',
        `<head><script>window.__GROUP_ID__=${JSON.stringify(groupId)};</script>`,
      );
      res.status(200).send(injected);
    });
  }

  private handleConnection(ws: WebSocket): void {
    const client: ConnectedClient = { socket: ws, groupId: null };

    ws.on('message', (raw) => {
      let msg: ClientInbound;
      try {
        msg = JSON.parse(raw.toString()) as ClientInbound;
      } catch {
        return;
      }

      if (msg.type === 'register') {
        const { groupId } = msg as RegisterMessage;
        if (typeof groupId !== 'string' || !groupId) return;

        // Add this socket to the group's client set (multiple clients per group allowed).
        let set = this.groupClients.get(groupId);
        if (!set) { set = new Set(); this.groupClients.set(groupId, set); }
        set.add(ws);
        client.groupId = groupId;
        if (groupId === ALERT_GROUP_ID) {
          alertLogger.log('ws', 'alert client registered', { totalAlertClients: set.size });
        }
        return;
      }

      if (msg.type === 'playback_ended') {
        const gid = client.groupId;
        if (!gid) return;
        const pending = this.pendingPlaybacks.get(gid);
        if (pending) {
          clearTimeout(pending.timer);
          this.pendingPlaybacks.delete(gid);
          pending.resolve();
        }
      }
    });

    ws.on('close', () => {
      if (client.groupId) {
        const set = this.groupClients.get(client.groupId);
        if (set) {
          set.delete(ws);
          if (client.groupId === ALERT_GROUP_ID) {
            alertLogger.log('ws', 'alert client disconnected', { remainingAlertClients: set.size });
          }
          if (set.size === 0) this.groupClients.delete(client.groupId);
        }
      }
    });

    ws.on('error', () => { /* handled by close */ });
  }
}
