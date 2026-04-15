import express, { type Express, type NextFunction, type Request, type Response } from 'express';
import * as http from 'http';
import * as path from 'path';
import * as fs from 'fs';
import { randomBytes } from 'crypto';
import { WebSocketServer, WebSocket } from 'ws';
import { MediaRegistry } from './registry';

/** Host/port are hardcoded per tech-spec Decision 3. */
const HOST = '127.0.0.1';
const PORT = 7891;
const PLAYBACK_TIMEOUT_MS = 120_000;

/** WS message types exchanged with overlay page. */
type AuthMessage = { type: 'auth'; nonce: string };
type PlaybackEndedMessage = { type: 'playback_ended'; id?: string };
type PlayMessage = { type: 'play'; id: string; url: string };
type ClientInbound = AuthMessage | PlaybackEndedMessage;

interface AuthenticatedClient {
  socket: WebSocket;
  authenticated: true;
}

/**
 * Overlay HTTP + WebSocket server. Binds to 127.0.0.1:7891 only (not 0.0.0.0)
 * so the endpoint is not reachable from the LAN. Cache-Control: no-store is
 * set on every response — OBS Chromium aggressively caches Browser Sources.
 */
export class OverlayServer {
  readonly registry = new MediaRegistry();
  private readonly app: Express;
  private readonly httpServer: http.Server;
  private readonly wss: WebSocketServer;
  private currentNonce: string | null = null;
  private authenticatedClient: AuthenticatedClient | null = null;
  private pendingPlayback: {
    id: string;
    resolve: () => void;
    timer: NodeJS.Timeout;
  } | null = null;
  private started = false;

  constructor(
    private readonly overlayHtmlPath: string = path.resolve(__dirname, '../../overlay/index.html'),
  ) {
    this.app = express();
    this.configureRoutes();
    this.httpServer = http.createServer(this.app);
    // noServer=false; attach via shared HTTP server so WS + HTTP share port.
    this.wss = new WebSocketServer({ noServer: true });
    this.httpServer.on('upgrade', (req, socket, head) => {
      // Only accept upgrades for /ws to avoid hijacking other paths later.
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

  /** Start listening. Rejects only if bind fails; callers should log and continue. */
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
    if (this.pendingPlayback) {
      clearTimeout(this.pendingPlayback.timer);
      this.pendingPlayback.resolve();
      this.pendingPlayback = null;
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

  /** Address the server is bound to (undefined until `start()` resolves). */
  address(): { address: string; port: number } | null {
    const addr = this.httpServer.address();
    if (addr === null || typeof addr === 'string') return null;
    return { address: addr.address, port: addr.port };
  }

  /**
   * Generate a fresh nonce for the current overlay session. The overlay page
   * reads this nonce (from the /overlay URL query string or a separate endpoint
   * in higher-level wiring) and echoes it back in an `auth` WS message.
   */
  generateNonce(): string {
    this.currentNonce = randomBytes(32).toString('hex');
    return this.currentNonce;
  }

  /** Current nonce (for tests and for the overlay bootstrap HTML). */
  getNonce(): string | null {
    return this.currentNonce;
  }

  /**
   * Push a play command to the authenticated overlay and wait for
   * `playback_ended` or a 120s timeout. Resolves in either case.
   */
  play(id: string, _filePath: string): Promise<void> {
    if (this.pendingPlayback) {
      return Promise.reject(new Error('OverlayServer.play: another playback is in progress'));
    }
    const client = this.authenticatedClient;
    if (!client || client.socket.readyState !== WebSocket.OPEN) {
      return Promise.reject(new Error('OverlayServer.play: no authenticated overlay client'));
    }
    const msg: PlayMessage = { type: 'play', id, url: `/media/${id}` };

    return new Promise<void>((resolve) => {
      const timer = setTimeout(() => {
        // Timeout path — resolve so MediaAction can fulfill redemption anyway.
        this.pendingPlayback = null;
        resolve();
      }, PLAYBACK_TIMEOUT_MS);

      this.pendingPlayback = { id, resolve, timer };

      try {
        client.socket.send(JSON.stringify(msg));
      } catch (err) {
        clearTimeout(timer);
        this.pendingPlayback = null;
        // Treat send failure as immediate completion rather than throwing — the
        // redemption should still be fulfilled and we log upstream.
        resolve();
      }
    });
  }

  // --- Internal ---------------------------------------------------------

  private configureRoutes(): void {
    // Cache-Control: no-store on every response.
    this.app.use((_req: Request, res: Response, next: NextFunction) => {
      res.setHeader('Cache-Control', 'no-store');
      next();
    });

    this.app.get('/overlay', (_req: Request, res: Response) => {
      res.setHeader('Content-Type', 'text/html; charset=utf-8');
      fs.readFile(this.overlayHtmlPath, 'utf-8', (err, html) => {
        if (err) {
          res.status(500).send('Overlay HTML not found');
          return;
        }
        res.status(200).send(html);
      });
    });

    this.app.get('/media/:id', (req: Request, res: Response) => {
      const id = req.params.id;
      // Reject ids with path separators or traversal markers as defense in depth.
      if (!id || /[\\/]|\.\./.test(id)) {
        res.status(400).end();
        return;
      }
      const filePath = this.registry.resolve(id);
      if (!filePath) {
        res.status(404).end();
        return;
      }
      // sendFile streams and sets Content-Type by extension.
      res.sendFile(path.resolve(filePath), (err) => {
        if (err && !res.headersSent) {
          res.status(404).end();
        }
      });
    });
  }

  private handleConnection(ws: WebSocket): void {
    let authenticated = false;
    const authDeadline = setTimeout(() => {
      if (!authenticated) {
        try {
          ws.close(1008, 'auth timeout');
        } catch {
          /* ignore */
        }
      }
    }, 5_000);

    ws.on('message', (raw) => {
      let msg: ClientInbound;
      try {
        msg = JSON.parse(raw.toString()) as ClientInbound;
      } catch {
        ws.close(1008, 'invalid json');
        return;
      }

      if (!authenticated) {
        if (msg.type !== 'auth' || this.currentNonce === null || msg.nonce !== this.currentNonce) {
          ws.close(1008, 'auth required');
          return;
        }
        authenticated = true;
        clearTimeout(authDeadline);
        // Single overlay client policy: replace any previous client.
        if (this.authenticatedClient && this.authenticatedClient.socket !== ws) {
          try {
            this.authenticatedClient.socket.close(1000, 'replaced');
          } catch {
            /* ignore */
          }
        }
        this.authenticatedClient = { socket: ws, authenticated: true };
        return;
      }

      if (msg.type === 'playback_ended') {
        const pending = this.pendingPlayback;
        if (pending) {
          clearTimeout(pending.timer);
          this.pendingPlayback = null;
          pending.resolve();
        }
      }
    });

    ws.on('close', () => {
      clearTimeout(authDeadline);
      if (this.authenticatedClient && this.authenticatedClient.socket === ws) {
        this.authenticatedClient = null;
      }
    });

    ws.on('error', () => {
      // Swallow — handled by close.
    });
  }
}
