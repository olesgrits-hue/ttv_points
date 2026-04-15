/**
 * Integration tests for OverlayServer (Task 3 TDD Anchor).
 * Spins up a real HTTP+WS server on a random port so tests don't conflict.
 */

import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';
import * as http from 'http';
import WebSocket from 'ws';
import { OverlayServer } from '../../src/main/overlay/server';

// ---- helpers ----------------------------------------------------------------

function tmpFile(content: Buffer | string, ext = '.mp4'): string {
  const p = path.join(os.tmpdir(), `tw-test-${Date.now()}${ext}`);
  fs.writeFileSync(p, content);
  return p;
}

function cleanup(...paths: string[]): void {
  for (const p of paths) {
    try {
      fs.unlinkSync(p);
    } catch {
      /* ignore */
    }
  }
}

async function httpGet(
  url: string,
): Promise<{ status: number; headers: http.IncomingHttpHeaders; body: Buffer }> {
  return new Promise((resolve, reject) => {
    http
      .get(url, (res) => {
        const chunks: Buffer[] = [];
        res.on('data', (c: Buffer) => chunks.push(c));
        res.on('end', () =>
          resolve({
            status: res.statusCode ?? 0,
            headers: res.headers,
            body: Buffer.concat(chunks),
          }),
        );
      })
      .on('error', reject);
  });
}

function wsUrl(server: OverlayServer): string {
  const addr = server.address();
  if (!addr) throw new Error('server not started');
  return `ws://127.0.0.1:${addr.port}/ws`;
}

function baseUrl(server: OverlayServer): string {
  const addr = server.address();
  if (!addr) throw new Error('server not started');
  return `http://127.0.0.1:${addr.port}`;
}

// ---- test setup -------------------------------------------------------------

let server: OverlayServer;
let overlayHtmlPath: string;

beforeAll(async () => {
  // Create a real overlay HTML file for tests (same as the actual one).
  overlayHtmlPath = path.join(os.tmpdir(), `tw-overlay-${Date.now()}.html`);
  fs.writeFileSync(
    overlayHtmlPath,
    '<!DOCTYPE html><html><body style="background: transparent"></body></html>',
  );

  server = new OverlayServer(overlayHtmlPath);
  await server.start();
});

afterAll(async () => {
  await server.stop();
  cleanup(overlayHtmlPath);
});

// ---- tests ------------------------------------------------------------------

describe('HTTP routes', () => {
  test('get_overlay_returns_200', async () => {
    const res = await httpGet(`${baseUrl(server)}/overlay`);
    expect(res.status).toBe(200);
    expect(res.headers['content-type']).toMatch(/text\/html/);
    expect(res.body.toString()).toContain('background: transparent');
  });

  test('cache_control_no_store', async () => {
    const res = await httpGet(`${baseUrl(server)}/overlay`);
    expect(res.headers['cache-control']).toBe('no-store');
  });

  test('get_media_returns_file', async () => {
    const payload = Buffer.from('fake-video-bytes');
    const filePath = tmpFile(payload, '.mp4');
    try {
      const id = server.registry.register(filePath);
      const res = await httpGet(`${baseUrl(server)}/media/${id}`);
      expect(res.status).toBe(200);
      // Content-Type for .mp4
      expect(res.headers['content-type']).toMatch(/video/);
      expect(res.body).toEqual(payload);
    } finally {
      cleanup(filePath);
    }
  });

  test('get_media_404_after_deregister', async () => {
    const filePath = tmpFile('data', '.mp4');
    try {
      const id = server.registry.register(filePath);
      server.registry.deregister(id);
      const res = await httpGet(`${baseUrl(server)}/media/${id}`);
      expect(res.status).toBe(404);
    } finally {
      cleanup(filePath);
    }
  });

  test('get_media_404_for_unknown_id', async () => {
    const res = await httpGet(`${baseUrl(server)}/media/nonexistent-id`);
    expect(res.status).toBe(404);
  });
});

describe('WebSocket authentication', () => {
  test('ws_authenticated_receives_play', async () => {
    const nonce = server.generateNonce();
    const ws = new WebSocket(wsUrl(server));

    await new Promise<void>((resolve, reject) => {
      ws.once('open', () => ws.send(JSON.stringify({ type: 'auth', nonce })));
      ws.once('error', reject);
      // After auth send a play command from the server side and verify it arrives.
      setTimeout(async () => {
        // Register a temp file so play() has a valid id.
        const filePath = tmpFile('bytes', '.mp4');
        const id = server.registry.register(filePath);

        const playPromise = server.play(id, filePath);

        ws.once('message', (raw: Buffer) => {
          const msg = JSON.parse(raw.toString()) as { type: string; url: string };
          expect(msg.type).toBe('play');
          expect(msg.url).toBe(`/media/${id}`);
          // Respond with playback_ended so play() resolves cleanly.
          ws.send(JSON.stringify({ type: 'playback_ended' }));
        });

        await playPromise;
        server.registry.deregister(id);
        cleanup(filePath);
        ws.close();
        resolve();
      }, 100);
    });
  });

  test('ws_unauthenticated_closed', async () => {
    // Don't set a nonce — any first message without valid auth must close the WS.
    const ws = new WebSocket(wsUrl(server));

    await new Promise<void>((resolve, reject) => {
      ws.once('open', () => ws.send(JSON.stringify({ type: 'hello', nonce: 'wrong' })));
      ws.once('close', (code: number) => {
        expect(code).not.toBe(1000); // not a normal close — server rejected auth
        resolve();
      });
      ws.once('error', reject);
    });
  });

  test('ws_wrong_nonce_closed', async () => {
    server.generateNonce(); // sets a real nonce
    const ws = new WebSocket(wsUrl(server));

    await new Promise<void>((resolve, reject) => {
      ws.once('open', () =>
        ws.send(JSON.stringify({ type: 'auth', nonce: 'totally-wrong-nonce' })),
      );
      ws.once('close', resolve);
      ws.once('error', reject);
    });
  });
});
