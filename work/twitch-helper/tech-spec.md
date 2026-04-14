---
created: 2026-04-14
status: draft
branch: dev
size: L
---

# Tech Spec: Twitch Helper

## Solution

Portable Electron 33+ (TypeScript) desktop app for Windows. The main process hosts all backend logic: Twitch EventSub WebSocket client, Channel Points API client, FIFO action queue, action handlers (mask via nut-js hotkey, media via WebSocket push), and an Express HTTP+WebSocket server that serves the OBS Browser Source overlay page and streams media files over HTTP. The renderer process (React) renders the settings UI and event log, communicating with the main process via Electron IPC. Config is stored in `config.json` next to the exe; OAuth tokens are stored in Windows Credential Manager via `keytar`.

## Architecture

### What we're building/modifying

- **Electron Main Process** (`src/main/`) — app lifecycle, OAuth callback HTTP server, IPC handlers, bootstraps all backend services
- **Twitch Client** (`src/main/twitch/`) — EventSub WebSocket connection + 60s keepalive watchdog, Channel Points REST API (create/list/fulfill/cancel rewards)
- **FIFO Queue** (`src/main/queue/`) — processes redemption events sequentially, dispatches to action handlers, enforces max 5 active slots
- **Mask Action Handler** (`src/main/actions/mask.ts`) — nut-js global hotkey simulation, 30s timer, remove-mask hotkey, IPC log emit
- **Media Action Handler** (`src/main/actions/media.ts`) — file resolution (specific or random from folder), WebSocket push to overlay with served HTTP media URL, playback_ended await with 120s timeout fallback, IPC log emit
- **Overlay Server** (`src/main/overlay/`) — Express HTTP server on `127.0.0.1:7891`; serves overlay HTML page at `/overlay`; serves media files at `/media/:id` (temp registry keyed by uuid); `ws` WebSocket server for bidirectional messaging (play command → overlay, `playback_ended` ← overlay); WS nonce authentication
- **Overlay Page** (`src/overlay/`) — transparent HTML/JS page for OBS Browser Source; authenticates via nonce; plays video with random position/angle within bounds, fixed size (400×300px); emits `playback_ended`
- **Config Store** (`src/main/store/config.ts`) — typed JSON read/write for `config.json` using `PORTABLE_EXECUTABLE_DIR` (dev fallback: `path.dirname(app.getPath('exe'))`)
- **Auth Store** (`src/main/store/auth.ts`) — stores access/refresh tokens in Windows Credential Manager via `keytar`; non-sensitive metadata (userId, expiresAt, broadcasterId) in `config.json`
- **Renderer UI** (`src/renderer/`) — React app: auth screen, main layout (Snap Camera + Media sections), slot management, event log

### How it works

```
Twitch EventSub WS
  → Main Process receives redemption
  → Queue.enqueue(redemption)
  → Queue processes: lookup slot by rewardId, check enabled, check slots≤5
  → if slot.type === 'mask':
      MaskAction → nut-js hotkey → wait 30s → nut-js removeMaskHotkey
      → fulfill → IPC log(success)
  → if slot.type === 'media'|'meme':
      MediaAction → resolve & validate file path → register in media registry
      → WS push {type:'play', url:'/media/:id', nonce} to Overlay
      → await playback_ended (or 120s timeout)
      → deregister from registry → fulfill → IPC log(success)
  → on any error: cancel → IPC log(error, message)
```

OAuth flow:
```
Renderer "Login" → IPC → Main: start callback HTTP server on OS-assigned port (listen(0))
→ open system browser: Twitch OAuth URL (Authorization Code + PKCE, scopes below)
→ Twitch redirects to localhost:PORT/callback with code
→ Main: exchange code → save tokens to keytar → save metadata to config.json
→ IPC: navigate renderer to main screen
```

Reconnect flow:
```
EventSub WS closes / 60s no messages →
→ TwitchClient emits 'disconnected' → IPC push 'twitch:status' {connected:false}
→ Renderer shows "Соединение потеряно, переподключаюсь..."
→ TwitchClient reconnects, re-subscribes, emits 'connected'
→ IPC push 'twitch:status' {connected:true} → Renderer clears banner
Queue is paused during reconnect, resumes on reconnect (items preserved in memory).
```

Token expiry / 401 at runtime:
```
TwitchClient or SlotService receives 401/403 →
→ Attempt token refresh via refresh token
→ If refresh fails: keytar.deletePassword → IPC 'auth:logout' → Renderer shows auth screen
```

### Shared resources

| Resource | Owner (creates) | Consumers | Instance count |
|----------|----------------|-----------|----------------|
| TwitchClient (EventSub WS + REST) | `main/index.ts` bootstrap | Queue (receives events), SlotService (reward CRUD) | 1 singleton |
| Queue | `main/index.ts` bootstrap | TwitchClient (enqueues), MaskAction, MediaAction (dequeues) | 1 singleton |
| OverlayServer (Express + ws) | `main/index.ts` bootstrap | MediaAction (registers media, pushes play), Overlay page (receives) | 1 singleton |
| ConfigStore | `main/store/config.ts` | SlotService, Queue, all action handlers, AuthStore (metadata) | 1 singleton |

## Decisions

### Decision 1: Electron 33+ as app framework
**Decision:** Electron 33+ with TypeScript and React renderer.
**Rationale:** Supports US requirement for portable Windows desktop app with browser-based overlay. Same Chromium engine as OBS Browser Source — overlay HTML behaves identically. `@nut-tree/nut-js` v4 requires Node.js 18+ (satisfied by Electron 28+). [TECHNICAL]
**Alternatives considered:** Tauri rejected — requires native rebuild for keyboard simulation, smaller ecosystem; Python+PyInstaller rejected — slower startup, larger bundle.

### Decision 2: @nut-tree/nut-js v4 for keyboard simulation
**Decision:** `@nut-tree/nut-js` v4.2.0 (free, public npm) for global hotkey simulation.
**Rationale:** Supports US requirement for mask hotkey simulation. v4 is the last freely available version on public npm. Ships prebuilt binaries for common platforms — no `electron-rebuild` step. Hotkey strings (e.g. `"ctrl+shift+1"`) are parsed into Key sequences at runtime.
**Alternatives considered:** v5 rejected — moved to paid private registry; `robotjs` rejected — native C++ module requires rebuild on every Electron version bump.

### Decision 3: Overlay as Express HTTP+WS server (not obs-websocket)
**Decision:** Overlay page served by in-process Express server on `127.0.0.1:7891`, consumed by OBS as Browser Source URL. Media files served at `/media/:id`.
**Rationale:** Supports US requirement for OBS Browser Source overlay. Avoids second Electron BrowserWindow visible on taskbar. OBS Browser Source is isolated Chromium — cannot load `file://` local paths, so media must be served over HTTP by the same server. [TECHNICAL]
**Alternatives considered:** `obs-websocket` v5 rejected — requires OBS plugin installation; `file://` media rejected — blocked by OBS Chromium sandbox.

### Decision 4: keytar for OAuth token storage
**Decision:** Access and refresh tokens stored in Windows Credential Manager via `keytar`. Non-sensitive metadata (userId, expiresAt, broadcasterId) stored in `config.json`.
**Rationale:** Supports US requirement for persistent auth. Refresh token grants permanent channel management access — plaintext storage is unsafe for a portable app that may end up in cloud-synced folders. User approved this in tech-spec clarification.
**Alternatives considered:** Plaintext `auth.json` rejected — unacceptable if app folder is synced to Dropbox/OneDrive.

### Decision 5: PORTABLE_EXECUTABLE_DIR for config path
**Decision:** Use `process.env.PORTABLE_EXECUTABLE_DIR` as base path for `config.json`. Dev fallback: `path.dirname(app.getPath('exe'))`.
**Rationale:** Supports US portability requirement (settings survive exe replacement). `app.getPath('exe')` returns a temp extraction dir at runtime for portable builds — incorrect. `PORTABLE_EXECUTABLE_DIR` is the actual directory where `.exe` lives.

### Decision 6: Lens selection via snap-camera-server search
**Decision:** Mask slot config uses `POST http://localhost:5645/vc/v1/explorer/search` (min 3 chars, debounced) to search lenses by name.
**Rationale:** snap-camera-server has no `getAllLenses()` endpoint. Search API returns up to 250 results and covers imported lenses. User approved this UX.
**Alternatives considered:** Full lens list rejected — endpoint doesn't exist; `GET /vc/v1/explorer/top` rejected — small static set, misses user's imported lenses.

### Decision 7: only_manageable_rewards=true for reward filtering
**Decision:** `GET /helix/channel_points/custom_rewards?only_manageable_rewards=true` to list rewards. `UpdateRedemptionStatus` restricted to rewards owned by app's `client_id`.
**Rationale:** Supports US requirement that "existing reward selection shows only manageable rewards." Technical necessity: Twitch returns 403 for fulfill/cancel on foreign rewards — not a UX choice.

### Decision 8: Global remove-mask hotkey in config
**Decision:** Single global "Remove mask hotkey" field in config, applied after every mask's 30s timer. Not per-slot.
**Rationale:** Snap Camera has one "no filter" state. User sets its hotkey once rather than repeating it for every mask slot. User approved 30s mask duration + removal in user-spec. [TECHNICAL per user-spec deviation below]

### Decision 9: Electron security hardening
**Decision:** `contextIsolation: true`, `sandbox: true`, `nodeIntegration: false` in BrowserWindow config. All IPC inputs validated in main process.
**Rationale:** Prevents compromised renderer (XSS, supply chain) from accessing Node.js APIs or passing crafted file paths into main process. [TECHNICAL]

## Data Models

```typescript
// config.json (stored at PORTABLE_EXECUTABLE_DIR/config.json)
interface Config {
  slots: Slot[];            // max 5 items enforced by SlotService
  removeMaskHotkey: string; // e.g. "ctrl+shift+0" — Snap Camera "no filter" hotkey
  // auth metadata (non-sensitive)
  userId?: string;
  broadcasterId?: string;
  tokenExpiresAt?: string;  // ISO 8601
}

type Slot = MaskSlot | MediaSlot | MemeSlot;

interface BaseSlot {
  id: string;           // uuid
  type: 'mask' | 'media' | 'meme';
  enabled: boolean;
  rewardId: string;     // Twitch reward ID (owned by this app's client_id)
  rewardTitle: string;  // display name
}

interface MaskSlot extends BaseSlot {
  type: 'mask';
  lensId: string;       // snap-camera-server lens ID
  lensName: string;     // display name
  hotkey: string;       // e.g. "ctrl+shift+1" — parsed to nut-js Key sequence
}

interface MediaSlot extends BaseSlot {
  type: 'media';
  filePath: string;     // absolute Windows path — validated before use
}

interface MemeSlot extends BaseSlot {
  type: 'meme';
  folderPath: string;   // absolute Windows path — validated before use
}
```

```typescript
// keytar service/account keys
// service: "twitch-helper", account: "access_token"  → accessToken string
// service: "twitch-helper", account: "refresh_token" → refreshToken string
```

```typescript
// Event log entry (in-memory only, not persisted)
interface LogEntry {
  id: string;
  timestamp: Date;
  viewerName: string;
  rewardTitle: string;
  status: 'success' | 'error';
  errorMessage?: string;
}

// Media registry (in-memory, OverlayServer)
interface MediaRegistryEntry {
  id: string;       // uuid — used in /media/:id URL
  filePath: string; // validated absolute path
}
```

## Dependencies

### New packages
- `electron` v33+ — desktop app framework (Chromium + Node.js)
- `react` + `react-dom` — renderer UI
- `@nut-tree/nut-js` v4.2.0 — keyboard hotkey simulation (prebuilt binaries, free npm)
- `keytar` — Windows Credential Manager access for OAuth token storage
- `express` — HTTP server for overlay page + media file serving
- `ws` — WebSocket server (overlay push/receive) and client (Twitch EventSub)
- `electron-builder` — portable `.exe` build
- `pkce-challenge` — PKCE code verifier/challenge for OAuth
- `uuid` — slot IDs, log entry IDs, media registry IDs
- `vite` + `@vitejs/plugin-react` — renderer and overlay page bundling

### Using existing (from project)
- None (new project)

## Testing Strategy

**Feature size:** L

### Unit tests
- `Queue`: FIFO order, max-5-slots enforcement (6th enqueue returns error), disabled-slot redemption triggers cancel (no action fires), error propagation
- `MaskAction`: full sequence with fake timers — mask hotkey fires → `advanceTimersByTime(30000)` → remove-mask hotkey fires → fulfill called in order; cancel on nut-js error
- `MediaAction`: specific file resolved; random file from non-empty folder; empty folder triggers cancel+refund; 120s timeout triggers fulfill when overlay WS disconnected; path traversal attempt (`../../../etc`) blocked by validation
- `ConfigStore`: read/write round-trip; missing file returns defaults; corrupt JSON returns defaults; slot count ≥6 rejected
- `TwitchClient` (mocked WS): EventSub message parsing; reconnect fires re-subscribe with new session_id; 60s keepalive watchdog closes and reopens connection; 401 response triggers token refresh attempt; failed refresh emits `auth:logout`
- `AuthStore`: token save/read via keytar mock; expired token detected on startup → `auth:logout` IPC before any API call
- `HotkeyParser`: valid combos (e.g. `"ctrl+shift+1"`); empty string → error; unknown key name → error

### Integration tests
- Overlay HTTP server: `GET http://localhost:7891/overlay` → 200, `Content-Type: text/html`, body contains `background: transparent` (supertest)
- Overlay media serving: register file → `GET /media/:id` → 200, correct Content-Type, file bytes served
- Overlay WebSocket: connect with valid nonce → send `{type:'play', url, nonce}` → client receives; send `{type:'playback_ended'}` → server resolves promise
- WS unauthenticated: connect without nonce → first non-auth message → server closes connection
- Twitch EventSub flow: connect → receive `session_welcome` → subscription POST fires within 10s (Twitch CLI: `twitch event trigger channel-points-custom-reward-redemption-add`)
- Config round-trip: save 5 slots → restart ConfigStore instance → all slots restored

### E2E tests
None — agreed with user (requires real stream + OBS, excessive for personal tool).

## Agent Verification Plan

**Source:** user-spec "Как проверить" section.

### Verification approach
Agent verifies server-side logic and API contracts without a running stream. UI, Snap Camera hotkeys, and OBS integration are verified manually by the user.

### Tools required
- `bash` — run test suite, start overlay server, check config files
- `curl` — test overlay HTTP and media endpoints
- Twitch CLI — simulate channel point redemption events (`twitch event trigger`)

## Risks

| Risk | Mitigation |
|------|-----------|
| nut-js v4 prebuilt binary missing for Electron version | Pin Electron + nut-js versions; `Verify-smoke` in Task 8 confirms binary loads |
| snap-camera-server not running at lens search time | Show inline error "snap-camera-server not found at localhost:5645" with setup link |
| Twitch EventSub keepalive missed (no message 60s) | 60s watchdog closes and reconnects; queue pauses and resumes transparently |
| OAuth callback port conflict (listen(0)) | OS assigns free port; callback URL updated dynamically in PKCE state |
| keytar unavailable in dev environment | Fallback to env var `TWITCH_HELPER_ACCESS_TOKEN` in dev mode only |
| OBS caches overlay page | `Cache-Control: no-store` header on all overlay server responses |
| Media file deleted between config save and redemption | MediaAction validates path at execution time; cancel+refund+red log on failure |

## User-Spec Deviations

- **Lens selection UX:** user-spec says "выбирает линзу из списка snap-camera-server", tech-spec implements search-on-type (min 3 chars) instead of a full list. Reason: snap-camera-server has no getAllLenses endpoint. → [APPROVED BY USER]
- **OBS integration via Browser Source URL (Decision 3):** user-spec implies a URL the user copies to OBS; tech-spec delivers this via Express HTTP server (not obs-websocket plugin). Reason: obs-websocket requires plugin install; Browser Source URL is simpler. → [APPROVED BY USER — user confirmed Browser Source approach in user-spec interview]
- **Global remove-mask hotkey (Decision 8):** user-spec describes per-redemption mask removal after 30s; tech-spec implements this via a single global "remove mask hotkey" config field shared across all mask slots. Reason: Snap Camera has one "no filter" state. → [APPROVED BY USER — 30s removal behaviour confirmed in user-spec interview]

## Acceptance Criteria

- [ ] All unit and integration tests pass (`npm test`)
- [ ] `config.json` written to `PORTABLE_EXECUTABLE_DIR` (not temp dir)
- [ ] OAuth tokens stored in Windows Credential Manager (keytar), not in plaintext file
- [ ] `GET http://127.0.0.1:7891/overlay` → 200, `background: transparent` in body
- [ ] `GET http://127.0.0.1:7891/media/:id` → 200 for registered file, 404 after deregister
- [ ] EventSub subscription POST fires within 10s of WebSocket connect (Twitch CLI test)
- [ ] Queue processes items strictly FIFO; 6th slot rejected with error
- [ ] MaskAction fires remove-mask hotkey after exactly 30s (fake timers unit test)
- [ ] MediaAction cancels on empty folder (unit test)
- [ ] 120s timeout triggers fulfill when overlay WS disconnected (unit test)
- [ ] Path traversal attempt in filePath blocked before file is served
- [ ] Overlay WS rejects unauthenticated connections (integration test)
- [ ] Electron BrowserWindow: `contextIsolation: true`, `sandbox: true`, `nodeIntegration: false`

## Implementation Tasks

### Wave 1 (независимые)

#### Task 1: Project Infrastructure
- **Description:** Initialize Electron 33+ + TypeScript + React project with Vite for renderer and overlay pages. Configure electron-builder for portable `.exe` target. Set up Jest for unit/integration tests, ESLint + Prettier, and folder structure (`src/main/`, `src/renderer/`, `src/overlay/`).
- **Skill:** infrastructure-setup
- **Reviewers:** code-reviewer, security-auditor, infrastructure-reviewer
- **Verify-smoke:** `npm run build` → produces portable `.exe` in `dist/`; `npm test` → test runner starts (0 tests, no failures)
- **Files to modify:** `package.json`, `electron-builder.config.js`, `vite.config.ts`, `tsconfig.json`, `.gitignore`

#### Task 2: Config & Auth Store
- **Description:** Typed JSON store for `config.json` using `PORTABLE_EXECUTABLE_DIR` (dev fallback: `path.dirname(app.getPath('exe'))`). `keytar`-backed `AuthStore` for access/refresh tokens; non-sensitive metadata in `config.json`. `SlotService` enforces max 5 slots.
- **Skill:** code-writing
- **Reviewers:** code-reviewer, security-auditor, test-reviewer
- **Files to modify:** `src/main/store/config.ts`, `src/main/store/auth.ts`, `src/main/store/types.ts`, `src/main/slots/service.ts`

#### Task 3: Overlay Server
- **Description:** Express HTTP server on `127.0.0.1:7891` with `Cache-Control: no-store`. Serves transparent overlay page at `GET /overlay` and media files at `GET /media/:id` via in-memory registry. `ws` WebSocket server with nonce authentication; handles `play` commands and `playback_ended` messages. Overlay page renders video at random position/angle, fixed 400×300px size, transparent background.
- **Skill:** code-writing
- **Reviewers:** code-reviewer, security-auditor, test-reviewer
- **Verify-smoke:** `curl http://127.0.0.1:7891/overlay` → HTML with `background: transparent`
- **Files to modify:** `src/main/overlay/server.ts`, `src/main/overlay/registry.ts`, `src/overlay/index.html`, `src/overlay/player.ts`

### Wave 2 (зависит от Wave 1)

#### Task 4: Twitch OAuth
- **Description:** Authorization Code + PKCE flow. On login: start callback HTTP server on OS-assigned port, open system browser to Twitch auth URL (scopes: `channel:read:redemptions`, `channel:manage:redemptions`), receive callback, exchange code for tokens, save via `AuthStore`. On startup: validate token expiry, attempt refresh if expired, emit `auth:logout` IPC if refresh fails.
- **Skill:** code-writing
- **Reviewers:** code-reviewer, security-auditor, test-reviewer
- **Verify-smoke:** `node -e "const {createServer} = require('http'); const s = createServer(); s.listen(0, () => { console.log(s.address().port); s.close(); })"` → prints assigned port (confirms OS-port allocation works)
- **Verify-user:** Click login → browser opens Twitch auth page → authorize → app shows main screen
- **Files to modify:** `src/main/twitch/auth.ts`, `src/main/ipc/auth.ts`
- **Files to read:** `src/main/store/auth.ts`

#### Task 5: Twitch API Client + EventSub
- **Description:** REST client for Channel Points API (create reward with cooldown, list via `only_manageable_rewards=true`, fulfill/cancel). EventSub WebSocket client per Decisions 6–7: connect, subscribe after `session_welcome`, handle `session_reconnect`, 60s keepalive watchdog, 401 triggers refresh/logout. Emits `twitch:status` IPC on connect/disconnect.
- **Skill:** code-writing
- **Reviewers:** code-reviewer, security-auditor, test-reviewer
- **Verify-smoke:** Integration test with Twitch CLI: `twitch event trigger channel-points-custom-reward-redemption-add` → event received by client
- **Files to modify:** `src/main/twitch/api.ts`, `src/main/twitch/eventsub.ts`, `src/main/twitch/client.ts`
- **Files to read:** `src/main/store/auth.ts`

#### Task 6: snap-camera-server Lens Search
- **Description:** HTTP client for `POST http://localhost:5645/vc/v1/explorer/search` per Decision 6. Debounced search (min 3 chars). Validates response schema before writing lens data to config. Returns structured error when snap-camera-server is unreachable.
- **Skill:** code-writing
- **Reviewers:** code-reviewer, test-reviewer
- **Verify-smoke:** `curl -X POST http://localhost:5645/vc/v1/explorer/search -H 'Content-Type: application/json' -d '{"query":"test","offset":0,"limit":10}'` → JSON array (requires snap-camera-server running)
- **Files to modify:** `src/main/snap/search.ts`

### Wave 3 (зависит от Wave 2)

#### Task 7: FIFO Queue & Action Dispatcher
- **Description:** Sequential async queue processing redemptions one at a time. Looks up slot by `rewardId`, checks `enabled` flag, dispatches to `MaskAction` or `MediaAction`. On disabled slot or lookup miss: calls `cancelRedemption` and emits error log entry. Queue pauses on Twitch disconnect and resumes on reconnect.
- **Skill:** code-writing
- **Reviewers:** code-reviewer, test-reviewer
- **Files to modify:** `src/main/queue/index.ts`, `src/main/queue/dispatcher.ts`
- **Files to read:** `src/main/store/config.ts`, `src/main/twitch/client.ts`

#### Task 8: Mask Action Handler
- **Description:** Parses hotkey string (e.g. `"ctrl+shift+1"`) into nut-js Key sequence. Simulates apply-mask hotkey, waits 30s, simulates global remove-mask hotkey from config. Calls `fulfillRedemption` on success, `cancelRedemption` on error. Emits log entry via IPC.
- **Skill:** code-writing
- **Reviewers:** code-reviewer, test-reviewer
- **Verify-smoke:** `node -e "const {keyboard} = require('@nut-tree/nut-js'); console.log(typeof keyboard.type)"` → prints `function` (confirms nut-js binary loads in Node context)
- **Files to modify:** `src/main/actions/mask.ts`, `src/main/actions/hotkey-parser.ts`
- **Files to read:** `src/main/store/config.ts`, `src/main/twitch/api.ts`

#### Task 9: Media Action Handler
- **Description:** Resolves file path (direct for `media`; random from folder for `meme`; errors on empty/missing folder). Validates resolved path against configured base path (blocks traversal). Registers file in `OverlayServer` media registry, pushes `play` command via WebSocket, awaits `playback_ended` or 120s timeout. Deregisters file, calls fulfill/cancel, emits log entry.
- **Skill:** code-writing
- **Reviewers:** code-reviewer, security-auditor, test-reviewer
- **Files to modify:** `src/main/actions/media.ts`
- **Files to read:** `src/main/overlay/server.ts`, `src/main/overlay/registry.ts`, `src/main/twitch/api.ts`

### Wave 4 (зависит от Wave 2, параллельно с Wave 3)

#### Task 10: Main UI — Auth Screen, Layout, Event Log
- **Description:** React renderer with Electron security flags (`contextIsolation: true`, `sandbox: true`, `nodeIntegration: false`). Auth screen (Twitch login button → IPC). Main screen: Snap Camera section, Media section, OBS URL text (`http://127.0.0.1:7891/overlay`), connection status banner (subscribes to `twitch:status` IPC). Event log: time/viewer/reward/status icon, error tooltip on hover.
- **Skill:** code-writing
- **Reviewers:** code-reviewer, test-reviewer
- **Verify-user:** Run app in dev → auth screen renders; after mock auth IPC → main screen with sections, OBS URL, and log visible
- **Files to modify:** `src/renderer/App.tsx`, `src/renderer/screens/AuthScreen.tsx`, `src/renderer/screens/MainScreen.tsx`, `src/renderer/components/EventLog.tsx`, `src/main/window.ts`

### Wave 5 (зависит от Wave 4)

#### Task 11: Slot Management UI
- **Description:** Slot creation/deletion/toggle flows. Form: type picker, reward selector (list from Twitch API or create-new form with name/cost/cooldown), type-specific fields — lens search with inline results + hotkey input + Snap Camera tooltip for Mask; file/folder picker dialogs for Media/Meme. Saves via IPC to `ConfigStore`. Toggle sends IPC enable/disable.
- **Skill:** code-writing
- **Reviewers:** code-reviewer, security-auditor, test-reviewer
- **Verify-user:** Add Meme slot → select folder → slot appears with toggle; disable slot → toggle shows disabled; delete slot → removed from list
- **Files to modify:** `src/renderer/components/SlotCard.tsx`, `src/renderer/components/SlotForm.tsx`, `src/renderer/components/LensSearch.tsx`
- **Files to read:** `src/renderer/screens/MainScreen.tsx`, `src/main/ipc/slots.ts`

### Audit Wave

#### Task 12: Code Audit
- **Description:** Full-feature code quality audit. Read all source files created in this feature. Review holistically: singleton lifecycle, IPC contract consistency, error propagation from actions through queue to log, TypeScript strictness, shared resource usage per Architecture decisions. Write audit report.
- **Skill:** code-reviewing
- **Reviewers:** none

#### Task 13: Security Audit
- **Description:** Full-feature security audit across all components. Focus: OAuth token storage (keytar usage), file path validation in MediaAction, WebSocket nonce enforcement, IPC input validation in main process, Electron BrowserWindow security flags, overlay server binding to 127.0.0.1. Write audit report.
- **Skill:** security-auditor
- **Reviewers:** none

#### Task 14: Test Audit
- **Description:** Full-feature test quality audit. Verify: MaskAction fake-timer sequence completeness, TwitchClient reconnect re-subscribe assertion, disabled-slot cancel flow, token expiry/refresh unit tests, keepalive watchdog test. Write audit report.
- **Skill:** test-master
- **Reviewers:** none

### Final Wave

#### Task 15: Pre-deploy QA
- **Description:** Acceptance testing: run full test suite (`npm test`), verify acceptance criteria from user-spec and tech-spec. Check config.json path (PORTABLE_EXECUTABLE_DIR), overlay HTTP endpoint, media serving endpoint, EventSub integration test with Twitch CLI, Electron security flags in built app.
- **Skill:** pre-deploy-qa
- **Reviewers:** none
