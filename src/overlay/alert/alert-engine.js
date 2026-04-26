/* =============================================================
   FOLLOWER ALERT — ANIMATION ENGINE (rev2, simplified)
   Десантник: спускается → лутает 2-3 предмета → убегает за экран
   ============================================================= */
(function () {
'use strict';

// ========= STAGE SCALING =========
const stage = document.getElementById('stage');
function fitStage() {
  const sx = window.innerWidth / 1920, sy = window.innerHeight / 1080;
  const s = Math.min(sx, sy);
  stage.style.transform = `scale(${s})`;
  stage.style.left = ((window.innerWidth - 1920 * s) / 2) + 'px';
  stage.style.top = ((window.innerHeight - 1080 * s) / 2) + 'px';
}
window.addEventListener('resize', fitStage);
fitStage();

// ========= CONST =========
const STAGE_W = 1920, STAGE_H = 1080, GROUND_Y = 920;
const HERO_W = 280, HERO_H = 380, HERO_SCALE = 0.55;
const HERO_RENDER_H = HERO_H * HERO_SCALE;
const HERO_RENDER_W = HERO_W * HERO_SCALE;

// ========= REFS =========
const hero = document.getElementById('hero');
const heroSvg = document.getElementById('hero-svg');
const parachute = document.getElementById('parachute');
const armLeft = document.getElementById('arm-left');
const armRight = document.getElementById('arm-right');
const legLeft = document.getElementById('leg-left');
const legRight = document.getElementById('leg-right');
const head = document.getElementById('head');
const torso = document.getElementById('torso');
const bodyG = document.getElementById('body');       // SVG <g> — для flip
const surprise = document.getElementById('surprise');
const dust = document.getElementById('dust');
const bubble = document.getElementById('bubble');
const bubbleNick = document.getElementById('bubble-nick');
const lootContainer = document.getElementById('loot-container');
const hint = document.getElementById('hint');

hero.style.transformOrigin = 'top left';

// ========= UTILS =========
const rand = (a, b) => a + Math.random() * (b - a);
const choice = arr => arr[Math.floor(Math.random() * arr.length)];
const sleep = ms => new Promise(r => setTimeout(r, ms));
const lerp = (a, b, t) => a + (b - a) * t;
const easeInOut = t => t < 0.5 ? 2 * t * t : 1 - Math.pow(-2 * t + 2, 2) / 2;
const easeOutCubic = t => 1 - Math.pow(1 - t, 3);
const easeInCubic = t => t * t * t;

// Speed multiplier — set via window.__ALERT_SPEED__ before the engine runs,
// or updated at runtime via applyAlertConfig({ animationSpeed: 1.5 }).
let _speed = (window.__ALERT_SPEED__ != null ? window.__ALERT_SPEED__ : 1.0);
const dur = ms => Math.round(ms / _speed);

function animate({ duration, ease = easeInOut, onUpdate, onComplete }) {
  return new Promise(resolve => {
    const start = performance.now();
    let done = false;
    function tick() {
      if (done) return;
      const now = performance.now();
      const t = Math.min(1, (now - start) / duration);
      onUpdate(ease(t), t);
      if (t < 1) {
        if (typeof requestAnimationFrame === 'function') requestAnimationFrame(tick);
        else setTimeout(tick, 16);
      } else {
        done = true;
        onComplete && onComplete();
        resolve();
      }
    }
    // первый тик сразу
    tick();
  });
}

// ========= LOOT =========
const LOOT_TYPES = {
  chest: `<svg viewBox="0 0 110 110">
    <g stroke="#fff" stroke-width="14" fill="#fff" stroke-linejoin="round">
      <rect x="18" y="42" width="74" height="48" rx="4"/>
      <path d="M 18 42 Q 18 22 55 22 Q 92 22 92 42 Z"/></g>
    <rect x="18" y="42" width="74" height="48" rx="4" fill="#a06a32" stroke="#000" stroke-width="5"/>
    <path d="M 18 42 Q 18 22 55 22 Q 92 22 92 42 Z" fill="#c4853f" stroke="#000" stroke-width="5" stroke-linejoin="round"/>
    <rect x="48" y="38" width="14" height="16" rx="2" fill="#ffd84d" stroke="#000" stroke-width="4"/>
    <circle cx="55" cy="46" r="2.5" fill="#000"/>
    <rect x="22" y="44" width="4" height="46" fill="#5a3815" opacity="0.6"/>
    <rect x="84" y="44" width="4" height="46" fill="#5a3815" opacity="0.6"/>
    <path d="M 30 28 L 32 22 M 38 28 L 36 22 M 70 28 L 72 22" stroke="#ffd84d" stroke-width="3" stroke-linecap="round"/>
  </svg>`,
  medkit: `<svg viewBox="0 0 110 110">
    <g stroke="#fff" stroke-width="14" fill="#fff" stroke-linejoin="round">
      <rect x="18" y="32" width="74" height="62" rx="6"/>
      <rect x="42" y="22" width="26" height="14" rx="3"/></g>
    <rect x="42" y="22" width="26" height="14" rx="3" fill="#e8e2d2" stroke="#000" stroke-width="5"/>
    <rect x="18" y="32" width="74" height="62" rx="6" fill="#fff8e7" stroke="#000" stroke-width="5"/>
    <rect x="42" y="48" width="26" height="32" rx="2" fill="#e63946" stroke="#000" stroke-width="4"/>
    <rect x="34" y="56" width="42" height="16" rx="2" fill="#e63946" stroke="#000" stroke-width="4"/>
  </svg>`,
  ammo: `<svg viewBox="0 0 110 110">
    <g stroke="#fff" stroke-width="14" fill="#fff" stroke-linejoin="round">
      <rect x="22" y="34" width="66" height="58" rx="4"/>
      <rect x="30" y="26" width="50" height="12" rx="2"/></g>
    <rect x="30" y="26" width="50" height="12" rx="2" fill="#3a4a1f" stroke="#000" stroke-width="5"/>
    <rect x="22" y="34" width="66" height="58" rx="4" fill="#5a6d2a" stroke="#000" stroke-width="5"/>
    <rect x="28" y="40" width="6" height="8" fill="#3a4a1f" stroke="#000" stroke-width="3"/>
    <rect x="76" y="40" width="6" height="8" fill="#3a4a1f" stroke="#000" stroke-width="3"/>
    <text x="55" y="74" font-family="Impact, sans-serif" font-size="16" font-weight="900"
          text-anchor="middle" fill="#ffd84d" stroke="#000" stroke-width="3" paint-order="stroke fill">AMMO</text>
  </svg>`
};

// ========= STATE =========
let isPlaying = false;
const queue = [];
let bodyFlip = 1;     // 1 = смотрит вправо, -1 = влево

// ========= TRANSFORMS =========
// Позиция героя: cx — горизонтальный центр, footY — где ноги (низ SVG)
function placeHero(cx, footY, opts = {}) {
  const flip = opts.flip != null ? opts.flip : bodyFlip;
  const extraY = opts.extraY || 0;
  const sy = opts.scaleY || 1;
  // Центр героя в SVG-координатах = HERO_W/2. После scale → HERO_RENDER_W/2.
  const left = cx - HERO_RENDER_W / 2;
  const top = footY - HERO_RENDER_H + extraY;
  hero.style.transform = `translate(${left}px, ${top}px) scale(${HERO_SCALE * flip}, ${HERO_SCALE * sy})`;
  hero.style.transformOrigin = 'top left';
}

function placeBubble(cx, headY, opacity = 1, scale = 1) {
  const left = cx - 210, top = headY - 200;
  bubble.style.transform = `translate(${left}px, ${top}px) scale(${scale})`;
  bubble.style.transformOrigin = '210px 180px';
  bubble.style.opacity = opacity;
}

function hideHero() {
  hero.style.transform = 'translate(-9999px, -9999px)';
}
function hideBubble() {
  bubble.style.transform = 'translate(-9999px, -9999px)';
  bubble.style.opacity = '0';
}

// ========= LOOT SPAWN =========
function spawnLoot(types) {
  lootContainer.innerHTML = '';
  const n = types.length, segments = [];
  for (let i = 0; i < n; i++) segments.push((STAGE_W / (n + 1)) * (i + 1) + rand(-100, 100));
  segments.sort(() => Math.random() - 0.5);
  return segments.map((x, i) => {
    const el = document.createElement('div');
    el.className = 'loot';
    el.innerHTML = LOOT_TYPES[types[i]];
    const px = Math.max(80, Math.min(STAGE_W - 80, x));
    el.style.left = (px - 55) + 'px';
    el.style.top = (GROUND_Y - 90) + 'px';
    el.style.transform = `scale(0.7) rotate(${rand(-12, 12)}deg)`;
    el.style.opacity = '1';
    lootContainer.appendChild(el);
    return { el, x: px, y: GROUND_Y };
  });
}

// ========= ANIMATION PIECES =========
let swayId = 0;
function startSway() {
  const id = ++swayId, t0 = performance.now();
  function frame(now) {
    if (id !== swayId) return;
    const t = (now - t0) / 1000;
    heroSvg.style.transform = `rotate(${Math.sin(t * 1.4) * 5}deg)`;
    heroSvg.style.transformOrigin = '140px 70px';
    requestAnimationFrame(frame);
  }
  requestAnimationFrame(frame);
}
function stopSway() { swayId++; heroSvg.style.transform = ''; }

async function descend(landX) {
  parachute.style.display = '';
  parachute.style.opacity = '1';
  parachute.style.transform = '';
  bodyFlip = 1;
  armLeft.style.transform = 'rotate(-25deg)';
  armLeft.style.transformOrigin = '88px 250px';
  armRight.style.transform = 'rotate(25deg)';
  armRight.style.transformOrigin = '188px 250px';

  startSway();
  sfx.parachute();

  const startY = -200, endY = GROUND_Y;
  await animate({
    duration: dur(4200), ease: easeInOut,
    onUpdate: (e, t) => {
      const y = lerp(startY, endY, e);
      const wind = Math.sin(t * Math.PI * 2.5) * 25 * (1 - t * 0.6);
      placeHero(landX + wind, y);
    }
  });
  stopSway();
  armLeft.style.transform = '';
  armRight.style.transform = '';
}

async function land(landX) {
  // приседание
  placeHero(landX, GROUND_Y, { extraY: 10, scaleY: 0.92 });
  // пыль
  dust.style.left = (landX - 70) + 'px';
  dust.style.top = (GROUND_Y - 30) + 'px';
  dust.style.opacity = '1';
  dust.style.transform = 'scale(0.5)';
  sfx.land();
  animate({
    duration: dur(700), ease: easeOutCubic,
    onUpdate: e => {
      dust.style.transform = `scale(${0.5 + e * 0.9})`;
      dust.style.opacity = (1 - e).toString();
    }
  });
  await sleep(dur(180));
  placeHero(landX, GROUND_Y);
  // парашют отлетает
  parachute.style.transition = `transform ${dur(700)}ms cubic-bezier(.2,.8,.4,1), opacity ${dur(700)}ms`;
  parachute.style.transformOrigin = '140px 70px';
  parachute.style.transform = 'translate(40px, -180px) rotate(28deg)';
  parachute.style.opacity = '0';
  await sleep(dur(650));
  parachute.style.display = 'none';
  parachute.style.transition = '';
}

async function walkTo(fromX, toX, durMs) {
  const dir = toX > fromX ? 1 : -1;
  bodyFlip = dir;
  let walking = true;
  const t0 = performance.now();
  function walkFrame() {
    if (!walking) return;
    const tt = (performance.now() - t0) / 130;
    legLeft.style.transformOrigin = '121px 295px';
    legRight.style.transformOrigin = '159px 295px';
    legLeft.style.transform = `rotate(${Math.sin(tt) * 22}deg)`;
    legRight.style.transform = `rotate(${Math.sin(tt + Math.PI) * 22}deg)`;
    armLeft.style.transformOrigin = '88px 250px';
    armRight.style.transformOrigin = '188px 250px';
    armLeft.style.transform = `rotate(${Math.sin(tt + Math.PI) * 18}deg)`;
    armRight.style.transform = `rotate(${Math.sin(tt) * 18}deg)`;
    requestAnimationFrame(walkFrame);
  }
  requestAnimationFrame(walkFrame);
  sfx.steps(durMs, false);

  await animate({
    duration: durMs, ease: easeInOut,
    onUpdate: e => {
      const x = lerp(fromX, toX, e);
      const bob = Math.abs(Math.sin(e * Math.PI * 4)) * 5;
      placeHero(x, GROUND_Y - bob);
    }
  });
  walking = false;
  legLeft.style.transform = '';
  legRight.style.transform = '';
  armLeft.style.transform = '';
  armRight.style.transform = '';
}

async function pickUp(loot, currentX) {
  surprise.setAttribute('opacity', '1');
  sfx.pickup();

  await animate({
    duration: dur(380), ease: easeOutCubic,
    onUpdate: e => {
      head.style.transformOrigin = '140px 220px';
      head.style.transform = `rotate(${e * 15}deg)`;
      armRight.style.transformOrigin = '188px 250px';
      armRight.style.transform = `rotate(${-e * 80}deg)`;
      placeHero(currentX, GROUND_Y, { extraY: e * 10 });
      loot.el.style.transform = `scale(${0.7 - e * 0.3}) rotate(${e * 360}deg)`;
      loot.el.style.opacity = (1 - e * 0.4).toString();
    }
  });

  await animate({
    duration: dur(280), ease: easeInCubic,
    onUpdate: e => {
      loot.el.style.opacity = (0.6 - e * 0.6).toString();
      loot.el.style.transform = `scale(${0.4 - e * 0.4}) translateY(-${e * 30}px)`;
    }
  });
  loot.el.remove();

  const backpack = document.getElementById('backpack');
  if (backpack) {
    backpack.style.transition = `transform ${dur(200)}ms`;
    backpack.style.transformOrigin = '103px 272px';
    backpack.style.transform = 'scale(1.2)';
    setTimeout(() => { backpack.style.transform = ''; setTimeout(() => backpack.style.transition = '', dur(200)); }, dur(200));
  }

  await animate({
    duration: dur(280), ease: easeOutCubic,
    onUpdate: e => {
      head.style.transform = `rotate(${(1 - e) * 15}deg)`;
      armRight.style.transform = `rotate(${(-1 + e) * 80}deg)`;
      placeHero(currentX, GROUND_Y, { extraY: (1 - e) * 10 });
    }
  });
  head.style.transform = '';
  armRight.style.transform = '';
  surprise.setAttribute('opacity', '0');
}

async function runOff(fromX, dir, headY) {
  const targetX = dir > 0 ? STAGE_W + 250 : -250;
  bodyFlip = dir;
  let running = true;
  const t0 = performance.now();
  function runFrame() {
    if (!running) return;
    const tt = (performance.now() - t0) / 70;
    legLeft.style.transformOrigin = '121px 295px';
    legRight.style.transformOrigin = '159px 295px';
    legLeft.style.transform = `rotate(${Math.sin(tt) * 50}deg)`;
    legRight.style.transform = `rotate(${Math.sin(tt + Math.PI) * 50}deg)`;
    armLeft.style.transformOrigin = '88px 250px';
    armRight.style.transformOrigin = '188px 250px';
    armLeft.style.transform = `rotate(${Math.sin(tt + Math.PI) * 45}deg)`;
    armRight.style.transform = `rotate(${Math.sin(tt) * 45}deg)`;
    head.style.transformOrigin = '140px 220px';
    head.style.transform = `rotate(8deg)`;
    requestAnimationFrame(runFrame);
  }
  requestAnimationFrame(runFrame);
  sfx.steps(dur(1300), true);

  await animate({
    duration: dur(1300), ease: easeInCubic,
    onUpdate: e => {
      const x = lerp(fromX, targetX, e);
      const bob = Math.abs(Math.sin(e * Math.PI * 12)) * 9;
      placeHero(x, GROUND_Y - bob);
      placeBubble(x, headY, 1 - e);
    }
  });
  running = false;
  bubble.style.opacity = '0';
}

async function showBubble(nick, x, headY) {
  bubbleNick.textContent = (nick || 'NICKNAME').toUpperCase();
  // авто-подгонка
  const cfgSize = window.__ALERT_CONFIG__ && window.__ALERT_CONFIG__.nickFontSize ? window.__ALERT_CONFIG__.nickFontSize : 52;
  bubbleNick.setAttribute('font-size', cfgSize);
  try {
    const w = bubbleNick.getComputedTextLength();
    if (w > 360) bubbleNick.setAttribute('font-size', Math.floor(cfgSize * 360 / w));
  } catch (e) {}

  placeBubble(x, headY, 0, 0.6);
  await animate({
    duration: dur(350), ease: easeOutCubic,
    onUpdate: e => placeBubble(x, headY - (1 - e) * 20, e, 0.6 + e * 0.4)
  });
}

// ========= MAIN =========
async function playAlert(nick) {
  if (hint) hint.classList.add('hide');
  isPlaying = true;
  updateQueueStatus();
  try {
    // reset
    parachute.style.display = '';
    parachute.style.opacity = '1';
    parachute.style.transform = '';
    head.style.transform = '';
    bodyG.style.transform = '';
    armLeft.style.transform = ''; armRight.style.transform = '';
    legLeft.style.transform = ''; legRight.style.transform = '';
    bubble.style.opacity = '0';

    const landX = rand(STAGE_W * 0.18, STAGE_W * 0.82);
    const allTypes = ['chest', 'medkit', 'ammo'];
    const lootCount = Math.random() < 0.5 ? 2 : 3;
    const pool = [...allTypes];
    const lootTypes = [];
    for (let i = 0; i < lootCount; i++) {
      lootTypes.push(pool.length ? pool.splice(Math.floor(Math.random() * pool.length), 1)[0] : choice(allTypes));
    }
    const loots = spawnLoot(lootTypes);

    await descend(landX);
    const headY = GROUND_Y - HERO_RENDER_H + 30;
    showBubble(nick, landX, headY);
    await land(landX);

    let currentX = landX;
    loots.sort((a, b) => Math.abs(a.x - currentX) - Math.abs(b.x - currentX));
    for (const loot of loots) {
      const dist = Math.abs(loot.x - currentX);
      const walkDur = Math.max(dur(500), dur(350) + dist * 1.4);
      // обновляем бабл по ходу
      let updating = true;
      (function track() {
        if (!updating) return;
        const r = hero.getBoundingClientRect();
        // вычислим cx в координатах сцены
        const stageRect = stage.getBoundingClientRect();
        const scale = stageRect.width / STAGE_W || 1;
        const cx = (r.left + r.width / 2 - stageRect.left) / scale;
        placeBubble(cx, headY, 1);
        requestAnimationFrame(track);
      })();
      await walkTo(currentX, loot.x, walkDur);
      updating = false;
      placeBubble(loot.x, headY, 1);
      await pickUp(loot, loot.x);
      currentX = loot.x;
      await sleep(dur(120));
    }

    const runDir = Math.random() < 0.5 ? -1 : 1;
    await runOff(currentX, runDir, headY);

    hideHero();
    hideBubble();
  } catch (err) {
    console.error('[alert] error:', err);
  } finally {
    isPlaying = false;
    updateQueueStatus();
    if (queue.length > 0) {
      const next = queue.shift();
      updateQueueStatus();
      setTimeout(() => playAlert(next), dur(400));
    }
  }
}

// ========= API =========
function fireFollowerAlert(nick) {
  nick = (nick || 'AnonGuest').toString().slice(0, 25);
  if (isPlaying) {
    queue.push(nick);
    updateQueueStatus();
    return { queued: true, position: queue.length };
  }
  playAlert(nick);
  return { queued: false };
}
function clearQueue() { queue.length = 0; updateQueueStatus(); }
function updateQueueStatus() {
  const el = document.getElementById('queue-status');
  if (el) el.textContent = `queue: ${queue.length} · ${isPlaying ? 'playing' : 'idle'}`;
}

// ========= CONFIG APPLY =========
function applyAlertConfig(cfg) {
  if (!cfg) return;
  if (cfg.nickColor) {
    bubbleNick.setAttribute('fill', cfg.nickColor);
    bubbleNick.style.fill = cfg.nickColor;
  }
  if (cfg.nickFontSize) {
    bubbleNick.setAttribute('font-size', cfg.nickFontSize);
  }
  if (cfg.subtitleText != null) {
    const subEl = document.getElementById('bubble-sub');
    if (subEl) subEl.textContent = cfg.subtitleText;
  }
  if (cfg.animationSpeed != null && cfg.animationSpeed > 0) {
    _speed = cfg.animationSpeed;
  }
}
window.applyAlertConfig = applyAlertConfig;

// Apply initial config from server injection
if (window.__ALERT_CONFIG__) applyAlertConfig(window.__ALERT_CONFIG__);

// ========= SOUND =========
const sfx = (function () {
  let ctx = null;
  function ensure() { if (!ctx) try { ctx = new (window.AudioContext || window.webkitAudioContext)(); } catch (e) { return null; } return ctx; }
  return {
    parachute() {
      const c = ensure(); if (!c) return;
      const t0 = c.currentTime, duration = 4.0;
      const buf = c.createBuffer(1, c.sampleRate * duration, c.sampleRate);
      const d = buf.getChannelData(0);
      for (let i = 0; i < d.length; i++) d[i] = Math.random() * 2 - 1;
      const src = c.createBufferSource(); src.buffer = buf;
      const f = c.createBiquadFilter(); f.type = 'bandpass';
      f.frequency.setValueAtTime(1800, t0);
      f.frequency.exponentialRampToValueAtTime(400, t0 + duration);
      f.Q.value = 4;
      const g = c.createGain();
      g.gain.setValueAtTime(0, t0);
      g.gain.linearRampToValueAtTime(0.05, t0 + 0.4);
      g.gain.linearRampToValueAtTime(0, t0 + duration);
      src.connect(f).connect(g).connect(c.destination);
      src.start(t0); src.stop(t0 + duration);
    },
    land() {
      const c = ensure(); if (!c) return;
      const t0 = c.currentTime;
      const o = c.createOscillator(); o.type = 'sine';
      o.frequency.setValueAtTime(120, t0);
      o.frequency.exponentialRampToValueAtTime(40, t0 + 0.25);
      const g = c.createGain();
      g.gain.setValueAtTime(0, t0);
      g.gain.linearRampToValueAtTime(0.4, t0 + 0.02);
      g.gain.linearRampToValueAtTime(0, t0 + 0.3);
      o.connect(g).connect(c.destination);
      o.start(t0); o.stop(t0 + 0.3);
      const buf = c.createBuffer(1, c.sampleRate * 0.3, c.sampleRate);
      const d = buf.getChannelData(0);
      for (let i = 0; i < d.length; i++) d[i] = (Math.random() * 2 - 1) * (1 - i / d.length);
      const src = c.createBufferSource(); src.buffer = buf;
      const f = c.createBiquadFilter(); f.type = 'lowpass'; f.frequency.value = 800;
      const gn = c.createGain(); gn.gain.value = 0.25;
      src.connect(f).connect(gn).connect(c.destination);
      src.start(t0);
    },
    steps(durMs, fast) {
      const c = ensure(); if (!c) return;
      const interval = fast ? 0.14 : 0.22;
      const count = Math.floor((durMs / 1000) / interval);
      for (let i = 0; i < count; i++) {
        const t = c.currentTime + i * interval;
        const buf = c.createBuffer(1, c.sampleRate * 0.08, c.sampleRate);
        const d = buf.getChannelData(0);
        for (let j = 0; j < d.length; j++) d[j] = (Math.random() * 2 - 1) * (1 - j / d.length);
        const src = c.createBufferSource(); src.buffer = buf;
        const f = c.createBiquadFilter(); f.type = 'lowpass'; f.frequency.value = 600;
        const g = c.createGain(); g.gain.value = 0.12;
        src.connect(f).connect(g).connect(c.destination);
        src.start(t);
      }
    },
    pickup() {
      const c = ensure(); if (!c) return;
      const t0 = c.currentTime;
      [880, 1320, 1760].forEach((f, i) => {
        const o = c.createOscillator(); o.type = 'triangle';
        o.frequency.setValueAtTime(f, t0 + i * 0.06);
        const g = c.createGain();
        g.gain.setValueAtTime(0, t0 + i * 0.06);
        g.gain.linearRampToValueAtTime(0.12, t0 + i * 0.06 + 0.01);
        g.gain.linearRampToValueAtTime(0, t0 + i * 0.06 + 0.12);
        o.connect(g).connect(c.destination);
        o.start(t0 + i * 0.06); o.stop(t0 + i * 0.06 + 0.13);
      });
    }
  };
})();

// ========= TEST PANEL =========
const params = new URLSearchParams(location.search);
if (params.has('test') || params.has('debug')) document.getElementById('test-panel').classList.add('visible');
if (params.has('bg')) document.body.classList.add('with-bg');

document.getElementById('test-fire').addEventListener('click', () => {
  fireFollowerAlert(document.getElementById('test-nick').value || 'TestUser');
});
document.getElementById('test-multi').addEventListener('click', () => {
  ['Vasyan_228', 'NagibatorXXL', 'Лысый_Бог'].forEach(n => fireFollowerAlert(n));
});
document.getElementById('test-clear').addEventListener('click', clearQueue);

// ========= EXPORT =========
window.fireFollowerAlert = fireFollowerAlert;
window.clearAlertQueue = clearQueue;
window.__alertDebug = {
  state: () => ({ isPlaying, queue: [...queue] }),
  reset: () => { isPlaying = false; queue.length = 0; hideHero(); hideBubble(); },
  placeHero
};

// hide initially
hideHero();
hideBubble();

console.log('[alert] engine ready. window.fireFollowerAlert("nick")');
})();
