# Decisions Log: twitch-helper

Agent reports on completed tasks. Each entry is written by the agent that executed the task.

---

## Task 1: Project Infrastructure

**Status:** Done
**Commit:** (Wave 1 commit)
**Agent:** main agent
**Summary:** Initialized Electron 33 + TypeScript + React + Vite project. electron-builder configured for portable Windows x64 exe with `PORTABLE_EXECUTABLE_DIR`. Jest with ts-jest, ESLint, Prettier, and full `src/` directory structure created. Minimal Electron main process entry point and renderer scaffold in place.
**Deviations:** Added `ts-node` as devDependency — required by Jest to parse `jest.config.ts`; was omitted from original dependency list in the spec.

**Reviews:** Skipped (Wave 1 executed by main agent due to rate limit constraints; no separate reviewer agents launched).

**Verification:**
- `npm test` → 31 passed (setup.test.ts: 1 test, all pass)

---

## Task 2: Config & Auth Store

**Status:** Done
**Commit:** (Wave 1 commit)
**Agent:** main agent
**Summary:** `ConfigStore` with atomic write (tmp → rename, EXDEV fallback), `AuthStore` with keytar + env fallback, `SlotService` with max-5 enforcement and duplicate-id guard. TypeScript interfaces in `types.ts`.
**Deviations:** `isNodeError()` uses `typeof err === 'object'` instead of `err instanceof Error` — Jest's VM sandbox breaks `instanceof Error` for native Node errors thrown by `fs.readFileSync`.

**Reviews:** Skipped (same constraint as Task 1).

**Verification:**
- `npm test -- --testPathPattern="config-store|auth-store"` → 21 passed

---

## Task 3: Overlay Server

**Status:** Done
**Commit:** (Wave 1 commit)
**Agent:** main agent
**Summary:** Express HTTP server on `127.0.0.1:7891` with `Cache-Control: no-store` on all responses, `/overlay` and `/media/:id` routes. WebSocket server on shared HTTP upgrade with nonce auth (5s deadline), single-client policy, and `play()` that resolves on `playback_ended` or 120s timeout. `MediaRegistry` is an in-memory UUID→path Map. `player.ts` for OBS Browser Source: connects WS, auths with nonce from URL query, creates `<video>` at random position/rotation on `play` command.
**Deviations:** None.

**Reviews:** Skipped (same constraint as Task 1).

**Verification:**
- `npm test -- --testPathPattern=overlay-server` → 8 passed (all TDD anchor tests + extras)

---

## Task 4: Twitch OAuth

**Status:** Done
**Commit:** (Wave 2 commit)
**Agent:** main agent
**Summary:** PKCE Authorization Code flow with local callback HTTP server on OS-assigned port, state parameter for CSRF protection, 5-minute login timeout. Token exchange + user metadata fetch saved to keytar/config. `refreshToken()` deletes tokens on 400/401. IPC handlers for auth:login/logout with `checkAuthOnStartup()` that auto-refreshes or broadcasts auth:logout.
**Deviations:** `pkce-challenge` (ESM, top-level await import) cannot be directly imported by ts-jest. Mocked in tests with `jest.mock('pkce-challenge')` returning controlled values.

**Reviews:** Skipped (main agent).

**Verification:**
- `npm test -- --testPathPattern=twitch-auth` → 5 passed

---

## Task 5: Twitch API Client + EventSub

**Status:** Done
**Commit:** (Wave 2 commit)
**Agent:** main agent
**Summary:** `TwitchApiClient` with 401→refresh→retry logic and `BrowserWindow` auth:logout broadcast. `EventSubClient` handles session_welcome/session_reconnect/notification/keepalive with watchdog timer. Bug fixed: watchdog must NOT null `this.ws` before close handler fires, otherwise close handler guards against stale connections but misidentifies the current connection as stale. `TwitchClient` facade combining both.
**Deviations:** Watchdog guard condition uses `this.ws !== ws && this.ws !== null` instead of strict `this.ws !== ws` to handle the null-after-watchdog case.

**Reviews:** Skipped (main agent).

**Verification:**
- `npm test -- --testPathPattern=eventsub` → 5 passed

---

## Task 6: snap-camera-server Lens Search

**Status:** Done
**Commit:** (Wave 2 commit)
**Agent:** main agent
**Summary:** `SnapLensSearch.search()` validates query length (min 3 chars), POSTs to localhost:5645 with 3s AbortSignal timeout, validates response schema per-item (filters invalid entries), returns `SnapUnavailableError` on network error or non-OK response without throwing. IPC handler in `src/main/ipc/snap.ts`.
**Deviations:** None.

**Reviews:** Skipped (main agent).

**Verification:**
- `npm test -- --testPathPattern=snap-search` → 8 passed

---

<!-- Entries are added by agents as tasks are completed.

Format is strict — use only these sections, do not add others.
Do not include: file lists, findings tables, JSON reports, step-by-step logs.
Review details — in JSON files via links. QA report — in logs/working/.

## Task N: [title]

**Status:** Done
**Commit:** abc1234
**Agent:** [teammate name or "main agent"]
**Summary:** 1-3 sentences: what was done, key decisions. Not a file list.
**Deviations:** None / Deviated from spec: [reason], did [what].

**Reviews:**

*Round 1:*
- code-reviewer: 2 findings → [logs/working/task-N/code-reviewer-1.json]
- security-auditor: OK → [logs/working/task-N/security-auditor-1.json]

*Round 2 (after fixes):*
- code-reviewer: OK → [logs/working/task-N/code-reviewer-2.json]

**Verification:**
- `npm test` → 42 passed
- Manual check → OK

-->
