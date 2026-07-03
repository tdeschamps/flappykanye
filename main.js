import { CHAMBERS, chamberFor } from './chambers.js';
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
const bgCanvas = document.getElementById('bg');
const shader = createShaderBackdrop(bgCanvas);
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

function reset() {
  resetGame(state);
  resetKanye(kanye);
  scoreEl.textContent = '0';
  chamberEl.textContent = CHAMBERS[0].name;
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
  state.shake = 22;
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

// --- Debug (?debug): keys 1–7 jump to chamber boundaries, G to a late lap ---
const DEBUG = new URLSearchParams(location.search).has('debug');
if (DEBUG) {
  window.addEventListener('keydown', (e) => {
    let target = null;
    if (e.key >= '1' && e.key <= '7') target = (Number(e.key) - 1) * 5;
    if (e.key === 'g' || e.key === 'G') target = 30;
    if (target === null) return;
    state.score = target;
    scoreEl.textContent = String(state.score);
    chamberEl.textContent = chamberFor(state.score).from.name;
  });
}

// --- Drawing (texel space) ---
function drawMonolith(p, palette) {
  const x = tx(p.x);
  const w = Math.max(2, tx(PHYSICS.PIPE_W));
  const topH = tx(p.gapY);
  const botY = tx(p.gapY + p.gapH);
  const botH = canvas.height - botY;
  const accent = hexToRgb(palette.accent);

  // Chunky slab body with a subtle left bevel.
  ctx.fillStyle = '#0a0a0a';
  ctx.fillRect(x, 0, w, topH);
  ctx.fillRect(x, botY, w, botH);
  ctx.fillStyle = 'rgba(255,255,255,0.07)';
  ctx.fillRect(x, 0, 1, topH);
  ctx.fillRect(x, botY, 1, botH);

  // 1-texel accent rim on the lit (right) edge.
  ctx.fillStyle = rgbToCss(accent, 0.9);
  ctx.fillRect(x + w - 1, 0, 1, topH);
  ctx.fillRect(x + w - 1, botY, 1, botH);

  // Gap mouths: hard 1-texel light line + a dimmer step — pixel bloom.
  ctx.fillStyle = rgbToCss(accent, 0.85);
  ctx.fillRect(x, topH - 1, w, 1);
  ctx.fillRect(x, botY, w, 1);
  ctx.fillStyle = rgbToCss(accent, 0.3);
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
      chamberEl.textContent = chamberFor(state.score).from.name;
      triggerScore(kanye);
      audio.score(state.lastScoredGapY);
      if (state.score % 5 === 0) audio.chamber(chamberFor(state.score).idx);
    } else if (ev === 'death') {
      die();
    }
  }
  if (state.mode === 'dead') {
    stepDeath(state, dt);
  }
  if (state.shake > 0) state.shake = Math.max(0, state.shake - dt * 60);
  if (state.flash > 0) state.flash = Math.max(0, state.flash - dt * 2);
  updateKanye(kanye, state, dt);
}

function render() {
  const c = chamberFor(state.score);
  const drawPalette = { accent: c.from.accent };

  if (shader) {
    const a1 = hexToVec3(c.from.a), a2 = hexToVec3(c.to.a);
    const b1 = hexToVec3(c.from.b), b2 = hexToVec3(c.to.b);
    // Crossfade aperture geometry between chambers so the shape morphs gradually.
    const pos  = [lerp(c.from.pos[0],  c.to.pos[0],  c.t),
                  lerp(c.from.pos[1],  c.to.pos[1],  c.t)];
    const size = [lerp(c.from.size[0], c.to.size[0], c.t),
                  lerp(c.from.size[1], c.to.size[1], c.t)];
    const radius = lerp(c.from.radius, c.to.radius, c.t);
    shader.render({
      time: state.t,
      colorA: mixVec3(a1, a2, c.t),
      colorB: mixVec3(b1, b2, c.t),
      accent: hexToVec3(c.from.accent),
      aperturePos: pos,
      apertureSize: size,
      apertureRadius: radius,
      flash: state.flash,
      shake: state.shake,
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

  for (const p of state.pipes) drawMonolith(p, drawPalette);
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
