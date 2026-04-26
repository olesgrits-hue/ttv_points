/* FOLLOWER ALERT — engine v3
   Сцена: граната/дым → десант → лут → к точке → ожидание → лестница → подъём
*/
(function () {
'use strict';

const stage = document.getElementById('stage');
function fitStage() {
  const sx = innerWidth / 1920, sy = innerHeight / 1080, s = Math.min(sx, sy);
  stage.style.transform = `scale(${s})`;
  stage.style.left = ((innerWidth - 1920 * s) / 2) + 'px';
  stage.style.top = ((innerHeight - 1080 * s) / 2) + 'px';
}
addEventListener('resize', fitStage); fitStage();

const STAGE_W = 1920, STAGE_H = 1080, GROUND_Y = 940;
const HERO_W = 280, HERO_H = 380, HERO_SCALE = 0.55;
const HERO_RH = HERO_H * HERO_SCALE, HERO_RW = HERO_W * HERO_SCALE;

// Global speed multiplier (1.0 = normal, 2.0 = 2x faster)
let _speedMult = 1.0;

const $ = id => document.getElementById(id);
const hero = $('hero'), heroSvg = $('hero-svg'), parachute = $('parachute');
const armLeft = $('arm-left'), armRight = $('arm-right');
const legLeft = $('leg-left'), legRight = $('leg-right');
const head = $('head'), bodyG = $('body'), surprise = $('surprise');
const headSlot = $('head-slot'), faceSlot = $('face-slot'), torsoSlot = $('torso-slot');
const shadow = $('shadow'), grenade = $('grenade'), smokeC = $('smoke-container');
const rope = $('rope'), rungs = $('rungs');
const status_ = $('status'), nickname = $('nickname');
const lootContainer = $('loot-container'), hint = $('hint');
const eyes = $('eyes'), mouth = $('mouth');

// Лестница: рисуем перекладины
(function buildRungs() {
  let s = '';
  for (let y = 30; y < 1200; y += 60) {
    s += `<line x1="35" y1="${y}" x2="75" y2="${y}" stroke="#5a3d1a" stroke-width="6" stroke-linecap="round"/>`;
  }
  rungs.innerHTML = s;
})();

const rand = (a,b) => a + Math.random() * (b-a);
const choice = a => a[Math.floor(Math.random()*a.length)];
const sleep = ms => new Promise(r => setTimeout(r, ms / _speedMult));
const lerp = (a,b,t) => a + (b-a)*t;
const easeInOut = t => t < 0.5 ? 2*t*t : 1 - Math.pow(-2*t+2, 2)/2;
const easeOut = t => 1 - Math.pow(1-t, 3);
const easeIn = t => t*t*t;

function animate({duration, ease=easeInOut, onUpdate, onComplete}) {
  return new Promise(resolve => {
    const adjusted = duration / _speedMult;
    const start = performance.now();
    let done = false;
    function tick() {
      if (done) return;
      const t = Math.min(1, (performance.now()-start)/adjusted);
      onUpdate(ease(t), t);
      if (t < 1) requestAnimationFrame(tick);
      else { done = true; onComplete && onComplete(); resolve(); }
    }
    tick();
  });
}

// ===== ОДЕЖДА — слоты =====
const HEAD_OPTIONS = [
  // Каска
  () => `<path d="M 96 213 Q 96 173 140 173 Q 184 173 184 213 L 190 220 L 88 220 Z" fill="#4a5d2a" stroke="#000" stroke-width="4" stroke-linejoin="round"/>
    <path d="M 88 217 L 190 217 L 190 222 L 88 222 Z" fill="#2a3818" stroke="#000" stroke-width="2.5"/>
    <ellipse cx="115" cy="195" rx="9" ry="6" fill="#2a3818" opacity="0.7"/>
    <ellipse cx="155" cy="200" rx="11" ry="7" fill="#6b7d3a" opacity="0.8"/>
    <path d="M 140 188 L 143 196 L 151 196 L 145 201 L 147 209 L 140 204 L 133 209 L 135 201 L 129 196 L 137 196 Z" fill="#c41a1a" stroke="#000" stroke-width="1.8" stroke-linejoin="round"/>
    <path d="M 105 220 Q 100 248 113 252" stroke="#000" stroke-width="2.5" fill="none"/>
    <path d="M 184 213 Q 184 195 175 185 Q 188 200 188 218 L 190 222 L 184 222 Z" fill="#000" opacity="0.3"/>`,
  // Кепка
  () => `<path d="M 100 200 Q 102 178 140 178 Q 178 178 180 200 L 180 208 L 100 208 Z" fill="#5a6b32" stroke="#000" stroke-width="4" stroke-linejoin="round"/>
    <path d="M 95 208 L 200 208 Q 200 218 195 222 L 100 222 Q 95 218 95 208 Z" fill="#3a4a1f" stroke="#000" stroke-width="3.5" stroke-linejoin="round"/>
    <path d="M 175 195 Q 180 205 178 208 L 165 208 Q 168 200 175 195 Z" fill="#000" opacity="0.3"/>
    <circle cx="140" cy="190" r="4" fill="#c4a23d" stroke="#000" stroke-width="1.5"/>`,
  // Берет
  () => `<path d="M 100 198 Q 100 175 140 175 Q 180 175 184 196 Q 188 210 168 214 L 110 214 Q 96 210 100 198 Z" fill="#a0241a" stroke="#000" stroke-width="4" stroke-linejoin="round"/>
    <path d="M 178 188 Q 188 200 184 212 Q 178 216 168 214 Q 178 208 178 188 Z" fill="#000" opacity="0.3"/>
    <circle cx="170" cy="186" r="4" fill="#ffd84d" stroke="#000" stroke-width="1.5"/>
    <path d="M 100 214 L 165 214 L 165 220 L 100 220 Z" fill="#1a1a1a" opacity="0.5"/>`,
  // Лысина
  () => `<path d="M 110 198 Q 130 188 150 192" stroke="#000" stroke-width="1.8" fill="none" opacity="0.3"/>`,
  // Бандана
  () => `<path d="M 100 196 Q 102 184 140 184 Q 178 184 180 196 L 184 208 L 96 208 Z" fill="#2a3a1a" stroke="#000" stroke-width="4" stroke-linejoin="round"/>
    <path d="M 180 196 L 200 218 L 188 220 L 178 208 Z" fill="#2a3a1a" stroke="#000" stroke-width="3.5" stroke-linejoin="round"/>
    <circle cx="115" cy="196" r="2" fill="#6b7d3a"/>
    <circle cx="135" cy="200" r="2" fill="#6b7d3a"/>
    <circle cx="160" cy="196" r="2" fill="#6b7d3a"/>`
];

const FACE_OPTIONS = [
  // Борода
  () => `<path d="M 110 232 Q 115 270 140 272 Q 165 270 170 232 Q 165 252 140 254 Q 115 252 110 232 Z" fill="#3d2818" stroke="#000" stroke-width="3" stroke-linejoin="round"/>
    <path d="M 122 232 Q 130 238 138 234 Q 142 234 142 234 Q 150 238 158 232" stroke="#000" stroke-width="2.5" fill="#3d2818"/>`,
  // Усы
  () => `<path d="M 118 234 Q 130 240 140 236 Q 150 240 162 234 Q 158 230 150 232 Q 140 234 130 232 Q 122 230 118 234 Z" fill="#3d2818" stroke="#000" stroke-width="2.5" stroke-linejoin="round"/>`,
  // Чисто выбрит
  () => ``,
  // Тактические очки
  () => `<rect x="112" y="208" width="56" height="14" rx="3" fill="#1a1a1a" stroke="#000" stroke-width="2.5"/>
    <ellipse cx="125" cy="215" rx="9" ry="5" fill="#3a5a8c" opacity="0.85"/>
    <ellipse cx="155" cy="215" rx="9" ry="5" fill="#3a5a8c" opacity="0.85"/>
    <ellipse cx="123" cy="213" rx="3" ry="1.5" fill="#fff" opacity="0.6"/>
    <ellipse cx="153" cy="213" rx="3" ry="1.5" fill="#fff" opacity="0.6"/>
    <line x1="139" y1="215" x2="141" y2="215" stroke="#1a1a1a" stroke-width="2"/>`,
  // Сигара
  () => `<rect x="142" y="240" width="22" height="5" rx="1" fill="#5a3818" stroke="#000" stroke-width="2"/>
    <rect x="160" y="241" width="3" height="3" fill="#ff6622"/>
    <path d="M 168 240 Q 172 232 168 224 Q 174 230 170 238" stroke="#aaa" stroke-width="1.5" fill="none" opacity="0.6"/>`
];

const TORSO_OPTIONS = [
  // Бронежилет
  () => `<rect x="105" y="240" width="70" height="65" rx="6" fill="#4a5d2a" stroke="#000" stroke-width="4"/>
    <rect x="110" y="248" width="60" height="50" rx="4" fill="#3a4a1f" stroke="#000" stroke-width="3"/>
    <rect x="120" y="276" width="18" height="20" rx="1" fill="#5a6d2a" stroke="#000" stroke-width="2"/>
    <rect x="142" y="276" width="18" height="20" rx="1" fill="#5a6d2a" stroke="#000" stroke-width="2"/>
    <rect x="125" y="252" width="6" height="10" fill="#6b7d3a"/>
    <rect x="149" y="252" width="6" height="10" fill="#c41a1a"/>
    <path d="M 168 245 L 168 305 L 175 305 L 175 245 Z" fill="#000" opacity="0.25"/>`,
  // Разгрузка
  () => `<rect x="105" y="240" width="70" height="65" rx="6" fill="#5a6d2a" stroke="#000" stroke-width="4"/>
    <rect x="113" y="252" width="14" height="18" rx="2" fill="#3a4a1f" stroke="#000" stroke-width="2.5"/>
    <rect x="133" y="252" width="14" height="18" rx="2" fill="#3a4a1f" stroke="#000" stroke-width="2.5"/>
    <rect x="153" y="252" width="14" height="18" rx="2" fill="#3a4a1f" stroke="#000" stroke-width="2.5"/>
    <rect x="118" y="278" width="42" height="20" rx="2" fill="#3a4a1f" stroke="#000" stroke-width="2.5"/>
    <path d="M 110 248 L 170 270 M 170 248 L 110 270" stroke="#2a1f0e" stroke-width="2.5"/>
    <path d="M 168 245 L 168 305 L 175 305 L 175 245 Z" fill="#000" opacity="0.25"/>`,
  // Тельняшка
  () => `<rect x="105" y="240" width="70" height="65" rx="6" fill="#fff" stroke="#000" stroke-width="4"/>
    <rect x="105" y="246" width="70" height="6" fill="#1a4a8c"/>
    <rect x="105" y="258" width="70" height="6" fill="#1a4a8c"/>
    <rect x="105" y="270" width="70" height="6" fill="#1a4a8c"/>
    <rect x="105" y="282" width="70" height="6" fill="#1a4a8c"/>
    <rect x="105" y="294" width="70" height="6" fill="#1a4a8c"/>
    <path d="M 168 240 L 175 240 L 175 305 L 168 305 Z" fill="#000" opacity="0.18"/>`,
  // Бомбер
  () => `<rect x="105" y="240" width="70" height="65" rx="8" fill="#3a4a5a" stroke="#000" stroke-width="4"/>
    <rect x="105" y="240" width="70" height="10" rx="6" fill="#2a3a4a" stroke="#000" stroke-width="3"/>
    <rect x="105" y="295" width="70" height="10" rx="4" fill="#2a3a4a" stroke="#000" stroke-width="3"/>
    <line x1="140" y1="250" x2="140" y2="295" stroke="#1a1a1a" stroke-width="2"/>
    <circle cx="140" cy="262" r="2.5" fill="#c4a23d" stroke="#000" stroke-width="1.2"/>
    <circle cx="140" cy="278" r="2.5" fill="#c4a23d" stroke="#000" stroke-width="1.2"/>
    <path d="M 168 245 L 168 305 L 175 305 L 175 245 Z" fill="#000" opacity="0.28"/>`
];

function randomizeOutfit() {
  headSlot.innerHTML = choice(HEAD_OPTIONS)();
  faceSlot.innerHTML = choice(FACE_OPTIONS)();
  torsoSlot.innerHTML = choice(TORSO_OPTIONS)();
}

// ===== ЛУТ =====
const LOOT_TYPES = {
  chest: `<svg viewBox="0 0 110 110">
    <ellipse cx="55" cy="92" rx="38" ry="6" fill="#000" opacity="0.3"/>
    <rect x="18" y="42" width="74" height="48" rx="4" fill="#a06a32" stroke="#000" stroke-width="4"/>
    <path d="M 18 42 Q 18 22 55 22 Q 92 22 92 42 Z" fill="#c4853f" stroke="#000" stroke-width="4" stroke-linejoin="round"/>
    <path d="M 86 26 Q 92 32 92 42 L 84 42 Q 84 32 80 28 Z" fill="#000" opacity="0.25"/>
    <rect x="48" y="38" width="14" height="16" rx="2" fill="#ffd84d" stroke="#000" stroke-width="3"/>
    <circle cx="55" cy="46" r="2.5" fill="#000"/>
    <rect x="22" y="44" width="3" height="46" fill="#5a3815" opacity="0.6"/>
    <rect x="85" y="44" width="3" height="46" fill="#5a3815" opacity="0.6"/>
    <path d="M 30 28 L 32 22 M 38 28 L 36 22 M 70 28 L 72 22" stroke="#ffd84d" stroke-width="2.5" stroke-linecap="round"/>
  </svg>`,
  medkit: `<svg viewBox="0 0 110 110">
    <ellipse cx="55" cy="96" rx="38" ry="6" fill="#000" opacity="0.3"/>
    <rect x="42" y="22" width="26" height="14" rx="3" fill="#e8e2d2" stroke="#000" stroke-width="4"/>
    <rect x="18" y="32" width="74" height="62" rx="6" fill="#fff8e7" stroke="#000" stroke-width="4"/>
    <rect x="84" y="36" width="6" height="56" fill="#000" opacity="0.18"/>
    <rect x="42" y="48" width="26" height="32" rx="2" fill="#e63946" stroke="#000" stroke-width="3"/>
    <rect x="34" y="56" width="42" height="16" rx="2" fill="#e63946" stroke="#000" stroke-width="3"/>
  </svg>`,
  ammo: `<svg viewBox="0 0 110 110">
    <ellipse cx="55" cy="96" rx="38" ry="6" fill="#000" opacity="0.3"/>
    <rect x="30" y="26" width="50" height="12" rx="2" fill="#3a4a1f" stroke="#000" stroke-width="4"/>
    <rect x="22" y="34" width="66" height="58" rx="4" fill="#5a6d2a" stroke="#000" stroke-width="4"/>
    <rect x="80" y="40" width="6" height="48" fill="#000" opacity="0.25"/>
    <text x="55" y="74" font-family="Impact" font-size="16" font-weight="900" text-anchor="middle"
          fill="#ffd84d" stroke="#000" stroke-width="2.5" paint-order="stroke fill">AMMO</text>
  </svg>`
};

let isPlaying = false; const queue = []; let bodyFlip = 1;

function placeHero(cx, footY, opts={}) {
  const flip = opts.flip != null ? opts.flip : bodyFlip;
  const extraY = opts.extraY || 0, sy = opts.scaleY || 1;
  const left = cx - HERO_RW/2, top = footY - HERO_RH + extraY;
  hero.style.transform = `translate(${left}px, ${top}px) scale(${HERO_SCALE*flip}, ${HERO_SCALE*sy})`;
  hero.style.transformOrigin = 'top left';

  if (footY < GROUND_Y - 5) {
    shadow.style.opacity = Math.max(0.2, 1 - (GROUND_Y - footY) / 800);
    const shScale = Math.max(0.4, 1 - (GROUND_Y - footY) / 1500);
    shadow.style.transform = `translate(${cx - 90}px, ${GROUND_Y - 16}px) scale(${shScale}, ${shScale})`;
  } else {
    shadow.style.opacity = 1;
    shadow.style.transform = `translate(${cx - 90}px, ${GROUND_Y - 16}px)`;
  }
}
function hideHero() { hero.style.transform = 'translate(-9999px,-9999px)'; shadow.style.transform='translate(-9999px,-9999px)'; }

function placeStatus(cx, headY, opacity=1) {
  const offX = bodyFlip > 0 ? 80 : -200;
  status_.style.transform = `translate(${cx + offX}px, ${headY - 60}px)`;
  status_.style.opacity = opacity;
}
function setStatus(label) {
  status_.querySelector('.label').textContent = label;
}

function placeNick(cx, headY, opacity=1, scale=1) {
  nickname.style.transform = `translate(${cx - 250}px, ${headY - 130}px) scale(${scale})`;
  nickname.style.transformOrigin = '250px 80px';
  nickname.style.opacity = opacity;
  nickname.style.width = '500px';
  nickname.style.textAlign = 'center';
}
function hideNick() { nickname.style.opacity = '0'; nickname.style.transform='translate(-9999px,-9999px)'; }
function hideStatus() { status_.style.opacity = '0'; }

let dotsTimer = 0;
function startDots() {
  clearInterval(dotsTimer);
  let n = 0;
  status_.querySelector('.dots').textContent = '.';
  dotsTimer = setInterval(() => {
    n = (n + 1) % 3;
    status_.querySelector('.dots').textContent = '.'.repeat(n + 1);
  }, 400);
}
function stopDots() { clearInterval(dotsTimer); }

// ===== ДЫМ =====
let smokeAlive = false;
function spawnSmokePuff(x, y, baseSize) {
  const el = document.createElement('div');
  el.style.cssText = `position:absolute;left:${x-baseSize/2}px;top:${y-baseSize/2}px;width:${baseSize}px;height:${baseSize}px;border-radius:50%;
    background: radial-gradient(circle at 35% 35%, rgba(180,255,90,0.95), rgba(80,200,40,0.85) 40%, rgba(40,120,30,0.4) 70%, transparent 100%);
    filter: blur(2px); pointer-events:none; will-change:transform,opacity;`;
  smokeC.appendChild(el);
  const driftX = rand(-30, 30), riseY = rand(-180, -90), grow = rand(1.6, 2.4), dur = rand(2200, 3500);
  const t0 = performance.now();
  function tick() {
    const t = Math.min(1, (performance.now() - t0) / dur);
    const e = easeOut(t);
    el.style.transform = `translate(${driftX * e}px, ${riseY * e}px) scale(${1 + grow * e})`;
    el.style.opacity = (1 - e) * 0.9;
    if (t < 1) requestAnimationFrame(tick); else el.remove();
  }
  requestAnimationFrame(tick);
}
async function smokeBurst(x, y, intense=true) {
  smokeAlive = true;
  const start = performance.now();
  function loop() {
    if (!smokeAlive) return;
    const elapsed = performance.now() - start;
    const rate = intense && elapsed < 1500 ? 2 : 1;
    for (let i = 0; i < rate; i++) {
      spawnSmokePuff(x + rand(-25, 25), y + rand(-15, 5), rand(80, 130));
    }
    setTimeout(loop, intense && elapsed < 1500 ? 60 : 140);
  }
  loop();
}
function stopSmoke() { smokeAlive = false; }

async function throwGrenade(toX) {
  grenade.style.transform = `translate(${toX - 25}px, -80px)`;
  const startX = toX - 200, startY = -80;
  const endX = toX, endY = GROUND_Y - 30;
  await animate({
    duration: 700, ease: easeIn,
    onUpdate: e => {
      const x = lerp(startX, endX, e), y = lerp(startY, endY, e);
      grenade.style.transform = `translate(${x - 25}px, ${y - 25}px) rotate(${e * 540}deg)`;
    }
  });
  sfx.thunk();
  await animate({
    duration: 250, ease: easeOut,
    onUpdate: e => {
      const y = endY - Math.sin(e * Math.PI) * 25;
      grenade.style.transform = `translate(${endX - 25}px, ${y - 25}px) rotate(${540 + e * 90}deg)`;
    }
  });
  smokeBurst(toX, endY + 5, true);
  sfx.smokeHiss();
}

// ===== ДВИЖЕНИЕ =====
let swayId = 0;
function startSway() {
  const id = ++swayId, t0 = performance.now();
  function f() {
    if (id !== swayId) return;
    const t = (performance.now() - t0) / 1000;
    heroSvg.style.transform = `rotate(${Math.sin(t*1.4)*5}deg)`;
    heroSvg.style.transformOrigin = '140px 70px';
    requestAnimationFrame(f);
  }
  requestAnimationFrame(f);
}
function stopSway() { swayId++; heroSvg.style.transform = ''; }

async function descend(landX) {
  parachute.style.display = ''; parachute.style.opacity = '1'; parachute.style.transform = '';
  bodyFlip = 1;
  armLeft.style.transformOrigin = '88px 250px';
  armRight.style.transformOrigin = '188px 250px';
  armLeft.style.transform = 'rotate(-25deg)';
  armRight.style.transform = 'rotate(25deg)';
  startSway(); sfx.parachute();
  await animate({
    duration: 4200, ease: easeInOut,
    onUpdate: (e, t) => {
      const y = lerp(-200, GROUND_Y, e);
      const wind = Math.sin(t*Math.PI*2.5) * 25 * (1 - t*0.6);
      placeHero(landX + wind, y);
    }
  });
  stopSway();
  armLeft.style.transform = ''; armRight.style.transform = '';
}
async function land(landX) {
  placeHero(landX, GROUND_Y, {extraY: 10, scaleY: 0.92});
  sfx.land();
  await sleep(180);
  placeHero(landX, GROUND_Y);
  parachute.style.transition = 'transform 700ms cubic-bezier(.2,.8,.4,1), opacity 700ms';
  parachute.style.transformOrigin = '140px 70px';
  parachute.style.transform = 'translate(40px, -180px) rotate(28deg)';
  parachute.style.opacity = '0';
  await sleep(650);
  parachute.style.display = 'none';
  parachute.style.transition = '';
}

async function walkTo(fromX, toX, durMs, headYRef) {
  const dir = toX > fromX ? 1 : -1; bodyFlip = dir;
  let walking = true; const t0 = performance.now();
  (function walkFrame() {
    if (!walking) return;
    const tt = (performance.now() - t0) / 130;
    legLeft.style.transformOrigin = '121px 295px';
    legRight.style.transformOrigin = '159px 295px';
    legLeft.style.transform = `rotate(${Math.sin(tt)*22}deg)`;
    legRight.style.transform = `rotate(${Math.sin(tt+Math.PI)*22}deg)`;
    armLeft.style.transform = `rotate(${Math.sin(tt+Math.PI)*18}deg)`;
    armRight.style.transform = `rotate(${Math.sin(tt)*18}deg)`;
    requestAnimationFrame(walkFrame);
  })();
  sfx.steps(durMs, false);
  await animate({
    duration: durMs, ease: easeInOut,
    onUpdate: e => {
      const x = lerp(fromX, toX, e);
      const bob = Math.abs(Math.sin(e*Math.PI*4)) * 5;
      placeHero(x, GROUND_Y - bob);
      placeStatus(x, headYRef, 1);
      placeNick(x, headYRef, 1, 1);
    }
  });
  walking = false;
  legLeft.style.transform = ''; legRight.style.transform = '';
  armLeft.style.transform = ''; armRight.style.transform = '';
}

async function pickUp(loot, currentX, headYRef) {
  surprise.setAttribute('opacity', '1'); sfx.pickup();
  await animate({
    duration: 380, ease: easeOut,
    onUpdate: e => {
      head.style.transformOrigin = '140px 220px';
      head.style.transform = `rotate(${e*15}deg)`;
      armRight.style.transform = `rotate(${-e*80}deg)`;
      placeHero(currentX, GROUND_Y, {extraY: e*10});
      placeStatus(currentX, headYRef, 1);
      placeNick(currentX, headYRef, 1, 1);
      loot.el.style.transform = `scale(${0.85 - e*0.4}) rotate(${e*360}deg)`;
      loot.el.style.opacity = (1 - e*0.4).toString();
    }
  });
  await animate({
    duration: 280, ease: easeIn,
    onUpdate: e => {
      loot.el.style.opacity = (0.6 - e*0.6).toString();
      loot.el.style.transform = `scale(${0.45 - e*0.45}) translateY(-${e*30}px)`;
    }
  });
  loot.el.remove();
  await animate({
    duration: 280, ease: easeOut,
    onUpdate: e => {
      head.style.transform = `rotate(${(1-e)*15}deg)`;
      armRight.style.transform = `rotate(${(-1+e)*80}deg)`;
      placeHero(currentX, GROUND_Y, {extraY: (1-e)*10});
      placeStatus(currentX, headYRef, 1);
      placeNick(currentX, headYRef, 1, 1);
    }
  });
  head.style.transform = ''; armRight.style.transform = '';
  surprise.setAttribute('opacity', '0');
}

async function ropeDescend(x) {
  rope.style.transform = `translate(${x - 55}px, -1200px)`;
  await animate({
    duration: 900, ease: easeOut,
    onUpdate: e => {
      const y = lerp(-1200, GROUND_Y - 1100, e);
      rope.style.transform = `translate(${x - 55}px, ${y}px)`;
    }
  });
}
async function ropeAscend(x, headYRef) {
  armLeft.style.transform = 'rotate(-160deg) translateX(8px)';
  armRight.style.transform = 'rotate(160deg) translateX(-8px)';
  legLeft.style.transform = 'rotate(8deg)';
  legRight.style.transform = 'rotate(-8deg)';
  bodyFlip = 1;
  let qt = 0;
  await animate({
    duration: 1600, ease: easeIn,
    onUpdate: e => {
      const footY = lerp(GROUND_Y, -300, e);
      placeHero(x, footY);
      const ropeY = lerp(GROUND_Y - 1100, GROUND_Y - 1100 - 1200 * e, e);
      rope.style.transform = `translate(${x - 55}px, ${ropeY}px)`;
      qt += 0.16;
      heroSvg.style.transform = `rotate(${Math.sin(qt) * 4}deg)`;
      placeNick(x, footY - HERO_RH + 30, 1 - e*0.7);
      placeStatus(x, footY - HERO_RH + 30, 1 - e);
    }
  });
  heroSvg.style.transform = '';
  armLeft.style.transform = ''; armRight.style.transform = '';
  legLeft.style.transform = ''; legRight.style.transform = '';
}

function spawnLoot(types) {
  lootContainer.innerHTML = '';
  const n = types.length;
  const pos = [];
  for (let i = 0; i < n; i++) pos.push((STAGE_W/(n+1))*(i+1) + rand(-100, 100));
  pos.sort(() => Math.random() - 0.5);
  return pos.map((x, i) => {
    const px = Math.max(80, Math.min(STAGE_W-80, x));
    const el = document.createElement('div');
    el.className = 'loot';
    el.innerHTML = LOOT_TYPES[types[i]];
    el.style.left = (px - 55) + 'px';
    el.style.top = (GROUND_Y - 110) + 'px';
    el.style.transform = `scale(0.85) rotate(${rand(-10,10)}deg)`;
    el.style.transformOrigin = 'center bottom';
    el.style.opacity = '1';
    lootContainer.appendChild(el);
    return {el, x: px, y: GROUND_Y};
  });
}

// ===== MAIN =====
async function playAlert(nick) {
  if (hint) hint.classList.add('hide');
  isPlaying = true; updateQueueStatus();
  try {
    randomizeOutfit();
    parachute.style.display = ''; parachute.style.opacity = '1'; parachute.style.transform = '';
    head.style.transform = ''; bodyG.style.transform = '';
    armLeft.style.transform = ''; armRight.style.transform = '';
    legLeft.style.transform = ''; legRight.style.transform = '';
    nickname.style.opacity = '0';

    nickname.querySelector('.main').textContent = (nick || 'NICKNAME').toUpperCase();
    nickname.style.fontSize = '56px';

    const landX = rand(STAGE_W*0.18, STAGE_W*0.82);
    const smokeX = rand(STAGE_W*0.15, STAGE_W*0.85);
    const allTypes = ['chest','medkit','ammo'];
    const lootCount = Math.random()<0.5 ? 2 : 3;
    const pool = [...allTypes]; const lootTypes = [];
    for (let i = 0; i < lootCount; i++)
      lootTypes.push(pool.length ? pool.splice(Math.floor(Math.random()*pool.length),1)[0] : choice(allTypes));
    const loots = spawnLoot(lootTypes);

    // 1) ГРАНАТА + маркер дыма
    setStatus('маркер'); startDots();
    placeStatus(smokeX, GROUND_Y - HERO_RH + 30, 1);
    await throwGrenade(smokeX);

    // 2) ДЕСАНТ
    setStatus('высадка');
    await descend(landX);
    const headY = GROUND_Y - HERO_RH + 30;
    placeNick(landX, headY, 0, 0.6);
    animate({
      duration: 350, ease: easeOut,
      onUpdate: e => placeNick(landX, headY - (1-e)*20, e, 0.6 + e*0.4)
    });
    await land(landX);

    // 3) ЛУТ
    setStatus('лут');
    let curX = landX;
    loots.sort((a,b) => Math.abs(a.x-curX) - Math.abs(b.x-curX));
    for (const loot of loots) {
      const dist = Math.abs(loot.x - curX);
      const dur = Math.max(500, 350 + dist*1.4);
      await walkTo(curX, loot.x, dur, headY);
      await pickUp(loot, loot.x, headY);
      curX = loot.x;
      await sleep(120);
    }

    // 4) ИДЕМ К ДЫМУ
    setStatus('к точке');
    if (Math.abs(curX - smokeX) > 30) {
      const dur = Math.max(500, Math.abs(curX - smokeX) * 1.4);
      await walkTo(curX, smokeX, dur, headY);
      curX = smokeX;
    }

    // 5) ОЖИДАНИЕ 3с
    setStatus('ожидание');
    await sleep(3000);

    // 6) ЛЕСТНИЦА СПУСКАЕТСЯ
    setStatus('эвакуация');
    await ropeDescend(curX);
    await sleep(150);

    // 7) ПОДЪЁМ + стоп дым
    stopSmoke();
    sfx.heli();
    await ropeAscend(curX, headY);

    // 8) СКРЫТЬ
    hideHero(); hideNick(); hideStatus();
    rope.style.transform = 'translate(-9999px,-9999px)';
    grenade.style.transform = 'translate(-9999px,-9999px)';
  } catch (err) {
    console.error('[alert]', err);
  } finally {
    isPlaying = false;
    stopDots();
    updateQueueStatus();
    if (queue.length > 0) setTimeout(() => playAlert(queue.shift()), 500);
  }
}

function fireFollowerAlert(nick) {
  nick = (nick || 'AnonGuest').toString().slice(0, 25);
  if (isPlaying) { queue.push(nick); updateQueueStatus(); return {queued:true}; }
  playAlert(nick); return {queued:false};
}
function clearQueue() { queue.length = 0; updateQueueStatus(); }
function updateQueueStatus() {
  const el = $('queue-status');
  if (el) el.textContent = `queue: ${queue.length} · ${isPlaying ? 'playing' : 'idle'}`;
}

// ===== SOUND =====
const sfx = (function(){
  let ctx = null, musicOn = false, musicNodes = [];
  const MUSIC_VOL = 0.40 * 0.4;
  function ensure() {
    if (!ctx) try { ctx = new (window.AudioContext||window.webkitAudioContext)(); } catch(e){ return null; }
    return ctx;
  }
  function noiseBuf(c, dur) {
    const buf = c.createBuffer(1, c.sampleRate*dur, c.sampleRate);
    const d = buf.getChannelData(0);
    for (let i=0; i<d.length; i++) d[i] = Math.random()*2-1;
    return buf;
  }
  return {
    parachute() {
      const c = ensure(); if (!c) return;
      const t0 = c.currentTime, dur = 4.0;
      const src = c.createBufferSource(); src.buffer = noiseBuf(c, dur);
      const f = c.createBiquadFilter(); f.type = 'bandpass';
      f.frequency.setValueAtTime(1800, t0);
      f.frequency.exponentialRampToValueAtTime(400, t0+dur); f.Q.value = 4;
      const g = c.createGain();
      g.gain.setValueAtTime(0, t0);
      g.gain.linearRampToValueAtTime(0.045, t0+0.4);
      g.gain.linearRampToValueAtTime(0, t0+dur);
      src.connect(f).connect(g).connect(c.destination);
      src.start(t0); src.stop(t0+dur);
    },
    land() {
      const c = ensure(); if (!c) return;
      const t0 = c.currentTime;
      const o = c.createOscillator(); o.type = 'sine';
      o.frequency.setValueAtTime(120, t0);
      o.frequency.exponentialRampToValueAtTime(40, t0+0.25);
      const g = c.createGain();
      g.gain.setValueAtTime(0, t0);
      g.gain.linearRampToValueAtTime(0.4, t0+0.02);
      g.gain.linearRampToValueAtTime(0, t0+0.3);
      o.connect(g).connect(c.destination);
      o.start(t0); o.stop(t0+0.3);
      const src = c.createBufferSource(); src.buffer = noiseBuf(c, 0.3);
      const f = c.createBiquadFilter(); f.type = 'lowpass'; f.frequency.value = 800;
      const gn = c.createGain(); gn.gain.value = 0.22;
      src.connect(f).connect(gn).connect(c.destination); src.start(t0);
    },
    steps(durMs, fast) {
      const c = ensure(); if (!c) return;
      const interval = fast ? 0.14 : 0.22;
      const count = Math.floor((durMs/1000)/interval);
      for (let i = 0; i < count; i++) {
        const t = c.currentTime + i*interval;
        const src = c.createBufferSource(); src.buffer = noiseBuf(c, 0.08);
        const f = c.createBiquadFilter(); f.type = 'lowpass'; f.frequency.value = 600;
        const g = c.createGain(); g.gain.value = 0.10;
        src.connect(f).connect(g).connect(c.destination); src.start(t);
      }
    },
    pickup() {
      const c = ensure(); if (!c) return;
      const t0 = c.currentTime;
      [880, 1320, 1760].forEach((f,i) => {
        const o = c.createOscillator(); o.type = 'triangle';
        o.frequency.setValueAtTime(f, t0+i*0.06);
        const g = c.createGain();
        g.gain.setValueAtTime(0, t0+i*0.06);
        g.gain.linearRampToValueAtTime(0.10, t0+i*0.06+0.01);
        g.gain.linearRampToValueAtTime(0, t0+i*0.06+0.12);
        o.connect(g).connect(c.destination);
        o.start(t0+i*0.06); o.stop(t0+i*0.06+0.13);
      });
    },
    thunk() {
      const c = ensure(); if (!c) return;
      const t0 = c.currentTime;
      const o = c.createOscillator(); o.type = 'square';
      o.frequency.setValueAtTime(200, t0);
      o.frequency.exponentialRampToValueAtTime(60, t0+0.15);
      const g = c.createGain();
      g.gain.setValueAtTime(0, t0); g.gain.linearRampToValueAtTime(0.15, t0+0.01);
      g.gain.linearRampToValueAtTime(0, t0+0.18);
      o.connect(g).connect(c.destination);
      o.start(t0); o.stop(t0+0.2);
    },
    smokeHiss() {
      const c = ensure(); if (!c) return;
      const t0 = c.currentTime, dur = 1.2;
      const src = c.createBufferSource(); src.buffer = noiseBuf(c, dur);
      const f = c.createBiquadFilter(); f.type = 'highpass'; f.frequency.value = 3000;
      const g = c.createGain();
      g.gain.setValueAtTime(0, t0); g.gain.linearRampToValueAtTime(0.06, t0+0.08);
      g.gain.linearRampToValueAtTime(0, t0+dur);
      src.connect(f).connect(g).connect(c.destination);
      src.start(t0); src.stop(t0+dur);
    },
    heli() {
      const c = ensure(); if (!c) return;
      const t0 = c.currentTime, dur = 2.0;
      const o = c.createOscillator(); o.type = 'sawtooth';
      o.frequency.value = 35;
      const lfo = c.createOscillator(); lfo.frequency.value = 14;
      const lfoG = c.createGain(); lfoG.gain.value = 12;
      lfo.connect(lfoG).connect(o.frequency);
      const f = c.createBiquadFilter(); f.type = 'lowpass'; f.frequency.value = 280;
      const g = c.createGain();
      g.gain.setValueAtTime(0, t0); g.gain.linearRampToValueAtTime(0.18, t0+0.3);
      g.gain.linearRampToValueAtTime(0, t0+dur);
      o.connect(f).connect(g).connect(c.destination);
      o.start(t0); lfo.start(t0); o.stop(t0+dur); lfo.stop(t0+dur);
    },
    startMusic() {
      const c = ensure(); if (!c || musicOn) return;
      musicOn = true;
      const drone = c.createOscillator(); drone.type = 'sine'; drone.frequency.value = 55;
      const drone2 = c.createOscillator(); drone2.type = 'triangle'; drone2.frequency.value = 82.5;
      const droneG = c.createGain(); droneG.gain.value = MUSIC_VOL * 0.4;
      const filt = c.createBiquadFilter(); filt.type = 'lowpass'; filt.frequency.value = 400;
      drone.connect(filt); drone2.connect(filt); filt.connect(droneG).connect(c.destination);
      drone.start(); drone2.start();
      musicNodes.push(drone, drone2, droneG, filt);
      const t0 = c.currentTime;
      const beep = (t, freq, dur=0.12) => {
        const o = c.createOscillator(); o.type = 'square';
        o.frequency.value = freq;
        const g = c.createGain();
        g.gain.setValueAtTime(0, t); g.gain.linearRampToValueAtTime(MUSIC_VOL*0.25, t+0.005);
        g.gain.linearRampToValueAtTime(0, t+dur);
        const lp = c.createBiquadFilter(); lp.type = 'lowpass'; lp.frequency.value = 1200;
        o.connect(lp).connect(g).connect(c.destination);
        o.start(t); o.stop(t+dur+0.05);
      };
      const notes = [220, 0, 277, 0, 220, 165, 0, 220];
      const sched = () => {
        if (!musicOn) return;
        const barT = c.currentTime;
        for (let i = 0; i < notes.length; i++) {
          if (notes[i]) beep(barT + i*0.5, notes[i], 0.15);
        }
        setTimeout(sched, 4000);
      };
      sched();
    },
    stopMusic() {
      musicOn = false;
      musicNodes.forEach(n => { try { n.stop && n.stop(); } catch(e){} });
      musicNodes = [];
    },
    isMusicOn() { return musicOn; }
  };
})();

// ===== TEST PANEL =====
const params = new URLSearchParams(location.search);
if (params.has('test') || params.has('debug')) $('test-panel').classList.add('visible');
if (params.has('bg')) document.body.classList.add('with-bg');

$('test-fire').addEventListener('click', () => fireFollowerAlert($('test-nick').value || 'TestUser'));
$('test-multi').addEventListener('click', () => ['Vasyan_228','NagibatorXXL','LysiyBog'].forEach(n => fireFollowerAlert(n)));
$('test-clear').addEventListener('click', clearQueue);
$('toggle-music').addEventListener('change', (e) => {
  if (e.target.checked) sfx.startMusic(); else sfx.stopMusic();
});

// ===== PUBLIC API =====
window.fireFollowerAlert = fireFollowerAlert;
window.clearAlertQueue = clearQueue;
window.__alertDebug = {
  state: () => ({isPlaying, queue: [...queue]}),
  reset: () => { isPlaying = false; queue.length = 0; hideHero(); hideNick(); hideStatus(); stopSmoke(); stopDots(); }
};

// Runtime config updates from ttweaks backend
window.applyAlertConfig = function(cfg) {
  if (!cfg) return;
  if (typeof cfg.subtitleText === 'string') {
    const sub = nickname.querySelector('.sub');
    if (sub) sub.textContent = cfg.subtitleText;
  }
  if (typeof cfg.nickColor === 'string') {
    const main = nickname.querySelector('.main');
    if (main) main.style.color = cfg.nickColor;
  }
  if (typeof cfg.nickFontSize === 'number' && cfg.nickFontSize > 0) {
    nickname.style.fontSize = cfg.nickFontSize + 'px';
  }
  if (typeof cfg.animationSpeed === 'number' && cfg.animationSpeed > 0) {
    _speedMult = cfg.animationSpeed;
  }
};

// Init
hideHero(); hideNick(); hideStatus();
rope.style.transform = 'translate(-9999px,-9999px)';
grenade.style.transform = 'translate(-9999px,-9999px)';

console.log('[alert] engine v3 ready');
})();
