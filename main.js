import { CHAMBERS, chamberFor } from './chambers.js';
import {
  PHYSICS, recomputeDims, createGameState, resetGame, stepPhysics, stepDeath, flap as physicsFlap
} from './game.js';
import {
  createKanyeRig, placeKanye, updateKanyeRig, triggerFlap, triggerScore, resetKanyeRig
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
const bgCanvas = document.getElementById('bg');
const shader = createShaderBackdrop(bgCanvas);
// Honest degradation: no parallel renderer — a static CSS gradient (style.css).
if (!shader) document.body.classList.add('no-webgl');
const kanyeSvg = document.getElementById('kanye');
const kanyeRig = createKanyeRig(kanyeSvg);

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
function mixHex(h1, h2, t) {
  const a = hexToRgb(h1), b = hexToRgb(h2);
  return [lerp(a[0],b[0],t), lerp(a[1],b[1],t), lerp(a[2],b[2],t)];
}

// Size the 2D canvas backing store to the playfield × devicePixelRatio, then map
// the logical W×H coordinate space onto it via setTransform so every draw call
// keeps working in logical units regardless of viewport size or DPR.
function sizeGameCanvas() {
  const dpr = Math.min(window.devicePixelRatio || 1, 2);
  canvas.width = Math.round(PHYSICS.W * dpr);
  canvas.height = Math.round(PHYSICS.H * dpr);
  ctx.setTransform(canvas.width / PHYSICS.W, 0, 0, canvas.height / PHYSICS.H, 0, 0);
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
  resetKanyeRig(kanyeRig);
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
  triggerFlap(kanyeRig);
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

// --- Drawing ---
function drawMonolith(p, palette) {
  const H = PHYSICS.H, PIPE_W = PHYSICS.PIPE_W;
  // Brutalist Donda-black slab with a sharp bone-white edge.
  const topH = p.gapY;
  const botY = p.gapY + p.gapH;
  const botH = H - botY;

  const slabFill = '#0a0a0a';
  const edge = mixHex(palette.accent, '#ffffff', 0.2);

  ctx.fillStyle = slabFill;
  ctx.fillRect(p.x, 0, PIPE_W, topH);
  ctx.fillRect(p.x, botY, PIPE_W, botH);

  // Inner light bleed where the gap opens — Turrell aperture light spilling out.
  const bleedH = 14;
  const bg = ctx.createLinearGradient(p.x, p.gapY - bleedH, p.x, p.gapY);
  bg.addColorStop(0, 'rgba(0,0,0,0)');
  bg.addColorStop(1, rgbToCss(hexToRgb(palette.accent), 0.55));
  ctx.fillStyle = bg;
  ctx.fillRect(p.x, p.gapY - bleedH, PIPE_W, bleedH);

  const bg2 = ctx.createLinearGradient(p.x, botY, p.x, botY + bleedH);
  bg2.addColorStop(0, rgbToCss(hexToRgb(palette.accent), 0.55));
  bg2.addColorStop(1, 'rgba(0,0,0,0)');
  ctx.fillStyle = bg2;
  ctx.fillRect(p.x, botY, PIPE_W, bleedH);

  // Hard right edge highlight.
  ctx.fillStyle = rgbToCss(edge, 0.9);
  ctx.fillRect(p.x + PIPE_W - 2, 0, 2, topH);
  ctx.fillRect(p.x + PIPE_W - 2, botY, 2, botH);

  // Industrial yeezus serial number on each slab.
  ctx.save();
  ctx.fillStyle = 'rgba(235,230,220,0.45)';
  ctx.font = '900 11px Helvetica, Arial, sans-serif';
  ctx.translate(p.x + PIPE_W / 2, topH - 14);
  ctx.rotate(-Math.PI / 2);
  ctx.textAlign = 'left';
  ctx.fillText('YZS · 06 · ' + (p.gapY|0), 0, 4);
  ctx.restore();
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
      triggerScore(kanyeRig);
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
  const palette = chamberFor(state.score);
  const accent = palette.from.accent;
  updateKanyeRig(kanyeRig, state, dt, accent);
  placeKanye(kanyeRig, state.kanye, stageEl);
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
  ctx.clearRect(0, 0, PHYSICS.W, PHYSICS.H);

  ctx.save();
  if (state.shake > 0) {
    ctx.translate(
      (Math.random() - 0.5) * state.shake,
      (Math.random() - 0.5) * state.shake
    );
  }

  for (const p of state.pipes) drawMonolith(p, drawPalette);
  // Death flash — red Yeezus burst.
  if (state.flash > 0) {
    ctx.fillStyle = `rgba(184,35,28,${state.flash * 0.6})`;
    ctx.fillRect(0, 0, PHYSICS.W, PHYSICS.H);
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
