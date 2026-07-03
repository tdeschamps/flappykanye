import { ERAS, POINTS_PER_ERA, GOAT_QUOTES, eraFor } from './eras.js';
import {
  PHYSICS, recomputeDims, createGameState, resetGame, stepPhysics, stepDeath, flap as physicsFlap
} from './game.js';
import {
  createKanye, updateKanye, drawKanye, triggerFlap, triggerScore, resetKanye
} from './kanye.js';
import * as audio from './audio.js';
import * as music from './music.js';
import { createShaderBackdrop, hexToVec3, mixVec3 } from './shader.js';

const canvas = document.getElementById('game');
const ctx = canvas.getContext('2d');

const scoreEl = document.getElementById('score');
const bestEl = document.getElementById('best');
const chamberEl = document.getElementById('chamber');
const overlay = document.getElementById('overlay');
const deathBlock = document.getElementById('death-block');
const deathContext = document.getElementById('death-context');
const deathQuote = document.getElementById('death-quote');
const deathStats = document.getElementById('death-stats');
const promptEl = document.getElementById('prompt');
const egoBar = document.getElementById('ego-bar');
const egoChip = document.getElementById('ego-chip');
const toastEl = document.getElementById('toast');
const hudEl = document.querySelector('.hud');
const nowLine = document.getElementById('now-line');
const onboardEl = document.getElementById('onboard');
const stageEl = document.getElementById('stage');
const eraCard = document.getElementById('era-card');
const ecRoman = document.getElementById('ec-roman');
const ecAlbum = document.getElementById('ec-album');
const ecMeta = document.getElementById('ec-meta');
const bgCanvas = document.getElementById('bg');
const QUERY = new URLSearchParams(location.search);
const DEBUG = QUERY.has('debug');
const shader = createShaderBackdrop(bgCanvas, { preserveDrawingBuffer: DEBUG });
// Honest degradation: no parallel renderer — a static CSS gradient (style.css).
if (!shader) document.body.classList.add('no-webgl');
const kanye = createKanye();

const muteBtn = document.getElementById('mute-btn');
muteBtn.textContent = audio.isMuted() ? 'SOUND OFF' : 'SOUND ON';
muteBtn.addEventListener('click', (e) => {
  e.stopPropagation();
  audio.setMuted(!audio.isMuted());
  muteBtn.textContent = audio.isMuted() ? 'SOUND OFF' : 'SOUND ON';
});

function lerp(a, b, t) { return a + (b - a) * t; }
function hexToRgb(h) {
  const v = parseInt(h.slice(1), 16);
  return [(v >> 16) & 255, (v >> 8) & 255, v & 255];
}
function rgbToCss([r,g,b], a=1) { return `rgba(${r|0},${g|0},${b|0},${a})`; }

// Hi-bit split: the game canvas renders at quarter resolution (240 texels tall)
// and CSS upscales it with nearest-neighbor, so monoliths and Kanye read as
// chunky 16-bit objects floating in the smooth full-res Turrell light behind.
const PIXEL_H = 240;
const TEX = PIXEL_H / PHYSICS.H;          // texels per logical unit
const tx = (v) => Math.round(v * TEX);    // logical → texel

function sizeGameCanvas() {
  canvas.width = Math.max(1, tx(PHYSICS.W));
  canvas.height = PIXEL_H;
  ctx.setTransform(1, 0, 0, 1, 0, 0);
  ctx.imageSmoothingEnabled = false;
}

// Recompute dims for the current viewport and resize the 2D canvas. The WebGL
// backdrop self-resizes each render; placeKanye re-derives its scale next frame.
function applyViewport() {
  recomputeDims(window.innerWidth, window.innerHeight);
  sizeGameCanvas();
}

applyViewport();

// Persistence: one JSON blob. Migrates the legacy flat best-score key.
function loadSave() {
  try {
    const s = JSON.parse(localStorage.getItem('flappykanye_save'));
    if (s && s.v === 1) return s;
  } catch (e) { /* corrupted — rebuild below */ }
  const legacy = parseInt(localStorage.getItem('flappykanye_best') || '0', 10);
  return { v: 1, best: legacy || 0, maxEraIdx: 0, goatLaps: 0, runs: 0 };
}
const save = loadSave();
function persistSave() {
  localStorage.setItem('flappykanye_save', JSON.stringify(save));
  localStorage.removeItem('flappykanye_best');
}

const state = createGameState();
state.best = save.best;
bestEl.textContent = state.best;

const REDUCED = matchMedia('(prefers-reduced-motion: reduce)').matches;

// The eased visual state: one object of current shader values that
// exponentially approaches the active era's targets every frame. Room morphs,
// the death "rewind" to Dropout, and GOAT gold-washing all fall out of this
// single mechanism — no per-feature tween code.
const GOLD = hexToVec3('#ffd700');
const E0 = ERAS[0];
const visual = {
  a: hexToVec3(E0.pal.a),
  b: hexToVec3(E0.pal.b),
  accent: hexToVec3(E0.pal.accent),
  pos: [...E0.aperture.pos],
  size: [...E0.aperture.size],
  radius: E0.aperture.radius,
  grain: E0.mood.grain,
  aberration: E0.mood.aberration,
  glitch: E0.mood.glitch,
  fog: E0.mood.fog,
};

let attractIdx = -1;
function easeVisual(dt) {
  let { era, lap } = eraFor(state.score);
  // Idle attract: after 8s on the title, the gallery cycles its rooms.
  if (state.mode === 'idle' && state.t > 8) {
    const pi = Math.floor((state.t - 8) / 4) % ERAS.length;
    era = ERAS[pi];
    lap = 0;
    if (pi !== attractIdx) {
      attractIdx = pi;
      nowLine.textContent = `ERA ${era.roman} · ${era.album} · ${era.year}`;
      stageEl.style.setProperty('--era-accent', era.pal.accent);
    }
  }
  // Slow the ease during a choreographed transition so the room visibly
  // rebuilds itself over ~1.6s instead of snapping.
  const k = Math.min(1, dt * (state.transition ? 1.5 : 2.8));
  const to = (cur, target) => cur + (target - cur) * k;
  const toV = (cur, target) => { for (let i = 0; i < cur.length; i++) cur[i] = to(cur[i], target[i]); };
  // GOAT laps wash every accent 35% toward gold.
  const accentT = lap > 0 ? mixVec3(hexToVec3(era.pal.accent), GOLD, 0.35) : hexToVec3(era.pal.accent);
  toV(visual.a, hexToVec3(era.pal.a));
  toV(visual.b, hexToVec3(era.pal.b));
  toV(visual.accent, accentT);
  toV(visual.pos, era.aperture.pos);
  toV(visual.size, era.aperture.size);
  visual.radius = to(visual.radius, era.aperture.radius);
  visual.grain = to(visual.grain, era.mood.grain);
  visual.aberration = to(visual.aberration, era.mood.aberration);
  visual.glitch = to(visual.glitch, REDUCED ? 0 : era.mood.glitch);
  visual.fog = to(visual.fog, era.mood.fog);

  // Physics ease with the same clock, so difficulty ramps as the room morphs.
  // GOAT laps multiply: faster, tighter, denser — with hard fairness floors.
  const gGap = Math.max(200, era.physics.gap - 12 * lap);
  const gSpeed = era.physics.speed * Math.min(1.6, 1 + 0.12 * lap);
  const gSpawn = Math.max(1.0, era.physics.spawn * Math.pow(0.94, lap));
  const tn = state.tuning;
  tn.gap = to(tn.gap, gGap);
  tn.dx = to(tn.dx, gSpeed * PHYSICS.H);
  tn.spawn = to(tn.spawn, gSpawn);
  tn.gravity = to(tn.gravity, PHYSICS.GRAVITY * era.physics.gravityMul);
  state.obstacle = era.obstacle;
}

// Start the run on era I's physics, not the generic defaults.
state.tuning.gap = E0.physics.gap;
state.tuning.dx = E0.physics.speed * PHYSICS.H;
state.tuning.spawn = E0.physics.spawn;
state.tuning.gravity = PHYSICS.GRAVITY * E0.physics.gravityMul;
state.obstacle = E0.obstacle;

function eraLabel(score) {
  const { era, lap } = eraFor(score);
  const goat = lap > 0 ? 'GOAT · ' : '';
  return `${goat}${era.roman} · ${era.album}`;
}

function reset() {
  resetGame(state);
  resetKanye(kanye);
  scoreEl.textContent = '0';
  chamberEl.textContent = eraLabel(0);
  eraCard.classList.add('hidden');
  stageEl.style.setProperty('--era-accent', ERAS[0].pal.accent);
  nowLine.textContent = `ERA I · ${ERAS[0].album} · ${ERAS[0].year}`;
  attractIdx = -1;
  lastEraKey = 0;
  interruptFired = false;
  egoToastFired = false;
  takeoverNext = 7;
  takeoverT = 0;
  state.slowmoT = 0;
}

// Era-boundary choreography: spawn hold creates a pipe-free breath, grace
// covers any leftover pipe, the card names the room, the eased visuals morph.
function startEraTransition() {
  const { era, idx: eIdx, lap } = eraFor(state.score);
  state.transition = { t: 0, dur: 1.6 };
  state.graceT = 2.1;
  state.spawnTimer = Math.max(state.spawnTimer, 2.1);
  if (lap > 0 && eIdx === 0) {
    // Crossing into a GOAT lap gets its own moment.
    ecRoman.textContent = 'GREATEST OF ALL TIME';
    ecAlbum.textContent = 'GOAT MODE';
    ecMeta.textContent = `LAP ${lap + 1} · EVERYTHING FASTER · EVERYTHING GOLD`;
  } else {
    ecRoman.textContent = lap > 0 ? `GOAT · LAP ${lap + 1} · ERA ${era.roman}` : `ERA ${era.roman}`;
    ecAlbum.textContent = era.album;
    ecMeta.textContent = `${era.year} · AFTER TURRELL: ${era.turrell}`;
  }
  eraCard.classList.remove('hidden');
  stageEl.style.setProperty('--era-accent', era.pal.accent);
  const { idx, lap: l } = eraFor(state.score);
  audio.eraSwell(idx);
  music.setEra(idx, l);
}

function flap() {
  if (state.mode === 'idle') {
    state.mode = 'playing';
    overlay.classList.add('hidden');
    deathBlock.style.display = 'none';
    onboardEl.style.display = 'none';
    music.setMode('playing');
    save.runs++; persistSave();
  } else if (state.mode === 'dead') {
    // The death beat: quotes deserve 600ms of respect before a restart.
    if (state.deadT < 0.6) return;
    reset();
    state.mode = 'playing';
    overlay.classList.add('hidden');
    deathBlock.style.display = 'none';
    music.setEra(0, 0);
    music.setMode('playing');
    save.runs++; persistSave();
  }
  triggerFlap(kanye);
  audio.init();
  music.start();
  audio.flap(eraFor(state.score).era.id === 'heartbreak', state.ego);
  physicsFlap(state);
  spawnParts(state.kanye.x - 24, state.kanye.y + 28, [235, 230, 220], 3, true);
}

// --- Pixel particles (render-side juice; 1-texel motes) ---
const parts = [];
function spawnParts(x, y, rgb, n, drift = false) {
  for (let i = 0; i < n; i++) {
    parts.push({
      x, y,
      vx: (Math.random() - 0.5) * (drift ? 90 : 200),
      vy: drift ? 40 + Math.random() * 80 : (Math.random() - 0.5) * 220,
      life: 0.45 + Math.random() * 0.35,
      rgb,
    });
  }
}
function stepParts(dt) {
  for (const p of parts) {
    p.x += p.vx * dt;
    p.y += p.vy * dt;
    p.vy += 300 * dt;
    p.life -= dt;
  }
  for (let i = parts.length - 1; i >= 0; i--) if (parts[i].life <= 0) parts.splice(i, 1);
}
function scorePop() {
  scoreEl.classList.remove('pop');
  void scoreEl.offsetWidth;
  scoreEl.classList.add('pop');
}

// Title-screen discography progress: one dot per era, gold once GOAT reached.
const eraDotsEl = document.getElementById('era-dots');
function renderEraDots() {
  eraDotsEl.innerHTML = '';
  for (let i = 0; i < ERAS.length; i++) {
    const d = document.createElement('span');
    d.className = 'era-dot' + (i <= save.maxEraIdx ? ' filled' : '') + (save.goatLaps > 0 ? ' goat' : '');
    d.title = ERAS[i].album;
    eraDotsEl.appendChild(d);
  }
}

let lastQuote = '';
function pickQuote(era, lap) {
  const pool = lap > 0 ? [...era.quotes, ...GOAT_QUOTES] : era.quotes;
  let q = pool[Math.floor(Math.random() * pool.length)];
  if (q === lastQuote) q = pool[(pool.indexOf(q) + 1) % pool.length];
  lastQuote = q;
  return q;
}

let toastT = 0;
function toast(msg, dur = 1.6) {
  toastEl.textContent = msg;
  toastEl.classList.remove('hidden');
  toastT = dur;
}

function die() {
  if (state.mode === 'dead') return;
  state.mode = 'dead';
  state.deadT = 0;
  state.shake = REDUCED ? 10 : 22;
  state.flash = 1;
  const { era, lap } = eraFor(state.score);
  audio.death(era.id);
  music.setMode('idle');
  spawnParts(state.kanye.x, state.kanye.y, [255, 84, 60], 14);
  if (state.score > state.best) {
    state.best = state.score;
    localStorage.setItem('flappykanye_best', String(state.best));
    bestEl.textContent = state.best;
  }
  deathContext.textContent = `YOU DIED IN: ${era.album}, ${era.year}`;
  deathQuote.textContent = `“${pickQuote(era, lap)}”`;
  deathStats.textContent = `SCORE ${state.score} · BEST ${state.best}`;
  promptEl.textContent = 'TAP TO RUN IT BACK';
  save.best = Math.max(save.best, state.score);
  save.maxEraIdx = Math.max(save.maxEraIdx, lap > 0 ? ERAS.length - 1 : eraFor(state.score).idx);
  save.goatLaps = Math.max(save.goatLaps, lap);
  persistSave();
  renderEraDots();
  state.ego = 0;
  state.egoX2 = false;
  overlay.classList.remove('hidden');
  deathBlock.style.display = 'block';
}

// --- Input ---
function onTap(e) {
  e.preventDefault();
  flap();
}
window.addEventListener('keydown', (e) => {
  if (e.code === 'Space' || e.code === 'ArrowUp') {
    e.preventDefault();
    flap();
  }
});
window.addEventListener('keydown', (e) => {
  if (e.key === 'm' || e.key === 'M') {
    audio.setMuted(!audio.isMuted());
    muteBtn.textContent = audio.isMuted() ? 'SOUND OFF' : 'SOUND ON';
  }
});
canvas.addEventListener('pointerdown', onTap);
overlay.addEventListener('pointerdown', onTap);

// --- Debug (?debug): keys 1–7 jump to era boundaries, G to GOAT lap 2.
//     ?score=N sets the starting score directly (screenshot harness). ---
if (DEBUG && QUERY.has('score')) {
  state.score = Math.max(0, parseInt(QUERY.get('score'), 10) || 0);
  scoreEl.textContent = String(state.score);
  chamberEl.textContent = eraLabel(state.score);
}
if (DEBUG) {
  window.addEventListener('keydown', (e) => {
    let target = null;
    if (e.key >= '1' && e.key <= '7') target = (Number(e.key) - 1) * POINTS_PER_ERA;
    if (e.key === 'g' || e.key === 'G') target = POINTS_PER_ERA * ERAS.length;
    if (target === null) return;
    state.score = target;
    scoreEl.textContent = String(state.score);
    chamberEl.textContent = eraLabel(state.score);
  });

  // Screenshot harness: force a render and return the composited frame as a
  // JPEG data URL. Works even when the tab is hidden (rAF throttled).
  window.__setScore = (n) => {
    state.score = Math.max(0, n | 0);
    scoreEl.textContent = String(state.score);
    chamberEl.textContent = eraLabel(state.score);
    // Room jump: fresh fair field, kanye airborne mid-screen.
    state.pipes = [];
    state.spawnTimer = 0.6;
    state.kanye.y = PHYSICS.H * 0.45;
    state.kanye.vy = 0;
    const ek = eraFor(state.score);
    lastEraKey = ek.idx + ek.lap * ERAS.length;
  };
  window.__tick = (dt = 1 / 60) => { state.t += dt; update(dt); render(); };
  window.__music = music;
  window.__audio = audio;
  window.__die = () => { if (state.mode === 'playing') die(); return state.mode; };
  // Autopilot: play N frames steering toward the nearest gap center. Returns
  // mode:score so fairness checks can assert survival.
  window.__auto = (frames = 300) => {
    if (state.mode !== 'playing') {
      state.mode = 'playing';
      overlay.classList.add('hidden');
      deathBlock.style.display = 'none';
    }
    for (let i = 0; i < frames; i++) {
      let target = PHYSICS.H * 0.5;
      let nearest = Infinity;
      for (const p of state.pipes) {
        const d = (p.x + PHYSICS.PIPE_W) - state.kanye.x;
        if (d > -10 && d < nearest) { nearest = d; target = p.gapY + p.gapH / 2; }
      }
      if (state.kanye.y > target && state.kanye.vy > -60) {
        physicsFlap(state);
        triggerFlap(kanye);
      }
      window.__tick();
      if (state.mode === 'dead') break;
    }
    return `${state.mode}:${state.score}`;
  };
  window.__snap = (w = 450) => {
    render();
    const ar = bgCanvas.height ? bgCanvas.height / bgCanvas.width : 4 / 3;
    const out = document.createElement('canvas');
    out.width = w;
    out.height = Math.round(w * ar);
    const c = out.getContext('2d');
    c.drawImage(bgCanvas, 0, 0, out.width, out.height);
    c.imageSmoothingEnabled = false;
    c.drawImage(canvas, 0, 0, out.width, out.height);
    return out.toDataURL('image/jpeg', 0.82);
  };
}

// --- Drawing (texel space) ---
function hash01(a, b) {
  const s = Math.sin(a * 12.9898 + b * 78.233) * 43758.5453;
  return s - Math.floor(s);
}

function mixRgb(a, b, t) {
  return [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t, a[2] + (b[2] - a[2]) * t];
}
const GOLD_RGB = [255, 215, 0];

// Pre-baked Donda spotlight: checkerboard-dithered diamond falloff, the
// 16-bit way to draw a soft light. Baked once, stamped every frame.
const DONDA_HALO = (() => {
  const cv = document.createElement('canvas');
  cv.width = 37; cv.height = 37;
  const c = cv.getContext('2d');
  for (let y = 0; y < 37; y++) {
    for (let x = 0; x < 37; x++) {
      const d = Math.abs(x - 18) + Math.abs(y - 18);
      if (d > 17 || (x + y) % 2) continue;
      c.fillStyle = `rgba(232,228,218,${(0.16 * (1 - d / 17)).toFixed(3)})`;
      c.fillRect(x, y, 1, 1);
    }
  }
  return cv;
})();

function drawMonolith(p, era, goat) {
  let x = tx(p.x);
  const w = Math.max(2, tx(PHYSICS.PIPE_W));
  const topH = tx(p.gapY);
  const botY = tx(p.gapY + p.gapH);
  const botH = canvas.height - botY;
  const ink = era.pal.ink;
  const rim = goat ? mixRgb(hexToRgb(era.pal.rim), GOLD_RGB, 0.5) : hexToRgb(era.pal.rim);

  // Yeezus: draw-only x snap every 1/3s — collision stays on the true x.
  if (p.kind === 'jitter') {
    x += Math.round((hash01(Math.floor(state.t * 3), p.seed) - 0.5) * 4);
  }

  // Donda: near-invisible until it approaches — rim ramps up, hard but fair.
  let rimA = 0.9, inkA = 1, mouthA = 0.85;
  if (p.kind === 'reveal') {
    const approach = Math.max(0, Math.min(1, 1 - (p.x - state.kanye.x) / (PHYSICS.H * 0.55)));
    rimA = 0.15 + 0.75 * approach;
    mouthA = 0.1 + 0.8 * approach;
  }
  // 808s: the rim throbs with the heartbeat.
  if (p.kind === 'pulse') {
    const beat = state.t % 1;
    const lub = Math.max(0, Math.sin(beat * Math.PI * 6)) * Math.max(0, 1 - beat * 2.2);
    rimA = 0.35 + 0.6 * lub;
  }

  // Chunky slab body with a subtle left bevel.
  ctx.globalAlpha = inkA;
  ctx.fillStyle = ink;
  ctx.fillRect(x, 0, w, topH);
  ctx.fillRect(x, botY, w, botH);
  ctx.globalAlpha = 1;
  ctx.fillStyle = 'rgba(255,255,255,0.07)';
  ctx.fillRect(x, 0, 1, topH);
  ctx.fillRect(x, botY, 1, botH);

  // 1-texel rim on the lit (right) edge; MBDTF gets a gilded double rule.
  ctx.fillStyle = rgbToCss(rim, rimA);
  ctx.fillRect(x + w - 1, 0, 1, topH);
  ctx.fillRect(x + w - 1, botY, 1, botH);
  if (p.kind === 'drift') {
    ctx.fillStyle = rgbToCss(rim, rimA * 0.5);
    ctx.fillRect(x + w - 3, 0, 1, topH);
    ctx.fillRect(x + w - 3, botY, 1, botH);
  }

  // Gap mouths: hard 1-texel light line + a dimmer step — pixel bloom.
  ctx.fillStyle = rgbToCss(rim, mouthA);
  ctx.fillRect(x, topH - 1, w, 1);
  ctx.fillRect(x, botY, w, 1);
  ctx.fillStyle = rgbToCss(rim, mouthA * 0.35);
  ctx.fillRect(x, topH - 2, w, 1);
  ctx.fillRect(x, botY + 1, w, 1);
}


let lastEraKey = 0;
let interruptFired = false;
let interruptCardT = 0;
let egoToastFired = false;
let takeoverNext = 7;
let takeoverT = 0;

function update(dt) {
  // The 808s pulse follows the audible heartbeat when the bed is running.
  state.beatPhase = music.getPulsePhase() ?? (state.t % 1);
  if (state.mode === 'idle') {
    // Bob above the title copy so the poster text stays clear on any width.
    state.kanye.y = PHYSICS.H * 0.30 + Math.sin(state.t * 3) * 16;
    state.kanye.rot = Math.sin(state.t * 3) * 0.1;
  }
  if (state.mode === 'playing') {
    const ev = stepPhysics(state, dt);
    if (ev === 'score') {
      scoreEl.textContent = String(state.score);
      chamberEl.textContent = eraLabel(state.score);
      triggerScore(kanye);
      scorePop();
      spawnParts(state.kanye.x + 10, state.kanye.y, hexToRgb(eraFor(state.score).era.pal.accent), 6);
      audio.score(state.lastScoredGapY, music.getScaleFreqs());

      // Era boundary — detected by index change, not modulo, because ×2
      // scoring can step over the exact multiple.
      const ek = eraFor(state.score);
      const key = ek.idx + ek.lap * ERAS.length;
      if (key !== lastEraKey) {
        lastEraKey = key;
        startEraTransition();
      }

      // Ego landed: announce once per run.
      if (state.egoX2 && !egoToastFired) {
        egoToastFired = true;
        toast('THE EGO HAS LANDED — ×2');
      }

      // "I'ma let you finish": the first time this run beats the saved best.
      if (!interruptFired && state.best >= 10 && state.score > state.best) {
        interruptFired = true;
        state.slowmoT = 1.2;
        interruptCardT = 2.0;
        ecRoman.textContent = 'YO — ';
        ecAlbum.textContent = "I'MA LET YOU FINISH";
        ecMeta.textContent = 'BUT THIS IS ONE OF THE BEST RUNS OF ALL TIME';
        eraCard.classList.remove('hidden');
        audio.scratch();
      }
    } else if (ev === 'death') {
      die();
    }

    // Yeezus glitch takeover — era V only, never under reduced motion.
    const { era } = eraFor(state.score);
    if (era.id === 'yeezus' && !REDUCED) {
      takeoverNext -= dt;
      if (takeoverNext <= 0 && takeoverT <= 0) {
        takeoverT = 0.4;
        takeoverNext = 6 + Math.random() * 3;
        visual.glitch = 2.2;
        visual.pos[0] += (Math.random() - 0.5) * 0.16;   // aperture snaps; ease recovers
        hudEl.classList.add('glitch');
        scoreEl.textContent = 'YZY';
        audio.stab();
      }
      if (takeoverT > 0) {
        takeoverT -= dt;
        if (takeoverT <= 0) {
          hudEl.classList.remove('glitch');
          scoreEl.textContent = String(state.score);
        }
      }
    }
  }
  if (state.mode === 'dead') {
    state.deadT += dt;
    stepDeath(state, dt);
  }

  // Timers for the DOM moments.
  if (toastT > 0) { toastT -= dt; if (toastT <= 0) toastEl.classList.add('hidden'); }
  if (interruptCardT > 0) {
    interruptCardT -= dt;
    if (interruptCardT <= 0 && !state.transition) eraCard.classList.add('hidden');
  }

  // Ego HUD.
  egoBar.style.width = `${Math.round(state.ego * 100)}%`;
  egoChip.classList.toggle('on', state.egoX2);
  if (!state.egoX2 && state.ego < 0.05) egoToastFired = false;
  if (state.shake > 0) state.shake = Math.max(0, state.shake - dt * 60);
  if (state.flash > 0) state.flash = Math.max(0, state.flash - dt * 2);
  if (state.graceT > 0) state.graceT = Math.max(0, state.graceT - dt);
  if (state.transition) {
    state.transition.t += dt;
    if (state.transition.t >= state.transition.dur) {
      state.transition = null;
      eraCard.classList.add('hidden');
    }
  }
  easeVisual(dt);
  stepParts(dt);
  updateKanye(kanye, state, dt);
}

function render() {
  const { era, lap } = eraFor(state.score);
  const goat = lap > 0;

  // Heartbeat pulse in the 808s room — phase from the audible bed.
  let pulse = 0;
  if (era.obstacle === 'pulse') {
    const beat = state.beatPhase ?? (state.t % 1);
    pulse = Math.max(0, Math.sin(beat * Math.PI * 6)) * Math.max(0, 1 - beat * 2.2);
  }

  if (shader) {
    shader.render({
      time: state.t,
      colorA: visual.a,
      colorB: visual.b,
      accent: visual.accent,
      aperturePos: visual.pos,
      apertureSize: visual.size,
      apertureRadius: visual.radius,
      flash: state.flash,
      shake: state.shake,
      grain: visual.grain,
      aberration: visual.aberration,
      glitch: visual.glitch,
      fog: visual.fog,
      pulse,
    });
  }

  // The 2D canvas is transparent over the backdrop — clear it each frame so
  // pipes don't smear across previous positions.
  ctx.clearRect(0, 0, canvas.width, canvas.height);

  ctx.save();
  if (state.shake > 0) {
    ctx.translate(
      Math.round((Math.random() - 0.5) * state.shake * TEX),
      Math.round((Math.random() - 0.5) * state.shake * TEX)
    );
  }

  for (const p of state.pipes) drawMonolith(p, era, goat);

  // Donda: a dithered diamond of light so Kanye never vanishes into the void.
  if (era.id === 'donda') {
    const px = tx(state.kanye.x), py = tx(state.kanye.y);
    ctx.drawImage(DONDA_HALO, px - 18, py - 18);
  }

  // Gold ego aura: a ring that thickens as the head inflates.
  if (state.ego > 0.15 && state.mode === 'playing') {
    const px = tx(state.kanye.x), py = tx(state.kanye.y);
    const a = 0.35 * state.ego;
    const r = 13 + Math.round(state.ego * 4);
    ctx.fillStyle = `rgba(240,195,60,${a})`;
    ctx.fillRect(px - r, py - r, r * 2, 1);
    ctx.fillRect(px - r, py + r - 1, r * 2, 1);
    ctx.fillRect(px - r, py - r, 1, r * 2);
    ctx.fillRect(px + r - 1, py - r, 1, r * 2);
  }

  // Boundary grace: a pulsing 1-texel ring around the sprite — "can't die yet".
  if (state.graceT > 0 && state.mode === 'playing') {
    const px = tx(state.kanye.x), py = tx(state.kanye.y);
    const a = Math.max(0, 0.5 * Math.min(1, state.graceT) * (0.65 + 0.35 * Math.sin(state.t * 12)));
    const r = 15;
    ctx.fillStyle = `rgba(255,255,255,${a})`;
    ctx.fillRect(px - r, py - r, r * 2, 1);
    ctx.fillRect(px - r, py + r - 1, r * 2, 1);
    ctx.fillRect(px - r, py - r, 1, r * 2);
    ctx.fillRect(px + r - 1, py - r, 1, r * 2);
  }

  // Particles: 1-texel motes with life-faded alpha.
  for (const p of parts) {
    ctx.fillStyle = `rgba(${p.rgb[0] | 0},${p.rgb[1] | 0},${p.rgb[2] | 0},${Math.min(1, p.life * 2)})`;
    ctx.fillRect(tx(p.x), tx(p.y), 1, 1);
  }

  drawKanye(ctx, kanye, state, TEX);

  // GOAT halo: a floating gold pixel ring above the head.
  if (goat && state.mode !== 'dead') {
    const px = tx(state.kanye.x);
    const py = tx(state.kanye.y) - 15 + Math.round(Math.sin(state.t * 3) * 1);
    ctx.fillStyle = 'rgba(255,215,0,0.9)';
    ctx.fillRect(px - 5, py, 10, 1);
    ctx.fillRect(px - 6, py + 1, 1, 1);
    ctx.fillRect(px + 5, py + 1, 1, 1);
  }

  // Death flash — red Yeezus burst.
  if (state.flash > 0) {
    ctx.fillStyle = `rgba(184,35,28,${state.flash * 0.6})`;
    ctx.fillRect(0, 0, canvas.width, canvas.height);
  }

  ctx.restore();
}

// Kick off
let last = performance.now();
function frame(now) {
  const dtRaw = Math.min((now - last) / 1000, 1 / 30);
  // Slow-mo during the finish interruption — everything breathes at 0.3×.
  // The slow-mo clock itself runs on real time.
  if (state.slowmoT > 0) state.slowmoT -= dtRaw;
  const dt = dtRaw * (state.slowmoT > 0 ? 0.3 : 1);
  last = now;
  state.t += dt;

  update(dt);
  render();

  requestAnimationFrame(frame);
}

// Re-fit on viewport changes. rAF-coalesced so a burst of resize events does one
// recompute per paint. H is fixed, so an in-progress game survives: Kanye's X is
// fixed in H-units and existing pipes keep valid logical coords — only the
// right-side spawn boundary moves.
let resizeRAF = 0;
window.addEventListener('resize', () => {
  cancelAnimationFrame(resizeRAF);
  resizeRAF = requestAnimationFrame(applyViewport);
});

reset();
renderEraDots();
if (save.runs === 0) onboardEl.style.display = 'block';
requestAnimationFrame((t) => { last = t; frame(t); });
