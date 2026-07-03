import { ERAS, POINTS_PER_ERA, eraFor } from './eras.js';
import {
  PHYSICS, recomputeDims, createGameState, resetGame, stepPhysics, stepDeath, flap as physicsFlap
} from './game.js';
import {
  createKanye, updateKanye, drawKanye, triggerFlap, triggerScore, resetKanye
} from './kanye.js';
import * as audio from './audio.js';
import { createShaderBackdrop, hexToVec3, mixVec3 } from './shader.js';

const canvas = document.getElementById('game');
const ctx = canvas.getContext('2d');

const scoreEl = document.getElementById('score');
const bestEl = document.getElementById('best');
const chamberEl = document.getElementById('chamber');
const overlay = document.getElementById('overlay');
const deathChamberEl = document.getElementById('death-chamber');
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

const state = createGameState();
bestEl.textContent = state.best;

const REDUCED = matchMedia('(prefers-reduced-motion: reduce)').matches;

// The eased visual state: one object of current shader values that
// exponentially approaches the active era's targets every frame. Room morphs,
// the death "rewind" to Dropout, and GOAT gold-washing all fall out of this
// single mechanism — no per-feature tween code.
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

function easeVisual(dt) {
  const { era } = eraFor(state.score);
  // Slow the ease during a choreographed transition so the room visibly
  // rebuilds itself over ~1.6s instead of snapping.
  const k = Math.min(1, dt * (state.transition ? 1.5 : 2.8));
  const to = (cur, target) => cur + (target - cur) * k;
  const toV = (cur, target) => { for (let i = 0; i < cur.length; i++) cur[i] = to(cur[i], target[i]); };
  toV(visual.a, hexToVec3(era.pal.a));
  toV(visual.b, hexToVec3(era.pal.b));
  toV(visual.accent, hexToVec3(era.pal.accent));
  toV(visual.pos, era.aperture.pos);
  toV(visual.size, era.aperture.size);
  visual.radius = to(visual.radius, era.aperture.radius);
  visual.grain = to(visual.grain, era.mood.grain);
  visual.aberration = to(visual.aberration, era.mood.aberration);
  visual.glitch = to(visual.glitch, REDUCED ? 0 : era.mood.glitch);
  visual.fog = to(visual.fog, era.mood.fog);

  // Physics ease with the same clock, so difficulty ramps as the room morphs.
  const tn = state.tuning;
  tn.gap = to(tn.gap, era.physics.gap);
  tn.dx = to(tn.dx, era.physics.speed * PHYSICS.H);
  tn.spawn = to(tn.spawn, era.physics.spawn);
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
}

// Era-boundary choreography: spawn hold creates a pipe-free breath, grace
// covers any leftover pipe, the card names the room, the eased visuals morph.
function startEraTransition() {
  const { era, lap } = eraFor(state.score);
  state.transition = { t: 0, dur: 1.6 };
  state.graceT = 2.1;
  state.spawnTimer = Math.max(state.spawnTimer, 2.1);
  ecRoman.textContent = lap > 0 ? `GOAT · LAP ${lap + 1} · ERA ${era.roman}` : `ERA ${era.roman}`;
  ecAlbum.textContent = era.album;
  ecMeta.textContent = `${era.year} · AFTER TURRELL: ${era.turrell}`;
  eraCard.classList.remove('hidden');
  stageEl.style.setProperty('--era-accent', era.pal.accent);
  audio.chamber(eraFor(state.score).idx);
}

function flap() {
  if (state.mode === 'idle') {
    state.mode = 'playing';
    overlay.classList.add('hidden');
    deathChamberEl.style.display = 'none';
  } else if (state.mode === 'dead') {
    reset();
    state.mode = 'playing';
    overlay.classList.add('hidden');
    deathChamberEl.style.display = 'none';
  }
  triggerFlap(kanye);
  audio.init();
  audio.flap();
  physicsFlap(state);
}

function die() {
  if (state.mode === 'dead') return;
  state.mode = 'dead';
  state.shake = REDUCED ? 10 : 22;
  state.flash = 1;
  audio.death();
  if (state.score > state.best) {
    state.best = state.score;
    localStorage.setItem('flappykanye_best', String(state.best));
    bestEl.textContent = state.best;
  }
  overlay.classList.remove('hidden');
  deathChamberEl.style.display = 'block';
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
  };
  window.__tick = (dt = 1 / 60) => { state.t += dt; update(dt); render(); };
  // Autopilot: play N frames steering toward the nearest gap center. Returns
  // mode:score so fairness checks can assert survival.
  window.__auto = (frames = 300) => {
    if (state.mode !== 'playing') {
      state.mode = 'playing';
      overlay.classList.add('hidden');
      deathChamberEl.style.display = 'none';
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

function drawMonolith(p, era) {
  let x = tx(p.x);
  const w = Math.max(2, tx(PHYSICS.PIPE_W));
  const topH = tx(p.gapY);
  const botY = tx(p.gapY + p.gapH);
  const botH = canvas.height - botY;
  const ink = era.pal.ink;
  const rim = hexToRgb(era.pal.rim);

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


function update(dt) {
  if (state.mode === 'idle') {
    state.kanye.y = PHYSICS.H * 0.5 + Math.sin(state.t * 3) * 16;
    state.kanye.rot = Math.sin(state.t * 3) * 0.1;
  }
  if (state.mode === 'playing') {
    const ev = stepPhysics(state, dt);
    if (ev === 'score') {
      scoreEl.textContent = String(state.score);
      chamberEl.textContent = eraLabel(state.score);
      triggerScore(kanye);
      audio.score(state.lastScoredGapY);
      if (state.score % POINTS_PER_ERA === 0) startEraTransition();
    } else if (ev === 'death') {
      die();
    }
  }
  if (state.mode === 'dead') {
    stepDeath(state, dt);
  }
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
  updateKanye(kanye, state, dt);
}

function render() {
  const { era } = eraFor(state.score);

  // Heartbeat pulse: only alive in the 808s room (bed phase drives this
  // properly once music.js lands; a 60bpm lub-dub shape for now).
  let pulse = 0;
  if (era.obstacle === 'pulse') {
    const beat = state.t % 1;
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

  for (const p of state.pipes) drawMonolith(p, era);

  // Donda: a faint square halo so Kanye never vanishes into the void.
  if (era.id === 'donda') {
    const px = tx(state.kanye.x), py = tx(state.kanye.y);
    for (const [r, a] of [[16, 0.04], [11, 0.06], [7, 0.09]]) {
      ctx.fillStyle = `rgba(232,228,218,${a})`;
      ctx.fillRect(px - r, py - r, r * 2, r * 2);
    }
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

  drawKanye(ctx, kanye, state, TEX);
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
  const dtRaw = (now - last) / 1000;
  const dt = Math.min(dtRaw, 1 / 30);
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
requestAnimationFrame((t) => { last = t; frame(t); });
