# Execution Plan: Twitch Helper

**Создан:** 2026-04-14

---

## Wave 1 (независимые)

### Task 1: Project Infrastructure
- **Skill:** infrastructure-setup
- **Reviewers:** code-reviewer, security-auditor, infrastructure-reviewer
- **Verify-smoke:** `npm run build` → portable `.exe` в `dist/`; `npm test` → 0 тестов, no failures

### Task 2: Config & Auth Store
- **Skill:** code-writing
- **Reviewers:** code-reviewer, security-auditor, test-reviewer
- **Verify-smoke:** `node -e "const keytar = require('keytar'); console.log(typeof keytar.getPassword)"` → `function`

### Task 3: Overlay Server
- **Skill:** code-writing
- **Reviewers:** code-reviewer, security-auditor, test-reviewer
- **Verify-smoke:** `curl http://127.0.0.1:7891/overlay` → HTML с `background: transparent`

---

## Wave 2 (зависит от Wave 1)

### Task 4: Twitch OAuth
- **Skill:** code-writing
- **Reviewers:** code-reviewer, security-auditor, test-reviewer
- **Verify-smoke:** OS port allocation works
- **Verify-user:** нажать Login → браузер открывает Twitch auth → авторизоваться → главный экран

### Task 5: Twitch API Client + EventSub
- **Skill:** code-writing
- **Reviewers:** code-reviewer, security-auditor, test-reviewer
- **Verify-smoke:** Twitch CLI: `twitch event trigger channel-points-custom-reward-redemption-add` → событие получено

### Task 6: snap-camera-server Lens Search
- **Skill:** code-writing
- **Reviewers:** code-reviewer, test-reviewer
- **Verify-smoke:** `curl -X POST http://localhost:5645/vc/v1/explorer/search ...` → JSON array

---

## Wave 3 (зависит от Wave 2)

### Task 7: FIFO Queue & Action Dispatcher
- **Skill:** code-writing
- **Reviewers:** code-reviewer, test-reviewer

### Task 8: Mask Action Handler
- **Skill:** code-writing
- **Reviewers:** code-reviewer, test-reviewer
- **Verify-smoke:** `node -e "const robot = require('robotjs'); console.log(typeof robot.keyTap)"` → `function`

### Task 9: Media Action Handler
- **Skill:** code-writing
- **Reviewers:** code-reviewer, security-auditor, test-reviewer

---

## Wave 4 (зависит от Wave 2, параллельно с Wave 3 по зависимостям)

### Task 10: Main UI — Auth Screen, Layout, Event Log
- **Skill:** code-writing
- **Reviewers:** code-reviewer, test-reviewer
- **Verify-user:** запустить в dev → auth screen рендерится; после mock auth IPC → главный экран с секциями, OBS URL, логом

---

## Wave 5 (зависит от Wave 4)

### Task 11: Slot Management UI
- **Skill:** code-writing
- **Reviewers:** code-reviewer, security-auditor, test-reviewer
- **Verify-user:** добавить Meme слот → выбрать папку → слот появляется с toggle; disable → toggle показывает disabled; delete → удалён

---

## Wave 6 — Audit Wave (зависит от Waves 3+4+5)

### Task 12: Code Audit
- **Skill:** code-reviewing
- **Reviewers:** none (аудитор сам является проверкой)

### Task 13: Security Audit
- **Skill:** security-auditor
- **Reviewers:** none

### Task 14: Test Audit
- **Skill:** test-master
- **Reviewers:** none

---

## Wave 7 — Final Wave (зависит от Wave 6)

### Task 15: Pre-deploy QA
- **Skill:** pre-deploy-qa
- **Reviewers:** none

---

## Проверки, требующие участия пользователя

- [ ] **Task 4** (после Wave 2): нажать Login → убедиться что браузер открывает Twitch auth страницу → авторизоваться → приложение показывает главный экран
- [ ] **Task 10** (после Wave 4): запустить приложение → auth screen рендерится корректно; после авторизации → главный экран с двумя секциями, OBS URL, пустым логом
- [ ] **Task 11** (после Wave 5): добавить слот каждого типа (Маска, Медиафайл, Рандомный мем) → убедиться что toggle/delete работают
- [ ] **Финальная проверка** (после Wave 7): войти через Twitch → создать тестовую награду → выкупить с другого аккаунта → убедиться что видео воспроизводится в OBS
