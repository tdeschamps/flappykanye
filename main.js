import { CHAMBERS, chamberFor } from './chambers.js';
import {
  PHYSICS, createGameState, resetGame, stepPhysics, stepDeath, flap as physicsFlap
} from './game.js';
import {
  createKanyeRig, placeKanye, updateKanyeRig, triggerFlap, triggerScore, resetKanyeRig
} from './kanye.js';
import * as audio from './audio.js';
import { createShaderBackdrop, hexToVec3, mixVec3 } from './shader.js';

const canvas = document.getElementById('game');
const ctx = canvas.getContext('2d');
const W = PHYSICS.W;
const H = PHYSICS.H;

const scoreEl = document.getElementById('score');
const bestEl = document.getElementById('best');
const chamberEl = document.getElementById('chamber');
const overlay = document.getElementById('overlay');
const deathChamberEl = document.getElementById('death-chamber');
const stageEl = document.getElementById('stage');
const bgCanvas = document.getElementById('bg');
const shader = createShaderBackdrop(bgCanvas);
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

const state = createGameState();
bestEl.textContent = state.best;

const PIPE_W = PHYSICS.PIPE_W;

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

// --- Drawing ---
function drawTurrellBackdrop(palette, time) {
  // Soft radial light field — homage to Turrell's Ganzfeld effect.
  const cx = W * (0.5 + Math.sin(time * 0.15) * 0.08);
  const cy = H * (0.55 + Math.cos(time * 0.11) * 0.06);
  const r0 = 20;
  const r1 = Math.max(W, H) * 0.9;
  const g = ctx.createRadialGradient(cx, cy, r0, cx, cy, r1);
  const inner = mixHex(palette.to, palette.from, 0.0);
  const outer = mixHex(palette.from, palette.to, 0.0);
  g.addColorStop(0, rgbToCss(inner, 1));
  g.addColorStop(0.55, rgbToCss(mixHex(palette.from, palette.to, 0.5), 1));
  g.addColorStop(1, rgbToCss(outer, 1));
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, W, H);

  // Inner aperture — the iconic Turrell rectangle of pure color.
  const apW = W * 0.62;
  const apH = H * 0.42;
  const apX = (W - apW) / 2;
  const apY = (H - apH) / 2 + Math.sin(time * 0.4) * 6;
  const ag = ctx.createLinearGradient(apX, apY, apX, apY + apH);
  ag.addColorStop(0, rgbToCss(mixHex(palette.to, '#ffffff', 0.15), 0.55));
  ag.addColorStop(1, rgbToCss(mixHex(palette.to, '#000000', 0.25), 0.55));
  ctx.fillStyle = ag;
  roundRect(apX, apY, apW, apH, 4);
  ctx.fill();

  // Faint horizon line — the brutalist division.
  ctx.fillStyle = 'rgba(0,0,0,0.25)';
  ctx.fillRect(0, H * 0.78, W, 2);

  // Film grain (very subtle).
  if (Math.random() < 1) {
    ctx.fillStyle = 'rgba(255,255,255,0.012)';
    for (let i = 0; i < 40; i++) {
      ctx.fillRect(Math.random()*W, Math.random()*H, 1, 1);
    }
  }
}

function roundRect(x, y, w, h, r) {
  ctx.beginPath();
  ctx.moveTo(x + r, y);
  ctx.lineTo(x + w - r, y);
  ctx.quadraticCurveTo(x + w, y, x + w, y + r);
  ctx.lineTo(x + w, y + h - r);
  ctx.quadraticCurveTo(x + w, y + h, x + w - r, y + h);
  ctx.lineTo(x + r, y + h);
  ctx.quadraticCurveTo(x, y + h, x, y + h - r);
  ctx.lineTo(x, y + r);
  ctx.quadraticCurveTo(x, y, x + r, y);
  ctx.closePath();
}

function drawMonolith(p, palette) {
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


function drawForegroundType(palette) {
  // Brutalist HUD elements drawn on the canvas — Yeezus tracklist energy.
  ctx.save();
  ctx.fillStyle = rgbToCss(hexToRgb(palette.accent), 0.18);
  ctx.font = '900 220px Helvetica, Arial, sans-serif';
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  // Drift the watermark like Turrell light shifts.
  const drift = Math.sin(state.t * 0.25) * 8;
  ctx.fillText(String(state.score), W / 2 + drift, H * 0.34);
  ctx.restore();
}

function update(dt) {
  if (state.mode === 'idle') {
    state.kanye.y = H * 0.5 + Math.sin(state.t * 3) * 16;
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
  const { from, to, t } = chamberFor(state.score);
  const palette = {
    from: { ...from },
    to:   { ...to },
    accent: from.accent,
  };
  // Crossfade colors between chambers.
  const blended = {
    a: '#' + mixHex(from.a, to.a, t).map(v => Math.round(v).toString(16).padStart(2,'0')).join(''),
    b: '#' + mixHex(from.b, to.b, t).map(v => Math.round(v).toString(16).padStart(2,'0')).join(''),
    accent: from.accent,
  };
  const drawPalette = { from: blended.a, to: blended.b, accent: blended.accent };

  if (shader) {
    const c = chamberFor(state.score);
    const a1 = hexToVec3(c.from.a), a2 = hexToVec3(c.to.a);
    const b1 = hexToVec3(c.from.b), b2 = hexToVec3(c.to.b);
    shader.render({
      time: state.t,
      colorA: mixVec3(a1, a2, c.t),
      colorB: mixVec3(b1, b2, c.t),
      accent: hexToVec3(c.from.accent),
      aperturePos: [0.5, 0.55],
      apertureSize: [0.62, 0.42],
      flash: state.flash,
      shake: state.shake,
      mode: state.mode === 'idle' ? 0 : state.mode === 'playing' ? 1 : 2,
    });
  }

  ctx.save();
  if (state.shake > 0) {
    ctx.translate(
      (Math.random() - 0.5) * state.shake,
      (Math.random() - 0.5) * state.shake
    );
  }

  if (!shader) drawTurrellBackdrop(drawPalette, state.t);
  if (!shader) drawForegroundType(drawPalette);
  for (const p of state.pipes) drawMonolith(p, drawPalette);
  // Death flash — red Yeezus burst.
  if (state.flash > 0) {
    ctx.fillStyle = `rgba(184,35,28,${state.flash * 0.6})`;
    ctx.fillRect(0, 0, W, H);
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

reset();
requestAnimationFrame((t) => { last = t; frame(t); });
