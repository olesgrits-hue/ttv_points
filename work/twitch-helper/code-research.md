# Code Research: Twitch Helper

Date: 2026-04-13

This is a new project with no existing codebase. Research covers external APIs and library choices only.

---

## 1. snap-camera-server Local API

### Server Ports (from example.env)

| Variable | Default |
|---|---|
| `APP_LOCAL_PORT` | 5645 |
| `BRIDGE_LOCAL_PORT` | 3000 |
| `NGINX_LOCAL_PORT` | 80 |
| `ADMINER_LOCAL_PORT` | 8080 |

Snap Camera client connects through Nginx on port 80/443, which proxies to the app on port 5645. For local API calls from twitch-helper, use `http://localhost:5645` (or whatever port the user has configured).

### Explorer Endpoints

All explorer endpoints are mounted under `/vc/v1/explorer/`. Source: `src/endpoints/explorer/`.

#### `POST /vc/v1/explorer/lenses`
- **Purpose:** Look up specific lenses by ID.
- **Request body:** `{ "lenses": [id1, id2, ...] }` — array of integer lens IDs, max 250.
- **Response:** `{ "lenses": [...] }` — array of lens objects.
- **Note:** This is a lookup by known IDs, not a "list all" endpoint.

#### `POST /vc/v1/explorer/search`
- **Purpose:** Search lenses by name/tag.
- **Request body:** `{ "query": "string" }` — minimum 3 characters.
- **Response:** `{ "lenses": [...] }` — up to 250 results from local DB + optional relay/web sources.
- **Special:** Hashtag queries (`#tag`) only search local DB, skip relay/web.

#### `GET /vc/v1/explorer/top`
- **Purpose:** Returns top/popular lenses from a static `top.json` file.
- **Query params:** `country`, `limit`, `offset` (country and limit extracted but not used in handler logic).
- **Response:** `{}` when offset exceeds array length, otherwise modified lens objects.

#### `GET /vc/v1/explorer/categories`
#### `GET /vc/v1/explorer/categorylenses`
#### `GET /vc/v1/explorer/scheduled`

These files exist per the DeepWiki architecture doc but their exact signatures were not retrieved.

### Database Functions (src/utils/db.js)

Exported functions relevant to lenses:

- `searchLensByName(query)` — wildcard name/display_name match, max 250 results
- `searchLensByTags(pattern)` — regex tag match, max 250 results
- `searchLensByUuid(uuid)` — single lens by UUID
- `getMultipleLenses(ids[])` — batch fetch by unlock IDs
- `getSingleLens(id)` — single lens by unlock ID

**Critical finding: There is no "list all lenses" endpoint or DB function.** The DB layer has no `getAllLenses()` or equivalent. The `/vc/v1/explorer/lenses` POST only looks up by known IDs.

### Lens Object Fields

From the `POST /vc/v1/explorer/lenses` response, each lens object contains at minimum:
- `unlockable_id` — integer, the lens ID used in hotkey assignment
- `uuid` — string
- `lens_name` or `name` — display name
- `snapcode_url`, `icon_url`, `thumbnail_media_url` — image assets (URLs get rewritten by `Util.modifyResponseURLs`)

### Practical Approach for Listing Lenses in UI

Since there is no "list all" endpoint, the recommended approach is:

1. **Search by empty/wildcard:** `POST /vc/v1/explorer/search` with a broad query (e.g., a space `" "` or common character). Limited to 250 results.
2. **Top lenses:** `GET /vc/v1/explorer/top` returns whatever is in `top.json`.
3. **Fallback (Variant B from user-spec):** If the API is unavailable or returns no results, fall back to manual lens ID entry in the UI.

---

## 2. nut-js vs robotjs

### Summary Recommendation: `@nut-tree/nut-js`

### nut-js (`@nut-tree/nut-js`)

- **Latest version:** 5.1.1 (as of research date)
- **Node.js requirement:** v22+ (breaking change in 5.0.0)
- **Platform:** Windows 10+, macOS 14+, Linux (X11)
- **Prebuilt binaries:** Yes, included — no node-gyp required for keyboard/mouse use
- **Electron support:** Explicitly listed as a supported integration target
- **electron-rebuild:** Not required when using prebuilt binaries (keyboard-only use case)
- **Maintenance:** Actively maintained, last release May 1, 2024; v5.x series ongoing

**Keyboard API:**
```typescript
import { keyboard, Key } from "@nut-tree/nut-js";

// Press a single key
await keyboard.type(Key.F1);

// Press a hotkey combination (e.g., Ctrl+1)
await keyboard.type(Key.LeftControl, Key.D1);

// Press and hold (for shift-click patterns)
await keyboard.pressKey(Key.LeftShift);
await keyboard.releaseKey(Key.LeftShift);
```

Key enum includes: `F1`–`F12`, `D0`–`D9` (digit keys), `LeftControl`, `LeftAlt`, `LeftShift`, `LeftSuper`, `Enter`, `Escape`, `Space`.

**Compatibility note:** The image-matching plugin (`@nut-tree/template-matcher`) requires OpenCV native bindings and needs electron-rebuild. The **keyboard-only** core does not require this plugin and has no native compilation step.

### robotjs

- **Latest version:** 0.7.0 (released March 2026 — surprisingly recent)
- **Native module:** Yes, requires node-gyp build
- **Electron support:** Documented, requires `@electron/rebuild` after Electron upgrades
- **Maintenance:** Modest activity; 674 commits total, appears low-velocity
- **Third-party prebuilds:** `@todesktop/robotjs-prebuild` exists for Electron-specific use

**Verdict:** robotjs is a native C++ module that must be rebuilt for each Electron ABI. nut-js v5 ships prebuilt binaries for keyboard/mouse with no native compilation needed and explicitly targets Electron. **Use `@nut-tree/nut-js` v5.**

---

## 3. Twitch EventSub WebSocket

### Connection URL

```
wss://eventsub.wss.twitch.tv/ws
wss://eventsub.wss.twitch.tv/ws?keepalive_timeout_seconds=30
```

Valid `keepalive_timeout_seconds` range: 10–600.

### Connection Flow

1. Open WebSocket to the URL above.
2. Immediately receive a `session_welcome` message:
```json
{
  "metadata": { "message_type": "session_welcome", "message_id": "...", "message_timestamp": "..." },
  "payload": {
    "session": { "id": "<SESSION_ID>", "status": "connected", "keepalive_timeout_seconds": 10 }
  }
}
```
3. Extract `payload.session.id` — this is the `session_id` used to subscribe.
4. **Within 10 seconds**, call the Twitch REST API to create subscriptions using this session_id.
5. Do NOT send any messages from client to server — doing so disconnects the client.

### Subscription Types

| Event | Subscription Type |
|---|---|
| Channel point redemption created | `channel.channel_points_custom_reward_redemption.add` |
| Redemption status updated | `channel.channel_points_custom_reward_redemption.update` |

### Required Scope for `channel.channel_points_custom_reward_redemption.add`

- `channel:read:redemptions` (or `channel:manage:redemptions`)
- Condition: `{ "broadcaster_user_id": "<BROADCASTER_ID>" }`

### Subscribe API Call (after getting session_id)

```
POST https://api.twitch.tv/helix/eventsub/subscriptions
Authorization: Bearer <USER_ACCESS_TOKEN>
Client-Id: <CLIENT_ID>

{
  "type": "channel.channel_points_custom_reward_redemption.add",
  "version": "1",
  "condition": { "broadcaster_user_id": "BROADCASTER_USER_ID" },
  "transport": { "method": "websocket", "session_id": "<SESSION_ID>" }
}
```

### Notification Event Payload Fields

When a redemption fires, the `notification` message `payload.event` contains:
- `broadcaster_user_id`, `broadcaster_user_login`, `broadcaster_user_name`
- `user_id`, `user_login`, `user_name` — the viewer who redeemed
- `reward.id`, `reward.title`, `reward.prompt`, `reward.cost`
- `id` — the redemption ID (used in UpdateRedemptionStatus)
- `status` — current status (`UNFULFILLED`, `FULFILLED`, `CANCELED`)
- `user_input` — optional text the viewer entered
- `redeemed_at` — ISO timestamp

### Message Types to Handle

- `session_welcome` — store session_id, trigger subscription creation
- `notification` — process the redemption event
- `session_keepalive` — no action needed, confirms connection alive
- `session_reconnect` — connect to `payload.session.reconnect_url`, keep old connection until new one is established
- `revocation` — subscription was revoked; log and potentially re-subscribe

---

## 4. Electron Portable App

### electron-builder Portable Target

Set target to `"portable"` in `package.json`:
```json
{
  "build": {
    "win": {
      "target": "portable"
    }
  },
  "scripts": {
    "build:portable": "electron-builder --win portable"
  }
}
```

Output: a single self-contained `.exe` file, no installer.

### Getting the EXE Directory at Runtime

When electron-builder creates a portable `.exe`, it extracts to a temp folder on launch. `app.getPath('exe')` and `process.execPath` return the **temp path**, not the original `.exe` location.

electron-builder sets `PORTABLE_EXECUTABLE_FILE` before launching, pointing to the original `.exe`.

Additional env vars set by electron-builder portable:
- `process.env.PORTABLE_EXECUTABLE_FILE` — full path to the `.exe`
- `process.env.PORTABLE_EXECUTABLE_DIR` — directory containing the `.exe`
- `process.env.PORTABLE_EXECUTABLE_APP_FILENAME` — sanitized app name

**Correct implementation:**
```typescript
import { app } from 'electron';
import path from 'path';

function getAppDir(): string {
  if (process.env.PORTABLE_EXECUTABLE_DIR) {
    return process.env.PORTABLE_EXECUTABLE_DIR;
  }
  // Dev mode fallback
  return path.dirname(app.getPath('exe'));
}

const CONFIG_PATH = path.join(getAppDir(), 'config.json');
const AUTH_PATH = path.join(getAppDir(), 'auth.json');
```

### userData Override

By default `app.getPath('userData')` returns `%APPDATA%\AppName` even in portable mode. For a truly portable app, do NOT use `userData` for config/auth — use `getAppDir()` above.

Override userData if needed to prevent any Electron internals from writing to AppData:
```typescript
app.setPath('userData', getAppDir());
```

Call this before `app.on('ready')`.

---

## 5. Twitch Channel Points API

### UpdateRedemptionStatus

```
PATCH https://api.twitch.tv/helix/channel_points/custom_rewards/redemptions
```

**Query parameters:**
- `broadcaster_id` (required) — must match the user ID in the access token
- `reward_id` (required) — the reward's ID
- `id` (required) — the redemption ID(s) to update

**Request body:**
```json
{ "status": "FULFILLED" }
```
or
```json
{ "status": "CANCELED" }
```

**Required scope:** `channel:manage:redemptions` (user access token, not app access token)

**client_id ownership restriction:** The API enforces that only the same `client_id` that created a reward can call `UpdateRedemptionStatus` for redemptions of that reward. If you attempt to fulfill/cancel a reward created by a different app, the API returns a 403 error. This means:
- twitch-helper must create all rewards itself (using its own Twitch app `client_id`)
- The user-spec requirement "При выборе существующей награды — доступны только награды созданные этим приложением" is architecturally mandatory, not just a UX choice

### GetCustomReward — Filtering to Manageable Rewards

```
GET https://api.twitch.tv/helix/channel_points/custom_rewards?broadcaster_id=<ID>&only_manageable_rewards=true
```

- `only_manageable_rewards=true` — returns only rewards created by the same `client_id` as the token's app
- Required scope: `channel:read:redemptions` OR `channel:manage:redemptions`

### CreateCustomReward

```
POST https://api.twitch.tv/helix/channel_points/custom_rewards
```

**Required scope:** `channel:manage:redemptions`

Body fields relevant to the spec:
- `title` (required)
- `cost` (required)
- `is_global_cooldown_enabled` + `global_cooldown_seconds` — cooldown between any redemptions
- `is_max_per_stream_enabled` + `max_per_stream` — max per stream limit
- `is_max_per_user_per_stream_enabled` + `max_per_user_per_stream`

### Auth Flow for Desktop App (OAuth2 Authorization Code + PKCE)

Twitch supports Authorization Code flow. For a desktop app with no server, use PKCE (RFC 7636):

1. **Generate PKCE:** `code_verifier` (random 43–128 char string) + `code_challenge = BASE64URL(SHA256(code_verifier))`
2. **Open browser** to:
```
https://id.twitch.tv/oauth2/authorize
  ?client_id=<CLIENT_ID>
  &redirect_uri=http://localhost:<PORT>
  &response_type=code
  &scope=channel:read:redemptions+channel:manage:redemptions
  &state=<RANDOM_STATE>
  &code_challenge=<CODE_CHALLENGE>
  &code_challenge_method=S256
```
3. **Spin up local HTTP server** on `localhost:<PORT>` to capture the redirect with `?code=...`
4. **Exchange code for tokens:**
```
POST https://id.twitch.tv/oauth2/token
  client_id=<CLIENT_ID>
  &code=<AUTH_CODE>
  &code_verifier=<CODE_VERIFIER>
  &grant_type=authorization_code
  &redirect_uri=http://localhost:<PORT>
```
5. Response: `{ access_token, refresh_token, expires_in, scope, token_type }`
6. **Refresh token** when access token expires:
```
POST https://id.twitch.tv/oauth2/token
  client_id=<CLIENT_ID>
  &grant_type=refresh_token
  &refresh_token=<REFRESH_TOKEN>
```

**Important:** Twitch desktop apps with PKCE do NOT need a `client_secret` for the token exchange when using PKCE — the `code_verifier` serves as the proof. However, Twitch's current API may still require `client_secret` depending on whether the app is registered as "confidential". Recommend registering as a "public" client if Twitch allows it, or storing `client_secret` in a config file (not in source code).

**Redirect URI:** Register `http://localhost` in the Twitch Developer Console. The port can vary — Twitch allows `http://localhost` with any port for loopback redirect URIs.

---

## 6. Constraints and Infrastructure

### New Project — No Existing Code

This is a greenfield Electron app. No existing codebase to integrate with.

### Node.js Version

- `@nut-tree/nut-js` v5 requires Node.js v22+
- Electron 33+ ships with Node 22 — use Electron 33 or newer

### Electron Version

- Electron 33+ recommended for Node 22 compatibility
- electron-builder supported targets: `portable` for Windows

### TypeScript

- Standard Electron + TypeScript setup via `electron-builder` + `ts-node` or `tsc`
- Recommended: `electron-vite` or `electron-forge` with TypeScript template for fast DX

### Dependencies Summary

| Package | Purpose | Notes |
|---|---|---|
| `electron` | App shell + overlay window | v33+ |
| `electron-builder` | Build + portable packaging | `target: "portable"` |
| `@nut-tree/nut-js` | Keyboard hotkey simulation | v5.x, no native rebuild needed for keyboard-only |
| `ws` | WebSocket server (overlay) | Standard; Electron's renderer can use native WebSocket |
| Built-in `http` | Local HTTP server for OAuth redirect + overlay | No extra dep |

### Twitch App Registration

- Register at https://dev.twitch.tv/console
- Add `http://localhost` as redirect URI
- Scopes needed: `channel:read:redemptions`, `channel:manage:redemptions`
- Store `client_id` in app; `client_secret` (if required) in `config.json` or bundled — **not in source**

### File Layout (portable)

```
twitch-helper.exe      (self-contained portable executable)
config.json            (created on first run, slots config)
auth.json              (created on first login, tokens)
```

Both `config.json` and `auth.json` are siblings of the `.exe` — accessible via `PORTABLE_EXECUTABLE_DIR`.
