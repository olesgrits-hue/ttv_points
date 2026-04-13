---
created: 2026-04-14
status: draft
branch: dev
size: L
---

# Tech Spec: Twitch Helper

## Solution

Portable Electron 33+ (TypeScript) desktop app for Windows. The main process hosts all backend logic: Twitch EventSub WebSocket client, Channel Points API client, FIFO action queue, action handlers (mask via nut-js hotkey, media via WebSocket push), and an Express HTTP+WebSocket server that serves the OBS Browser Source overlay page. The renderer process (React) renders the settings UI and event log, communicating with the main process via Electron IPC. Config and auth are stored in JSON files next to the exe using `process.env.PORTABLE_EXECUTABLE_DIR`.

## Architecture

### What we're building/modifying

- **Electron Main Process** (`src/main/`) — app lifecycle, OAuth callback HTTP server, IPC handlers, bootstraps all backend services
- **Twitch Client** (`src/main/twitch/`) — EventSub WebSocket connection, Channel Points REST API (create/list/fulfill/cancel rewards)
- **FIFO Queue** (`src/main/queue/`) — processes redemption events sequentially, dispatches to action handlers
- **Mask Action Handler** (`src/main/actions/mask.ts`) — nut-js global hotkey simulation, 30s timer, remove-mask hotkey
- **Media Action Handler** (`src/main/actions/media.ts`) — file resolution (specific or random from folder), WebSocket push to overlay, playback_ended await with 120s timeout fallback
- **Overlay Server** (`src/main/overlay/`) — Express HTTP server (port 7891) serving overlay HTML; ws WebSocket server for push/receive
- **Overlay Page** (`src/overlay/`) — transparent HTML/JS page for OBS Browser Source; plays video with random position/angle/fixed size; emits `playback_ended`
- **Config / Auth Store** (`src/main/store/`) — typed JSON read/write for `config.json` and `auth.json` using `PORTABLE_EXECUTABLE_DIR`
- **Renderer UI** (`src/renderer/`) — React app: auth screen, main layout (Snap Camera + Media sections), slot management, event log

### How it works

```
Twitch EventSub WS
  → Main Process receives redemption
  → Queue.enqueue(redemption)
  → Queue processes: lookup slot by rewardId
  → if slot.type === 'mask':  MaskAction → nut-js hotkey → wait 30s → nut-js removeMask
  → if slot.type === 'media'|'meme': MediaAction → resolve file → WS push to Overlay → await playback_ended (or 120s timeout)
  → Twitch API: fulfill (success) or cancel (error)
  → IPC push to Renderer → EventLog update (green/red)
```

OAuth flow:
```
Renderer clicks "Login" → IPC → Main starts local HTTP server on random port
→ opens system browser to Twitch OAuth URL (PKCE)
→ Twitch redirects to localhost:PORT/callback with code
→ Main exchanges code for token → saves auth.json → IPC to Renderer → navigate to main screen
```

### Shared resources

| Resource | Owner (creates) | Consumers | Instance count |
|----------|----------------|-----------|----------------|
| TwitchClient (EventSub WS + REST) | `main/index.ts` bootstrap | Queue (receives events), SlotService (reward CRUD) | 1 singleton |
| Queue | `main/index.ts` bootstrap | TwitchClient (enqueues), MaskAction, MediaAction (dequeues) | 1 singleton |
| OverlayServer (Express + ws) | `main/index.ts` bootstrap | MediaAction (pushes play commands), Overlay page (receives) | 1 singleton |
| ConfigStore | `main/store/config.ts` | SlotService, Queue, all action handlers | 1 singleton |

## Decisions

### Decision 1: Electron 33+ as app framework
**Decision:** Electron 33+ with TypeScript and React renderer.
**Rationale:** Supports US requirement for portable Windows desktop app with browser-based overlay. Same Chromium engine as OBS Browser Source — overlay HTML behaves identically. Node.js v22+ required for `@nut-tree/nut-js` v5 prebuilt binaries (no rebuild step). [TECHNICAL]
**Alternatives considered:** Tauri (Rust) rejected — requires native rebuild for keyboard simulation, smaller ecosystem; Python+PyInstaller rejected — slower startup, larger bundle without tree-shaking.

### Decision 2: nut-js for keyboard simulation
**Decision:** `@nut-tree/nut-js` v5.1.1 for global hotkey simulation.
**Rationale:** Supports US requirement for mask hotkey simulation. Ships prebuilt binaries — no `electron-rebuild` needed after Electron upgrades. API: `await keyboard.type(Key.LeftControl, Key.D1)`.
**Alternatives considered:** `robotjs` rejected — native C++ module requires rebuild on every Electron version bump; raw `SendInput` via FFI rejected — verbose, Windows-only, no abstraction layer.

### Decision 3: Overlay as Express HTTP+WS, not Electron BrowserWindow
**Decision:** Overlay page served by an in-process Express server on port 7891, consumed by OBS as Browser Source URL.
**Rationale:** Supports US requirement for OBS Browser Source overlay. Avoids creating a second Electron window which would be visible to the user. Transparent HTML served over HTTP is standard for OBS integrations. [TECHNICAL]
**Alternatives considered:** `obs-websocket` v5 rejected — requires OBS plugin installation by user, higher setup friction; Electron BrowserWindow rejected — visible as separate window on taskbar.

### Decision 4: PORTABLE_EXECUTABLE_DIR for file paths
**Decision:** Use `process.env.PORTABLE_EXECUTABLE_DIR` (set by electron-builder portable) as base path for `config.json` and `auth.json`.
**Rationale:** Supports US portability requirement (settings survive exe replacement). `app.getPath('exe')` returns a temp extraction dir at runtime — incorrect for portable apps. `PORTABLE_EXECUTABLE_DIR` is the actual directory where the `.exe` lives.
**Alternatives considered:** `app.getAppPath()` rejected — same temp dir problem; hard-coded `%APPDATA%` rejected — breaks portability.

### Decision 5: Lens selection via snap-camera-server search
**Decision:** Mask slot config uses `POST /vc/v1/explorer/search` (min 3 chars) to search lenses by name. No full lens list — search-on-type UX.
**Rationale:** snap-camera-server has no `getAllLenses()` endpoint. Search API returns up to 250 results. User approved this UX during clarification.
**Alternatives considered:** Full lens list rejected — endpoint doesn't exist; `GET /vc/v1/explorer/top` rejected — returns only a small static set, not user's imported lenses.

### Decision 6: only_manageable_rewards=true for reward filtering
**Decision:** `GET /helix/channel_points/custom_rewards?only_manageable_rewards=true` to list rewards in UI.
**Rationale:** `UpdateRedemptionStatus` (fulfill/cancel) only works on rewards created by the same `client_id` — 403 otherwise. Filtering prevents the user from selecting rewards that would fail silently at redemption time. Supports US requirement that existing reward selection only shows manageable rewards.
**Alternatives considered:** Show all rewards with a warning — rejected because fulfill would silently fail.

### Decision 7: Global remove-mask hotkey in app config
**Decision:** Single global "Remove mask hotkey" setting in config (not per-slot), applied after every mask's 30s timer expires.
**Rationale:** Supports US requirement to simulate mask removal after 30 seconds. One hotkey for Snap Camera's "no filter" state is shared across all mask slots — user sets it once in config rather than per-slot. [TECHNICAL]

## Data Models

```typescript
// config.json
interface Config {
  slots: Slot[];
  removeMaskHotkey: string;       // e.g. "ctrl+shift+0" — Snap Camera "no filter" hotkey
  overlayPort: number;             // default: 7891
  mediaSize: { width: number; height: number }; // default: 400x300
}

type Slot = MaskSlot | MediaSlot | MemeSlot;

interface BaseSlot {
  id: string;           // uuid
  type: 'mask' | 'media' | 'meme';
  enabled: boolean;
  rewardId: string;     // Twitch reward ID
  rewardTitle: string;  // display name
}

interface MaskSlot extends BaseSlot {
  type: 'mask';
  lensId: string;       // snap-camera-server lens ID
  lensName: string;     // display name
  hotkey: string;       // e.g. "ctrl+shift+1"
}

interface MediaSlot extends BaseSlot {
  type: 'media';
  filePath: string;     // absolute path
}

interface MemeSlot extends BaseSlot {
  type: 'meme';
  folderPath: string;   // absolute path
}
```

```typescript
// auth.json
interface AuthData {
  accessToken: string;
  refreshToken: string;
  expiresAt: string;    // ISO 8601
  userId: string;
  broadcasterId: string;
  clientId: string;
}
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
```

## Dependencies

### New packages
- `electron` v33+ — desktop app framework (Chromium + Node.js)
- `react` + `react-dom` — renderer UI
- `@nut-tree/nut-js` v5.1.1 — global keyboard hotkey simulation (prebuilt binaries)
- `express` — HTTP server for overlay page
- `ws` — WebSocket server (overlay push/receive) and client (Twitch EventSub)
- `electron-builder` — portable `.exe` build with `PORTABLE_EXECUTABLE_DIR`
- `pkce-challenge` — PKCE code verifier/challenge generation for OAuth
- `uuid` — slot and log entry IDs
- `vite` + `@vitejs/plugin-react` — renderer and overlay page bundling

### Using existing (from project)
- None (new project)

## Testing Strategy

**Feature size:** L

### Unit tests
- `Queue`: enqueue/dequeue order, concurrent-safe processing, error propagation
- `MaskAction`: hotkey dispatch called, 30s timer fires remove-mask hotkey, fulfill on success, cancel on error
- `MediaAction`: specific file resolved correctly, random file from folder picked, empty folder triggers cancel, 120s timeout fires fulfill
- `ConfigStore`: read/write round-trip, missing file returns defaults, corrupt JSON returns defaults
- `TwitchClient` (unit with mocks): EventSub message parsing, reconnect triggered on close, reward create/fulfill/cancel payloads correct

### Integration tests
- Overlay server: `GET /overlay` returns HTML with transparent background (supertest)
- Overlay WebSocket: push `{type:"play", file:"test.mp4"}` → client receives message (ws test client)
- Overlay playback_ended: server receives `{type:"playback_ended"}` from client → resolves promise
- Twitch EventSub subscription flow: connect → receive session_welcome → POST subscription (using Twitch CLI `twitch event trigger`)
- Config persistence: save config → restart config store → values restored

### E2E tests
None — agreed with user (requires real stream + OBS, excessive for personal tool).

## Agent Verification Plan

**Source:** user-spec "Как проверить" section.

### Verification approach
Agent verifies server-side logic and API contracts without a running stream. UI and Snap Camera integration are verified manually by the user.

### Tools required
- `bash` — start overlay server, run tests, check config files
- `curl` — test overlay HTTP endpoint
- Twitch CLI — simulate channel point redemption events

## Risks

| Risk | Mitigation |
|------|-----------|
| nut-js prebuilt binary missing for target Electron version | Pin Electron version in package.json; verify binary at build time with smoke test |
| snap-camera-server not running when user configures mask slot | Show inline error "snap-camera-server not found at localhost:5645" with setup link |
| Twitch EventSub session expires without reconnect message | Implement keepalive watchdog: if no message for 60s → force reconnect |
| OAuth callback port conflict | Use `server.listen(0)` (OS-assigned port) for callback HTTP server |
| `PORTABLE_EXECUTABLE_DIR` undefined in dev mode | Fallback to `process.cwd()` when env var not set |
| OBS Browser Source caches page — overlay does not update | Add cache-busting headers in Express server (`Cache-Control: no-store`) |

## User-Spec Deviations

- **Lens selection UX:** user-spec says "выбирает линзу из списка snap-camera-server", tech-spec implements search-on-type (min 3 chars) instead of a full list. Reason: snap-camera-server has no getAllLenses endpoint; search API is the only option. → [APPROVED BY USER in tech-spec clarification]

## Acceptance Criteria

- [ ] All unit and integration tests pass (`npm test`)
- [ ] `config.json` and `auth.json` written to `PORTABLE_EXECUTABLE_DIR` (verified by smoke test)
- [ ] Overlay server responds `200` on `GET http://localhost:7891/overlay`
- [ ] Overlay page has `background: transparent` CSS (verified by curl + grep)
- [ ] EventSub subscription POST fires within 10s of WebSocket connect (Twitch CLI integration test)
- [ ] Queue processes items strictly in FIFO order (unit test)
- [ ] MaskAction fires remove-mask hotkey after exactly 30s (unit test with fake timers)
- [ ] MediaAction cancels and refunds on empty folder (unit test)
- [ ] 120s timeout fallback triggers fulfill when overlay WebSocket is disconnected (unit test)

## Implementation Tasks

### Wave 1 (независимые)

#### Task 1: Project Infrastructure
- **Description:** Initialize Electron 33+ + TypeScript + React project with Vite for renderer and overlay pages. Configure electron-builder for portable `.exe` target. Set up Jest for unit/integration tests, ESLint + Prettier, and folder structure (`src/main/`, `src/renderer/`, `src/overlay/`).
- **Skill:** infrastructure-setup
- **Reviewers:** code-reviewer, security-auditor, infrastructure-reviewer
- **Verify-smoke:** `npm run build` → produces portable `.exe` in `dist/`; `npm test` → test runner starts (0 tests, no failures)
- **Files to modify:** `package.json`, `electron-builder.config.js`, `vite.config.ts`, `tsconfig.json`, `.gitignore`

#### Task 2: Config & Auth Store
- **Description:** Implement typed JSON file store for `config.json` and `auth.json` using `PORTABLE_EXECUTABLE_DIR` as base path (falling back to `process.cwd()` in dev). Expose `ConfigStore` and `AuthStore` singletons with read/write/defaults.
- **Skill:** code-writing
- **Reviewers:** code-reviewer, security-auditor, test-reviewer
- **Files to modify:** `src/main/store/config.ts`, `src/main/store/auth.ts`, `src/main/store/types.ts`

#### Task 3: Overlay Server
- **Description:** Express HTTP server on port 7891 serving the transparent overlay HTML page. `ws` WebSocket server on the same port for bidirectional messaging (play commands to overlay, `playback_ended` from overlay). Overlay page renders video with random position/angle within bounds, fixed size (from config), transparent background.
- **Skill:** code-writing
- **Reviewers:** code-reviewer, security-auditor, test-reviewer
- **Verify-smoke:** `curl http://localhost:7891/overlay` → returns HTML containing `background: transparent`
- **Files to modify:** `src/main/overlay/server.ts`, `src/overlay/index.html`, `src/overlay/player.ts`

### Wave 2 (зависит от Wave 1)

#### Task 4: Twitch OAuth
- **Description:** Authorization Code + PKCE flow for Electron desktop app. On login: start local HTTP server on OS-assigned port, open system browser to Twitch auth URL, receive callback with code, exchange for tokens, save to `auth.json`. On startup: validate token, auto-show login screen if expired/invalid.
- **Skill:** code-writing
- **Reviewers:** code-reviewer, security-auditor, test-reviewer
- **Files to modify:** `src/main/twitch/auth.ts`, `src/main/ipc/auth.ts`
- **Files to read:** `src/main/store/auth.ts`

#### Task 5: Twitch API Client (Channel Points + EventSub)
- **Description:** REST client for Channel Points API: create reward (with cooldown), list manageable rewards (`only_manageable_rewards=true`), fulfill/cancel redemption. EventSub WebSocket client: connect to `wss://eventsub.wss.twitch.tv/ws`, subscribe to `channel.channel_points_custom_reward_redemption.add` after `session_welcome`, handle `session_reconnect`, implement 60s keepalive watchdog.
- **Skill:** code-writing
- **Reviewers:** code-reviewer, security-auditor, test-reviewer
- **Verify-smoke:** Integration test with Twitch CLI: `twitch event trigger channel-points-custom-reward-redemption-add` → event received by client
- **Files to modify:** `src/main/twitch/api.ts`, `src/main/twitch/eventsub.ts`, `src/main/twitch/client.ts`
- **Files to read:** `src/main/store/auth.ts`

#### Task 6: snap-camera-server Lens Search
- **Description:** HTTP client for `POST http://localhost:5645/vc/v1/explorer/search`. Used in mask slot config UI: user types lens name (3+ chars) → debounced search → results shown. Gracefully handles server unavailable (show error with setup instructions).
- **Skill:** code-writing
- **Reviewers:** code-reviewer, test-reviewer
- **Verify-smoke:** `curl -X POST http://localhost:5645/vc/v1/explorer/search -H 'Content-Type: application/json' -d '{"query":"test"}'` → JSON response (requires snap-camera-server running)
- **Files to modify:** `src/main/snap/search.ts`

### Wave 3 (зависит от Wave 2)

#### Task 7: FIFO Queue & Action Dispatcher
- **Description:** Sequential async queue that processes channel point redemptions one at a time. On dequeue: look up slot by `rewardId` from config, check slot enabled, dispatch to MaskAction or MediaAction. On action error: catch, log, ensure cancel is called.
- **Skill:** code-writing
- **Reviewers:** code-reviewer, test-reviewer
- **Files to modify:** `src/main/queue/index.ts`, `src/main/queue/dispatcher.ts`
- **Files to read:** `src/main/store/config.ts`, `src/main/twitch/client.ts`

#### Task 8: Mask Action Handler
- **Description:** On execution: simulate mask hotkey via `@nut-tree/nut-js`, wait 30 seconds, simulate global remove-mask hotkey (from config), call fulfill. On any error: call cancel. Parse hotkey strings (e.g. `"ctrl+shift+1"`) into nut-js Key sequences.
- **Skill:** code-writing
- **Reviewers:** code-reviewer, test-reviewer
- **Files to modify:** `src/main/actions/mask.ts`
- **Files to read:** `src/main/store/config.ts`, `src/main/twitch/api.ts`

#### Task 9: Media Action Handler
- **Description:** On execution: resolve file path (direct file for `media` type; random file from folder for `meme` type — error if folder empty or missing). Push `{type:"play", filePath}` to overlay via WebSocket. Await `playback_ended` message or 120s timeout. Call fulfill on completion, cancel on error. Emit log entry via IPC.
- **Skill:** code-writing
- **Reviewers:** code-reviewer, security-auditor, test-reviewer
- **Files to modify:** `src/main/actions/media.ts`
- **Files to read:** `src/main/overlay/server.ts`, `src/main/twitch/api.ts`

### Wave 4 (зависит от Wave 2, параллельно с Wave 3)

#### Task 10: Main UI — Auth, Layout, Event Log
- **Description:** React renderer: auth screen (Twitch login button, triggers IPC); main screen layout (Snap Camera section, Media section, OBS URL text display, connection status indicator); event log list (time/viewer/reward/status icon, error tooltip on hover). IPC subscriptions for log updates and connection status.
- **Skill:** code-writing
- **Reviewers:** code-reviewer, test-reviewer
- **Verify-user:** Run app in dev mode → login screen renders; after mock auth → main screen with two sections and log visible; OBS URL displayed at top
- **Files to modify:** `src/renderer/App.tsx`, `src/renderer/screens/AuthScreen.tsx`, `src/renderer/screens/MainScreen.tsx`, `src/renderer/components/EventLog.tsx`

#### Task 11: Slot Management UI
- **Description:** Add/delete/toggle slot flows in the renderer. Slot creation form: type picker (Mask/Media/Meme), reward selector (list from Twitch API or create new form with name/cost/cooldown), type-specific fields (lens search with inline results for Mask; file/folder picker dialogs for Media/Meme; hotkey input with Snap Camera setup tooltip). Saves via IPC to ConfigStore.
- **Skill:** code-writing
- **Reviewers:** code-reviewer, security-auditor, test-reviewer
- **Verify-user:** Add a Meme slot → select folder → slot appears with toggle; disable slot → toggle shows disabled state; delete slot → slot removed
- **Files to modify:** `src/renderer/components/SlotCard.tsx`, `src/renderer/components/SlotForm.tsx`, `src/renderer/components/LensSearch.tsx`
- **Files to read:** `src/renderer/screens/MainScreen.tsx`

### Audit Wave

#### Task 12: Code Audit
- **Description:** Full-feature code quality audit. Read all source files created in this feature. Review holistically: IPC contract consistency, shared singleton usage, error propagation from actions through queue to log, TypeScript strictness. Write audit report.
- **Skill:** code-reviewing
- **Reviewers:** none

#### Task 13: Security Audit
- **Description:** Full-feature security audit. Focus areas: OAuth token storage in auth.json (no encryption at rest), file path validation in MediaAction (path traversal), WebSocket message validation in overlay server, Twitch API token exposure in IPC messages. Write audit report.
- **Skill:** security-auditor
- **Reviewers:** none

#### Task 14: Test Audit
- **Description:** Full-feature test quality audit. Verify queue FIFO tests, action handler edge cases (empty folder, timeout, cancel flow), integration test coverage for overlay server and EventSub client. Write audit report.
- **Skill:** test-master
- **Reviewers:** none

### Final Wave

#### Task 15: Pre-deploy QA
- **Description:** Acceptance testing: run full test suite (`npm test`), verify all acceptance criteria from user-spec and tech-spec. Check config.json/auth.json paths, overlay HTTP endpoint, EventSub integration test with Twitch CLI.
- **Skill:** pre-deploy-qa
- **Reviewers:** none
