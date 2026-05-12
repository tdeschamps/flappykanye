# Flappy Kanye Upgrade Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Transform the single-file Flappy Kanye prototype into a mind-blowing experience by adding procedural Yeezus-style audio, a rigged SVG Kanye character, and a WebGL Turrell shader backdrop.

**Architecture:** Split monolithic `index.html` into ES modules. Stack three render layers inside `#stage`: WebGL backdrop (background), Canvas2D pipes/FX (mid), inline SVG rig (foreground), with a Web Audio graph running in parallel. Each layer fails independently — gameplay never breaks because of audio or shader.

**Tech Stack:** Vanilla ES modules, Canvas2D, WebGL 1, Web Audio API, inline SVG. No build step. No dependencies.

**Verification model:** This is a single-page game with no test framework. Each task's verification step is "open `index.html` in browser, observe X, confirm Y" — adding a test harness would violate the project's stated principle of fast iteration over sophisticated tooling (see `CLAUDE.md` Karpathy rule 8). To keep verification quick, open the file once at the start of a session and use the browser's reload shortcut between tasks.

---

## File Layout

After this plan completes, the repository will look like:

```
flappykanye/
├── CLAUDE.md
├── index.html         # stage, canvases, SVG rig markup, HUD
├── style.css          # extracted styles
├── main.js            # entry point, game loop, input, state machine
├── game.js            # physics, pipes, collisions, scoring
├── kanye.js           # SVG rig animation
├── chambers.js        # chamber palettes + audio cue config
├── shader.js          # WebGL program, GLSL strings, uniform sync
├── audio.js           # AudioContext, voices, FX bus, public API
└── docs/superpowers/  # specs and plans
```

---

## Task 1: Split monolithic HTML into ES modules (no behavior change)

**Goal:** Extract the existing inline `<style>` and `<script>` into separate files. Game behaves identically — this is pure restructuring so subsequent tasks have clean seams to work against.

**Files:**
- Modify: `index.html`
- Create: `style.css`
- Create: `main.js`

- [ ] **Step 1: Create `style.css` with the existing inline styles**

Copy the entire contents of the `<style>...</style>` block from `index.html` (lines starting at `:root {` through the closing `}` of `.death-chamber`) into a new file `style.css`. Do not modify the CSS itself.

- [ ] **Step 2: Create `main.js` with the existing inline script body**

Copy the entire IIFE body from `<script>...</script>` in `index.html` into a new file `main.js`. Remove the outer `(() => { ... })();` wrapper — ES modules already have their own scope. Keep all internal code identical.

- [ ] **Step 3: Rewrite `index.html` to reference the external files**

Replace the inline `<style>` block with `<link rel="stylesheet" href="style.css" />` in the `<head>`. Replace the inline `<script>` block at the bottom of `<body>` with `<script type="module" src="main.js"></script>`. Keep all the rest of the HTML (the `#stage`, `canvas#game`, HUD divs, overlay) unchanged.

- [ ] **Step 4: Verify in browser**

Run from the project root:
```bash
python3 -m http.server 8000
```
Open `http://localhost:8000/` and confirm: title screen appears, tapping/spacebar starts the game, pipes spawn, score increments, death overlay shows on collision. Behavior must be identical to before the split.

(`file://` won't work for ES modules — must serve over HTTP.)

- [ ] **Step 5: Commit**

```bash
git add index.html style.css main.js
git commit -m "refactor: split index.html into style.css + main.js module"
```

---

## Task 2: Extract chamber definitions into `chambers.js`

**Goal:** Isolate chamber data so audio and shader modules can import it without dragging in game logic.

**Files:**
- Create: `chambers.js`
- Modify: `main.js`

- [ ] **Step 1: Create `chambers.js` with palette data and helper**

Create file `chambers.js`:

```js
export const CHAMBERS = [
  { name: 'CHAMBER I — AFRUM',     a: '#1a0d2a', b: '#6e2bd1', accent: '#f9d34a' },
  { name: 'CHAMBER II — RAEMAR',   a: '#0a1e2e', b: '#1a7fb0', accent: '#ebe6dc' },
  { name: 'CHAMBER III — ROETHKO', a: '#2a0606', b: '#b8231c', accent: '#0a0a0a' },
  { name: 'CHAMBER IV — GANZFELD', a: '#f3ead8', b: '#d9b27a', accent: '#0a0a0a' },
  { name: 'CHAMBER V — KAMUELA',   a: '#04141a', b: '#1c5a5a', accent: '#c7f9a8' },
  { name: 'CHAMBER VI — VOID',     a: '#000000', b: '#1a1a1a', accent: '#b8231c' },
];

export function chamberFor(score) {
  const idx = score / 5;
  const i = Math.floor(idx) % CHAMBERS.length;
  const j = (i + 1) % CHAMBERS.length;
  const t = idx - Math.floor(idx);
  return { from: CHAMBERS[i], to: CHAMBERS[j], t, idx: i };
}
```

- [ ] **Step 2: Update `main.js` to import from `chambers.js`**

At the top of `main.js`, add:
```js
import { CHAMBERS, chamberFor } from './chambers.js';
```

Delete the local `CHAMBERS` constant and the local `chamberFor` function from `main.js`. Everything that references them already uses the same names, so no other changes are needed.

- [ ] **Step 3: Verify in browser**

Reload `http://localhost:8000/`. Play through 5+ pipes, confirm the chamber name in the HUD changes after the 5th score, palette crossfades between chambers. Behavior must be identical to Task 1.

- [ ] **Step 4: Commit**

```bash
git add chambers.js main.js
git commit -m "refactor: extract chamber data into chambers.js"
```

---

## Task 3: Extract game physics into `game.js`

**Goal:** Isolate physics, pipes, and collisions so `main.js` becomes just the loop and glue.

**Files:**
- Create: `game.js`
- Modify: `main.js`

- [ ] **Step 1: Create `game.js` exporting physics constants, state factory, and step functions**

Create file `game.js`:

```js
export const PHYSICS = {
  W: 540, H: 960,
  GRAVITY: 1700,
  FLAP: -520,
  PIPE_GAP: 230,
  PIPE_W: 110,
  PIPE_DX: 220,
  PIPE_SPAWN: 1.45,
  KANYE_X: 540 * 0.28,
  KANYE_R: 22,
};

export function createGameState() {
  return {
    mode: 'idle',
    t: 0,
    score: 0,
    best: parseInt(localStorage.getItem('flappykanye_best') || '0', 10),
    pipes: [],
    spawnTimer: 0,
    kanye: { x: PHYSICS.KANYE_X, y: PHYSICS.H * 0.5, vy: 0, rot: 0 },
    shake: 0,
    flash: 0,
  };
}

export function resetGame(state) {
  state.pipes = [];
  state.spawnTimer = 0;
  state.kanye.y = PHYSICS.H * 0.5;
  state.kanye.vy = 0;
  state.kanye.rot = 0;
  state.score = 0;
  state.t = 0;
  state.shake = 0;
  state.flash = 0;
}

export function spawnPipe(state) {
  const margin = 110;
  const gapY = margin + Math.random() * (PHYSICS.H - margin * 2 - PHYSICS.PIPE_GAP);
  state.pipes.push({ x: PHYSICS.W + PHYSICS.PIPE_W, gapY, gapH: PHYSICS.PIPE_GAP, passed: false });
}

// Returns one of: null | 'score' | 'death'
// When 'score', the gapY of the scored pipe is in state.lastScoredGapY for audio cue.
export function stepPhysics(state, dt) {
  if (state.mode !== 'playing') return null;

  state.kanye.vy += PHYSICS.GRAVITY * dt;
  state.kanye.y += state.kanye.vy * dt;
  const target = Math.max(-0.5, Math.min(1.2, state.kanye.vy / 700));
  state.kanye.rot += (target - state.kanye.rot) * Math.min(1, dt * 8);

  state.spawnTimer -= dt;
  if (state.spawnTimer <= 0) {
    spawnPipe(state);
    state.spawnTimer = PHYSICS.PIPE_SPAWN;
  }

  let scored = false;
  for (const p of state.pipes) {
    p.x -= PHYSICS.PIPE_DX * dt;
    if (!p.passed && p.x + PHYSICS.PIPE_W < state.kanye.x - PHYSICS.KANYE_R) {
      p.passed = true;
      state.score += 1;
      state.lastScoredGapY = p.gapY;
      scored = true;
    }
  }
  state.pipes = state.pipes.filter(p => p.x + PHYSICS.PIPE_W > -40);

  const { kanye } = state;
  const r = PHYSICS.KANYE_R;
  if (kanye.y - r < 0 || kanye.y + r > PHYSICS.H) return 'death';
  for (const p of state.pipes) {
    if (kanye.x + r < p.x || kanye.x - r > p.x + PHYSICS.PIPE_W) continue;
    if (kanye.y - r < p.gapY || kanye.y + r > p.gapY + p.gapH) return 'death';
  }

  return scored ? 'score' : null;
}

export function stepDeath(state, dt) {
  state.kanye.vy += PHYSICS.GRAVITY * dt;
  state.kanye.y += state.kanye.vy * dt;
  state.kanye.rot += dt * 4;
  state.kanye.y = Math.min(state.kanye.y, PHYSICS.H - 24);
}

export function flap(state) {
  state.kanye.vy = PHYSICS.FLAP;
}
```

- [ ] **Step 2: Rewrite `main.js` to use `game.js`**

Replace the existing `state`, `GRAVITY`, `FLAP`, `PIPE_*`, `reset()`, `flap()`, `spawnPipe()`, and the playing/death branches inside `update()` with calls to the new module. The replacement structure of `main.js`:

```js
import { CHAMBERS, chamberFor } from './chambers.js';
import {
  PHYSICS, createGameState, resetGame, stepPhysics, stepDeath, flap as physicsFlap
} from './game.js';

const canvas = document.getElementById('game');
const ctx = canvas.getContext('2d');
const W = PHYSICS.W;
const H = PHYSICS.H;

const scoreEl = document.getElementById('score');
const bestEl = document.getElementById('best');
const chamberEl = document.getElementById('chamber');
const overlay = document.getElementById('overlay');
const deathChamberEl = document.getElementById('death-chamber');

const state = createGameState();
bestEl.textContent = state.best;

function reset() {
  resetGame(state);
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
  physicsFlap(state);
}

function die() {
  if (state.mode === 'dead') return;
  state.mode = 'dead';
  state.shake = 22;
  state.flash = 1;
  if (state.score > state.best) {
    state.best = state.score;
    localStorage.setItem('flappykanye_best', String(state.best));
    bestEl.textContent = state.best;
  }
  overlay.classList.remove('hidden');
  deathChamberEl.style.display = 'block';
}

// ... keep all existing input listeners (keydown, pointerdown), drawing
// functions (drawTurrellBackdrop, roundRect, drawMonolith, drawKanye,
// drawForegroundType), and the render() function exactly as they are.

function update(dt) {
  if (state.mode === 'idle') {
    state.kanye.y = H * 0.5 + Math.sin(state.t * 3) * 16;
    state.kanye.rot = Math.sin(state.t * 3) * 0.1;
    return;
  }
  if (state.mode === 'playing') {
    const ev = stepPhysics(state, dt);
    if (ev === 'score') {
      scoreEl.textContent = String(state.score);
      chamberEl.textContent = chamberFor(state.score).from.name;
    } else if (ev === 'death') {
      die();
    }
  }
  if (state.mode === 'dead') {
    stepDeath(state, dt);
  }
  if (state.shake > 0) state.shake = Math.max(0, state.shake - dt * 60);
  if (state.flash > 0) state.flash = Math.max(0, state.flash - dt * 2);
}

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
```

- [ ] **Step 3: Verify in browser**

Reload. Play through 10+ pipes. Confirm: scoring works, dying works, restarting works, shake on death is visible. Behavior identical to before.

- [ ] **Step 4: Commit**

```bash
git add game.js main.js
git commit -m "refactor: extract physics into game.js"
```

---

## Task 4: Add inline SVG Kanye rig markup to `index.html`

**Goal:** Add the SVG element with all 9 layers, positioned absolutely inside `#stage`. The rig is initially static and hidden — Task 5 wires it up.

**Files:**
- Modify: `index.html`
- Modify: `style.css`

- [ ] **Step 1: Add the SVG markup inside `#stage`**

In `index.html`, immediately after the `<canvas id="game" ...></canvas>` line, add this SVG block:

```html
<svg id="kanye" class="kanye" viewBox="-40 -40 80 80" width="80" height="80" aria-hidden="true">
  <g id="k-root">
    <!-- back-to-front layers -->
    <ellipse id="k-shadow" cx="2" cy="34" rx="22" ry="4" fill="rgba(0,0,0,0.35)"/>
    <g id="k-body">
      <path d="M -22 28 Q 0 44 22 28 L 22 38 L -22 38 Z" fill="#0a0a0a"/>
    </g>
    <g id="k-jaw" transform="translate(0 0)">
      <ellipse cx="0" cy="14" rx="18" ry="10" fill="#8a5d3d"/>
      <path id="k-mouth" d="M -8 14 Q 0 18 8 14" stroke="#3a1f0f" stroke-width="1.5" fill="none" stroke-linecap="round"/>
    </g>
    <g id="k-head">
      <ellipse cx="0" cy="0" rx="27" ry="28" fill="#a8754f"/>
      <ellipse cx="-26" cy="2" rx="3" ry="5" fill="#a8754f"/>
      <ellipse cx="26" cy="2" rx="3" ry="5" fill="#a8754f"/>
      <path d="M -2 4 Q 0 8 2 4" stroke="#7a4a2a" stroke-width="1.2" fill="none"/>
    </g>
    <g id="k-cap" transform="rotate(0)">
      <path d="M -26 -10 A 26 18 0 0 1 26 -10 L 26 -6 L -26 -6 Z" fill="#0a0a0a"/>
      <rect x="2" y="-10" width="28" height="4" fill="#0a0a0a"/>
      <rect x="-24" y="-22" width="12" height="2" fill="#1a1a1a"/>
    </g>
    <g id="k-glasses">
      <rect x="-22" y="-4" width="44" height="10" fill="#0a0a0a"/>
      <g id="k-slats" stroke="#b8231c" stroke-width="1.2" stroke-linecap="round">
        <line x1="-20" y1="-2"   x2="20" y2="-2"/>
        <line x1="-20" y1="0.2"  x2="20" y2="0.2"/>
        <line x1="-20" y1="2.4"  x2="20" y2="2.4"/>
        <line x1="-20" y1="4.6"  x2="20" y2="4.6"/>
      </g>
      <rect id="k-glint" x="-22" y="-4" width="6" height="10" fill="rgba(255,255,255,0.45)" opacity="0"/>
    </g>
  </g>
</svg>
```

- [ ] **Step 2: Add styles for the SVG in `style.css`**

Append to `style.css`:

```css
.kanye {
  position: absolute;
  left: 0;
  top: 0;
  width: 80px;
  height: 80px;
  pointer-events: none;
  transform: translate3d(0, 0, 0);
  will-change: transform;
  z-index: 2;
}
.kanye #k-root {
  transform-box: fill-box;
  transform-origin: center;
}
```

- [ ] **Step 3: Stop drawing the Canvas2D Kanye**

In `main.js`, find the call site `drawKanye(state.kanye, drawPalette);` inside `render()` and delete that line. Keep the `drawKanye` function definition for now (Task 5 deletes it).

- [ ] **Step 4: Verify in browser**

Reload. Confirm: the SVG Kanye appears in the top-left of the stage (it's not positioned yet — that's Task 5). The Canvas2D Kanye is gone. Pipes still scroll, score still increments, scoring on collision still works (Kanye collision uses physics, not rendering).

- [ ] **Step 5: Commit**

```bash
git add index.html style.css main.js
git commit -m "feat: add inline SVG Kanye rig markup"
```

---

## Task 5: Wire SVG Kanye rig animation in `kanye.js`

**Goal:** SVG Kanye moves with game state — position, rotation, jaw drop, cap tilt, glint sweep, slat color crossfade, death tumble.

**Files:**
- Create: `kanye.js`
- Modify: `main.js`

- [ ] **Step 1: Create `kanye.js`**

Create file `kanye.js`:

```js
import { PHYSICS } from './game.js';

const STAGE_TO_VIEWBOX = 80 / PHYSICS.W * PHYSICS.W; // px size = 80 in stage coords
const SVG_HALF = 40; // SVG is 80px wide, centered

export function createKanyeRig(svgEl) {
  return {
    root:    svgEl,
    inner:   svgEl.querySelector('#k-root'),
    head:    svgEl.querySelector('#k-head'),
    jaw:     svgEl.querySelector('#k-jaw'),
    cap:     svgEl.querySelector('#k-cap'),
    glasses: svgEl.querySelector('#k-glasses'),
    glint:   svgEl.querySelector('#k-glint'),
    slats:   [...svgEl.querySelectorAll('#k-slats line')],
    body:    svgEl.querySelector('#k-body'),
    // Animation state
    jawDrop: 0,        // 0..1, decays after flap; 1.0 on death
    glintT: 0,         // 0..1, sweeps right after flap
    headBob: 0,        // px, decays after flap
    slatColor: '#b8231c',
    capFall: null,     // { x, y, vy, rot } during death animation
    deathTilt: 0,
  };
}

// Convert game-stage (540x960) coordinates to CSS pixels inside #stage.
// The stage scales to fit, so we use percentages.
function stagePctX(x) { return (x / PHYSICS.W) * 100; }
function stagePctY(y) { return (y / PHYSICS.H) * 100; }

export function placeKanye(rig, kanye, stageEl) {
  const sw = stageEl.clientWidth;
  const sh = stageEl.clientHeight;
  const px = (kanye.x / PHYSICS.W) * sw - SVG_HALF;
  const py = (kanye.y / PHYSICS.H) * sh - SVG_HALF;
  rig.root.style.transform = `translate3d(${px}px, ${py - rig.headBob}px, 0)`;
}

export function updateKanyeRig(rig, state, dt, accentColor) {
  // Decays
  rig.jawDrop = Math.max(0, rig.jawDrop - dt * 4);
  rig.glintT  = state.mode === 'idle' ? 0 : Math.min(1.2, rig.glintT + dt * 4);
  rig.headBob = Math.max(0, rig.headBob - dt * 50);

  // Body rotation from velocity
  let rot;
  if (state.mode === 'idle') {
    rot = Math.sin(state.t * 3) * 6;
  } else if (state.mode === 'dead') {
    rig.deathTilt += dt * 200;
    rot = rig.deathTilt;
    rig.jawDrop = 1;
  } else {
    rot = Math.max(-30, Math.min(60, state.kanye.vy * 0.06));
  }
  rig.inner.setAttribute('transform', `rotate(${rot.toFixed(2)})`);

  // Cap tilt at 30% of body rotation, plus idle drift
  const capTilt = rot * 0.3 + (state.mode === 'idle' ? Math.sin(state.t * 0.5) * 3 : 0);
  rig.cap.setAttribute('transform', `rotate(${capTilt.toFixed(2)} 0 -10)`);

  // Jaw drop
  const jawY = rig.jawDrop * 6 + (state.mode === 'dead' ? 4 : 0);
  rig.jaw.setAttribute('transform', `translate(0 ${jawY.toFixed(2)})`);

  // Glint sweep — opacity high during sweep window, x interpolated
  if (rig.glintT < 1 && rig.glintT > 0) {
    const op = Math.sin(rig.glintT * Math.PI) * 0.85;
    const x  = -22 + rig.glintT * 40;
    rig.glint.setAttribute('opacity', op.toFixed(2));
    rig.glint.setAttribute('x', x.toFixed(2));
  } else {
    rig.glint.setAttribute('opacity', '0');
  }

  // Slat color crossfade toward chamber accent
  if (rig.slatColor !== accentColor) {
    rig.slatColor = accentColor;
    for (const ln of rig.slats) ln.setAttribute('stroke', accentColor);
  }

  // Glasses tilt on death
  if (state.mode === 'dead') {
    rig.glasses.setAttribute('transform', 'rotate(-15)');
  } else {
    rig.glasses.removeAttribute('transform');
  }
}

export function triggerFlap(rig) {
  rig.jawDrop = 0.7;
  rig.glintT = 0.01;
  rig.headBob = 8;
}

export function triggerScore(rig) {
  rig.jawDrop = Math.max(rig.jawDrop, 0.9);
}

export function resetKanyeRig(rig) {
  rig.jawDrop = 0;
  rig.glintT = 0;
  rig.headBob = 0;
  rig.deathTilt = 0;
  rig.capFall = null;
  rig.glasses.removeAttribute('transform');
}
```

- [ ] **Step 2: Wire the rig into `main.js`**

At the top of `main.js`, add:
```js
import {
  createKanyeRig, placeKanye, updateKanyeRig, triggerFlap, triggerScore, resetKanyeRig
} from './kanye.js';
```

After `const overlay = document.getElementById('overlay');`, add:
```js
const stageEl = document.getElementById('stage');
const kanyeSvg = document.getElementById('kanye');
const kanyeRig = createKanyeRig(kanyeSvg);
```

Modify `flap()` to call `triggerFlap(kanyeRig)` immediately before `physicsFlap(state)`.

Modify `reset()` to call `resetKanyeRig(kanyeRig)` after `resetGame(state)`.

In `update(dt)`, after handling the `'score'` branch (`scoreEl.textContent = ...`), add `triggerScore(kanyeRig);`.

At the end of `update(dt)`, before the closing brace, add:
```js
const palette = chamberFor(state.score);
const accent = palette.from.accent;
updateKanyeRig(kanyeRig, state, dt, accent);
placeKanye(kanyeRig, state.kanye, stageEl);
```

Delete the `drawKanye` function from `main.js` (it is no longer referenced).

- [ ] **Step 3: Verify in browser**

Reload. Confirm:
- Kanye is positioned where the old Canvas2D Kanye was (left third of stage, vertically following physics).
- On flap: jaw drops briefly, head bobs up, white glint sweeps left-to-right across the shutter shades.
- On score: jaw drops more emphatically.
- On chamber transition (every 5 points): shutter slat color changes to the new chamber accent.
- On death: jaw stays open, glasses tilt off-axis, body spins.
- Idle mode (title screen): subtle head bob and cap drift.

- [ ] **Step 4: Commit**

```bash
git add kanye.js main.js
git commit -m "feat: animated SVG Kanye rig with jaw, glint, cap tilt, death tumble"
```

---

## Task 6: Wire up Web Audio in `audio.js` — synth voices and FX bus

**Goal:** Procedural audio module. Flap thuds, scoring clangs, chamber gospel stabs, death vocal chop, ambient bed underneath. Mute via `M` key.

**Files:**
- Create: `audio.js`
- Modify: `main.js`
- Modify: `index.html`
- Modify: `style.css`

- [ ] **Step 1: Create `audio.js`**

Create file `audio.js`:

```js
let ctx = null;
let masterGain = null;
let preFx = null;
let shaper = null;
let convolver = null;
let bedNodes = null;
let muted = localStorage.getItem('flappykanye_muted') === '1';

// Phrygian descending (E F G A B C D), wraps. Used to walk flap pitch.
const PHRYGIAN = [55, 52.2, 49, 46.25, 43.65, 41.2, 38.9];
let flapIdx = 0;

function makeDistortionCurve(amount = 60) {
  const n = 256;
  const curve = new Float32Array(n);
  const k = amount;
  for (let i = 0; i < n; i++) {
    const x = (i * 2) / n - 1;
    curve[i] = ((3 + k) * x * 20 * (Math.PI / 180)) / (Math.PI + k * Math.abs(x));
  }
  return curve;
}

function makePlateIR(audioCtx) {
  const len = Math.floor(audioCtx.sampleRate * 0.18);
  const buf = audioCtx.createBuffer(2, len, audioCtx.sampleRate);
  for (let c = 0; c < 2; c++) {
    const data = buf.getChannelData(c);
    for (let i = 0; i < len; i++) {
      const decay = Math.pow(1 - i / len, 2.4);
      data[i] = (Math.random() * 2 - 1) * decay * 0.6;
    }
  }
  return buf;
}

function ensureCtx() {
  if (ctx) return ctx;
  ctx = new (window.AudioContext || window.webkitAudioContext)();
  masterGain = ctx.createGain();
  masterGain.gain.value = muted ? 0 : 0.85;
  const limiter = ctx.createDynamicsCompressor();
  limiter.threshold.value = -6;
  limiter.knee.value = 0;
  limiter.ratio.value = 20;
  limiter.attack.value = 0.003;
  limiter.release.value = 0.1;

  preFx = ctx.createGain();
  preFx.gain.value = 0.9;
  shaper = ctx.createWaveShaper();
  shaper.curve = makeDistortionCurve(40);
  shaper.oversample = '4x';
  convolver = ctx.createConvolver();
  convolver.buffer = makePlateIR(ctx);

  // dry path (most signal) + wet (small plate)
  const dry = ctx.createGain(); dry.gain.value = 0.92;
  const wet = ctx.createGain(); wet.gain.value = 0.18;
  preFx.connect(shaper);
  shaper.connect(dry).connect(limiter);
  shaper.connect(convolver).connect(wet).connect(limiter);
  limiter.connect(masterGain).connect(ctx.destination);

  startBed();
  return ctx;
}

function startBed() {
  const g = ctx.createGain();
  g.gain.value = 0.04; // -28dB-ish, very quiet
  const lp = ctx.createBiquadFilter();
  lp.type = 'lowpass'; lp.frequency.value = 800; lp.Q.value = 0.6;

  const o1 = ctx.createOscillator(); o1.type = 'sawtooth'; o1.frequency.value = 55;
  const o2 = ctx.createOscillator(); o2.type = 'sawtooth'; o2.frequency.value = 55.4;
  o1.connect(lp); o2.connect(lp); lp.connect(g); g.connect(preFx);
  o1.start(); o2.start();

  const lfo = ctx.createOscillator(); lfo.frequency.value = 0.07;
  const lfoGain = ctx.createGain(); lfoGain.gain.value = 350;
  lfo.connect(lfoGain).connect(lp.frequency);
  lfo.start();

  bedNodes = { o1, o2, lfo, g };
}

export function init() {
  ensureCtx();
  if (ctx.state === 'suspended') ctx.resume();
}

export function setMuted(m) {
  muted = !!m;
  localStorage.setItem('flappykanye_muted', muted ? '1' : '0');
  if (masterGain) masterGain.gain.setTargetAtTime(muted ? 0 : 0.85, ctx.currentTime, 0.02);
}

export function isMuted() { return muted; }

export function flap() {
  if (!ctx) ensureCtx();
  const now = ctx.currentTime;
  const root = PHRYGIAN[flapIdx % PHRYGIAN.length];
  flapIdx++;

  const osc = ctx.createOscillator();
  osc.type = 'sine';
  osc.frequency.setValueAtTime(root * 2, now);
  osc.frequency.exponentialRampToValueAtTime(root * 0.72, now + 0.12);

  const g = ctx.createGain();
  g.gain.setValueAtTime(0.0001, now);
  g.gain.exponentialRampToValueAtTime(0.55, now + 0.005);
  g.gain.exponentialRampToValueAtTime(0.0001, now + 0.22);

  osc.connect(g).connect(preFx);
  osc.start(now);
  osc.stop(now + 0.25);
}

export function score(gapY = 480) {
  if (!ctx) ensureCtx();
  const now = ctx.currentTime;
  const norm = Math.max(0, Math.min(1, gapY / 960));
  const carrier = 600 + (1 - norm) * 500; // higher gap = higher clang

  const car = ctx.createOscillator();
  const mod = ctx.createOscillator();
  const modG = ctx.createGain();
  car.type = 'sine'; mod.type = 'sine';
  car.frequency.value = carrier;
  mod.frequency.value = carrier * 1.41;
  modG.gain.value = carrier * 2;
  mod.connect(modG).connect(car.frequency);

  const g = ctx.createGain();
  g.gain.setValueAtTime(0.0001, now);
  g.gain.exponentialRampToValueAtTime(0.35, now + 0.004);
  g.gain.exponentialRampToValueAtTime(0.0001, now + 0.18);

  car.connect(g).connect(preFx);
  car.start(now); mod.start(now);
  car.stop(now + 0.2); mod.stop(now + 0.2);
}

export function chamber(idx) {
  if (!ctx) ensureCtx();
  const now = ctx.currentTime;
  // Triad: root + fifth + octave, with chamber-specific inversions via idx offset.
  const roots = [98, 87, 73.4, 110, 82.4, 65.4];
  const root = roots[idx % roots.length];
  const intervals = [1, 1.5, 2];
  const filter = ctx.createBiquadFilter();
  filter.type = 'bandpass';
  filter.Q.value = 1.2;
  filter.frequency.setValueAtTime(200, now);
  filter.frequency.exponentialRampToValueAtTime(2200, now + 0.5);

  const g = ctx.createGain();
  g.gain.setValueAtTime(0.0001, now);
  g.gain.exponentialRampToValueAtTime(0.22, now + 0.02);
  g.gain.exponentialRampToValueAtTime(0.0001, now + 0.9);

  for (const iv of intervals) {
    const o = ctx.createOscillator();
    o.type = 'sawtooth';
    o.frequency.value = root * iv * (0.998 + Math.random() * 0.004);
    o.connect(filter);
    o.start(now);
    o.stop(now + 1.0);
  }
  filter.connect(g).connect(preFx);
}

export function death() {
  if (!ctx) ensureCtx();
  const now = ctx.currentTime;

  // Pink-ish noise burst
  const len = Math.floor(ctx.sampleRate * 0.7);
  const buf = ctx.createBuffer(1, len, ctx.sampleRate);
  const data = buf.getChannelData(0);
  let lastOut = 0;
  for (let i = 0; i < len; i++) {
    const white = Math.random() * 2 - 1;
    lastOut = (lastOut + 0.02 * white) / 1.02;
    data[i] = lastOut * 6;
  }
  const noise = ctx.createBufferSource(); noise.buffer = buf;

  const lp = ctx.createBiquadFilter();
  lp.type = 'lowpass';
  lp.frequency.setValueAtTime(1800, now);
  lp.frequency.exponentialRampToValueAtTime(120, now + 0.7);

  // Ring mod tone
  const tone = ctx.createOscillator();
  tone.type = 'sine'; tone.frequency.value = 220;
  const ringG = ctx.createGain(); ringG.gain.value = 0;
  tone.connect(ringG);

  const sum = ctx.createGain();
  noise.connect(lp).connect(sum);
  ringG.connect(sum);

  const out = ctx.createGain();
  out.gain.setValueAtTime(0.0001, now);
  out.gain.exponentialRampToValueAtTime(0.6, now + 0.01);
  out.gain.exponentialRampToValueAtTime(0.0001, now + 0.75);

  sum.connect(out).connect(preFx);
  noise.start(now); tone.start(now);
  noise.stop(now + 0.8); tone.stop(now + 0.8);

  // Sweep ringG up briefly to ring-modulate
  ringG.gain.setValueAtTime(0, now);
  ringG.gain.linearRampToValueAtTime(0.4, now + 0.05);
  ringG.gain.linearRampToValueAtTime(0, now + 0.4);
}
```

- [ ] **Step 2: Wire audio into `main.js`**

At the top of `main.js`, add:
```js
import * as audio from './audio.js';
```

In the existing `flap()` function in `main.js`, after `triggerFlap(kanyeRig)`, add:
```js
audio.init();
audio.flap();
```

In `update(dt)`, where the 'score' event fires, add:
```js
audio.score(state.lastScoredGapY);
audio.chamber(chamberFor(state.score).idx);
```

Wait — `audio.chamber()` should only fire on actual chamber boundaries, not every score. Replace that line with:
```js
audio.score(state.lastScoredGapY);
if (state.score % 5 === 0) audio.chamber(chamberFor(state.score).idx);
```

In `die()`, after `state.flash = 1;`, add:
```js
audio.death();
```

- [ ] **Step 3: Add mute key handler + mute button**

In `main.js`, after the existing `keydown` listener, add:
```js
window.addEventListener('keydown', (e) => {
  if (e.key === 'm' || e.key === 'M') {
    audio.setMuted(!audio.isMuted());
    document.getElementById('mute-btn').textContent = audio.isMuted() ? 'SOUND OFF' : 'SOUND ON';
  }
});
```

In `index.html`, inside `<div class="top">`, replace its contents with:
```html
<div>FLAPPY KANYE</div>
<button id="mute-btn" class="mute-btn" type="button">SOUND ON</button>
<div id="chamber">CHAMBER I</div>
```

Append to `style.css`:
```css
.mute-btn {
  background: transparent;
  border: 1px solid rgba(235,230,220,0.4);
  color: inherit;
  font: inherit;
  letter-spacing: inherit;
  padding: 4px 10px;
  cursor: pointer;
  pointer-events: auto;
  text-transform: uppercase;
}
.mute-btn:hover { border-color: var(--bone); }
```

In `main.js`, after `const stageEl = ...`, add:
```js
const muteBtn = document.getElementById('mute-btn');
muteBtn.textContent = audio.isMuted() ? 'SOUND OFF' : 'SOUND ON';
muteBtn.addEventListener('click', (e) => {
  e.stopPropagation();
  audio.setMuted(!audio.isMuted());
  muteBtn.textContent = audio.isMuted() ? 'SOUND OFF' : 'SOUND ON';
});
```

- [ ] **Step 4: Verify in browser**

Reload. With sound on:
- First flap unlocks audio context; subsequent flaps produce a low, distorted thud whose pitch walks down a Phrygian scale.
- Passing a pipe produces a metallic FM clang; clang pitch differs between high-gap and low-gap pipes.
- Every 5th score produces an additional gospel-stab chord.
- Death produces a filtered noise burst (vocal-chop-ish).
- An ambient saw pad hums quietly underneath throughout.
- `M` key and the SOUND ON/OFF button toggle mute; setting persists on reload.

- [ ] **Step 5: Commit**

```bash
git add audio.js main.js index.html style.css
git commit -m "feat: procedural Yeezus-style audio (808 flap, FM clang, gospel stab, vocal chop death)"
```

---

## Task 7: Add WebGL backdrop canvas and bare shader pipeline in `shader.js`

**Goal:** Stand up a WebGL canvas behind the gameplay canvas with a working fullscreen-triangle shader that just draws solid black. Plumbing only — Task 8 fills in the visual content.

**Files:**
- Modify: `index.html`
- Modify: `style.css`
- Modify: `main.js`
- Create: `shader.js`

- [ ] **Step 1: Add the WebGL canvas to `index.html`**

In `index.html`, immediately *before* `<canvas id="game" ...></canvas>`, add:
```html
<canvas id="bg" width="540" height="960"></canvas>
```

- [ ] **Step 2: Style both canvases to overlap**

Append to `style.css`:
```css
#stage canvas {
  position: absolute;
  left: 0;
  top: 0;
  width: 100%;
  height: 100%;
}
#bg { z-index: 0; }
#game { z-index: 1; background: transparent; }
```

(The existing `canvas` rule with `display: block` stays — these override positioning.)

- [ ] **Step 3: Create `shader.js`**

Create file `shader.js`:

```js
const VERT = `
attribute vec2 aPos;
void main() { gl_Position = vec4(aPos, 0.0, 1.0); }
`;

// Placeholder fragment shader — solid black. Task 8 replaces this.
const FRAG = `
precision mediump float;
void main() { gl_FragColor = vec4(0.0, 0.0, 0.0, 1.0); }
`;

function compile(gl, type, src) {
  const sh = gl.createShader(type);
  gl.shaderSource(sh, src);
  gl.compileShader(sh);
  if (!gl.getShaderParameter(sh, gl.COMPILE_STATUS)) {
    const log = gl.getShaderInfoLog(sh);
    gl.deleteShader(sh);
    throw new Error('Shader compile failed: ' + log);
  }
  return sh;
}

export function createShaderBackdrop(canvas) {
  const gl = canvas.getContext('webgl', { antialias: false, alpha: false });
  if (!gl) return null;

  let program;
  try {
    const vs = compile(gl, gl.VERTEX_SHADER, VERT);
    const fs = compile(gl, gl.FRAGMENT_SHADER, FRAG);
    program = gl.createProgram();
    gl.attachShader(program, vs);
    gl.attachShader(program, fs);
    gl.linkProgram(program);
    if (!gl.getProgramParameter(program, gl.LINK_STATUS)) {
      throw new Error('Program link failed: ' + gl.getProgramInfoLog(program));
    }
  } catch (e) {
    console.warn('[shader] init failed, falling back to Canvas2D backdrop:', e);
    return null;
  }

  // Fullscreen triangle: 3 verts covering NDC space [-1,3] x [-1,3]
  const buf = gl.createBuffer();
  gl.bindBuffer(gl.ARRAY_BUFFER, buf);
  gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([
    -1, -1,
     3, -1,
    -1,  3,
  ]), gl.STATIC_DRAW);

  const aPos = gl.getAttribLocation(program, 'aPos');

  // Collect uniform locations once.
  const uniformNames = [
    'uTime', 'uResolution', 'uColorA', 'uColorB', 'uAccent',
    'uAperturePos', 'uApertureSize', 'uFlashIntensity', 'uShake', 'uMode',
  ];
  const u = {};
  for (const n of uniformNames) u[n] = gl.getUniformLocation(program, n);

  function resize() {
    const dpr = Math.min(window.devicePixelRatio || 1, 2);
    const w = Math.floor(canvas.clientWidth * dpr);
    const h = Math.floor(canvas.clientHeight * dpr);
    if (canvas.width !== w || canvas.height !== h) {
      canvas.width = w;
      canvas.height = h;
    }
    gl.viewport(0, 0, canvas.width, canvas.height);
  }

  function render(uniforms) {
    resize();
    gl.useProgram(program);
    gl.bindBuffer(gl.ARRAY_BUFFER, buf);
    gl.enableVertexAttribArray(aPos);
    gl.vertexAttribPointer(aPos, 2, gl.FLOAT, false, 0, 0);

    if (u.uTime)            gl.uniform1f(u.uTime, uniforms.time);
    if (u.uResolution)      gl.uniform2f(u.uResolution, canvas.width, canvas.height);
    if (u.uColorA)          gl.uniform3fv(u.uColorA, uniforms.colorA);
    if (u.uColorB)          gl.uniform3fv(u.uColorB, uniforms.colorB);
    if (u.uAccent)          gl.uniform3fv(u.uAccent, uniforms.accent);
    if (u.uAperturePos)     gl.uniform2fv(u.uAperturePos, uniforms.aperturePos);
    if (u.uApertureSize)    gl.uniform2fv(u.uApertureSize, uniforms.apertureSize);
    if (u.uFlashIntensity)  gl.uniform1f(u.uFlashIntensity, uniforms.flash);
    if (u.uShake)           gl.uniform1f(u.uShake, uniforms.shake);
    if (u.uMode)            gl.uniform1i(u.uMode, uniforms.mode);

    gl.drawArrays(gl.TRIANGLES, 0, 3);
  }

  return { render };
}

// Convert "#rrggbb" to vec3 floats.
export function hexToVec3(hex) {
  const v = parseInt(hex.slice(1), 16);
  return [((v >> 16) & 255) / 255, ((v >> 8) & 255) / 255, (v & 255) / 255];
}

export function mixVec3(a, b, t) {
  return [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t, a[2] + (b[2] - a[2]) * t];
}
```

- [ ] **Step 4: Wire shader into `main.js`**

At the top of `main.js`, add:
```js
import { createShaderBackdrop, hexToVec3, mixVec3 } from './shader.js';
```

After `const stageEl = ...`, add:
```js
const bgCanvas = document.getElementById('bg');
const shader = createShaderBackdrop(bgCanvas);
```

In `render()`, at the very top (before `ctx.save()`), add:
```js
if (shader) {
  const c = chamberFor(state.score);
  const a = hexToVec3(c.from.a), b1 = hexToVec3(c.to.a);
  const b = hexToVec3(c.from.b), b2 = hexToVec3(c.to.b);
  shader.render({
    time: state.t,
    colorA: mixVec3(a, b1, c.t),
    colorB: mixVec3(b, b2, c.t),
    accent: hexToVec3(c.from.accent),
    aperturePos: [0.5, 0.55],
    apertureSize: [0.62, 0.42],
    flash: state.flash,
    shake: state.shake,
    mode: state.mode === 'idle' ? 0 : state.mode === 'playing' ? 1 : 2,
  });
}
```

In the existing `drawTurrellBackdrop` call site inside `render()`, wrap it so it only runs if the shader is unavailable:
```js
if (!shader) drawTurrellBackdrop(drawPalette, state.t);
```

Also remove `drawForegroundType(drawPalette);` from `render()` — Task 8 moves the score watermark into the shader. (Actually, keep it for now — visible identical to before. We'll handle it later if needed.)

- [ ] **Step 5: Verify in browser**

Reload. Confirm:
- A solid black backdrop is visible behind the gameplay (the placeholder shader is black).
- Pipes, Kanye, HUD all still render on top correctly.
- No console errors.
- If you intentionally break the shader (e.g., add a syntax error to `FRAG` temporarily), the game falls back to the Canvas2D backdrop and logs a warning. Revert the test change.

- [ ] **Step 6: Commit**

```bash
git add index.html style.css main.js shader.js
git commit -m "feat: WebGL backdrop canvas + shader plumbing with Canvas2D fallback"
```

---

## Task 8: Fill in the Turrell fragment shader

**Goal:** Replace the placeholder `FRAG` shader with the full Turrell light field — volumetric gradient, drifting aperture, bloom, chromatic aberration, grain, vignette, death flash.

**Files:**
- Modify: `shader.js`

- [ ] **Step 1: Replace `FRAG` with the full shader**

In `shader.js`, replace the existing placeholder `FRAG` constant with:

```js
const FRAG = `
precision mediump float;

uniform float uTime;
uniform vec2  uResolution;
uniform vec3  uColorA;
uniform vec3  uColorB;
uniform vec3  uAccent;
uniform vec2  uAperturePos;
uniform vec2  uApertureSize;
uniform float uFlashIntensity;
uniform float uShake;
uniform int   uMode;

float hash21(vec2 p) {
  p = fract(p * vec2(123.34, 456.21));
  p += dot(p, p + 45.32);
  return fract(p.x * p.y);
}

// Signed-distance to a rounded rectangle centered at c with half-size h and radius r.
float sdRoundRect(vec2 p, vec2 c, vec2 h, float r) {
  vec2 q = abs(p - c) - h + vec2(r);
  return length(max(q, 0.0)) + min(max(q.x, q.y), 0.0) - r;
}

vec3 fieldAt(vec2 uv, float t) {
  // Drift the light center on a slow Lissajous so the field feels volumetric.
  vec2 driftCenter = vec2(
    0.5 + sin(t * 0.13) * 0.08,
    0.55 + cos(t * 0.11) * 0.06
  );
  float d = distance(uv, driftCenter);
  // Two layered radial falloffs combine into a softer, deeper field.
  float r1 = smoothstep(0.0, 0.85, d);
  float r2 = smoothstep(0.2, 1.05, d * 1.1);
  float k = clamp((r1 * 0.6 + r2 * 0.4), 0.0, 1.0);
  vec3 col = mix(uColorB, uColorA, k);

  // Aperture: the iconic Turrell light rectangle.
  vec2 apHalf = uApertureSize * 0.5;
  float apJitter = sin(t * 0.4) * 0.005;
  vec2 apCenter = uAperturePos + vec2(0.0, apJitter);
  float sd = sdRoundRect(uv, apCenter, apHalf, 0.012);

  // Cheap bloom — sample SDF at offsets, average to soften edges.
  float glow = 0.0;
  for (int i = 0; i < 4; i++) {
    float a = float(i) * 1.5707963;
    vec2 o = vec2(cos(a), sin(a)) * 0.006;
    glow += smoothstep(0.05, -0.02, sdRoundRect(uv + o, apCenter, apHalf, 0.012));
  }
  glow *= 0.25;

  float inside = smoothstep(0.0, -0.03, sd);
  vec3 apertureInner = mix(uColorB, vec3(1.0), 0.12);
  vec3 tinted = mix(apertureInner, uAccent, 0.55);

  col = mix(col, tinted, inside * 0.85);
  col += uAccent * glow * 0.6;

  return col;
}

void main() {
  vec2 uv = gl_FragCoord.xy / uResolution.xy;
  // Map to 0..1 with y flipped to feel like screen space.
  vec2 sUv = vec2(uv.x, 1.0 - uv.y);

  // Subtle aperture shake from collisions.
  sUv += vec2(
    (hash21(sUv * 50.0 + uTime) - 0.5),
    (hash21(sUv * 73.0 - uTime) - 0.5)
  ) * (uShake / uResolution.y);

  // Chromatic aberration — per-channel sample offsets scaled by distance from center.
  vec2 center = vec2(0.5);
  vec2 ca = (sUv - center) * 0.006;
  vec3 col;
  col.r = fieldAt(sUv + ca, uTime).r;
  col.g = fieldAt(sUv,      uTime).g;
  col.b = fieldAt(sUv - ca, uTime).b;

  // Film grain.
  float grain = (hash21(gl_FragCoord.xy + uTime) - 0.5) * 0.06;
  col += grain;

  // Vignette — soft corner darkening.
  float vig = smoothstep(1.05, 0.35, length(sUv - center));
  col *= mix(0.6, 1.0, vig);

  // Death flash overlay — Yeezus blood red.
  vec3 blood = vec3(0.72, 0.14, 0.11);
  col = mix(col, blood, uFlashIntensity * 0.6);

  gl_FragColor = vec4(col, 1.0);
}
`;
```

- [ ] **Step 2: Verify in browser**

Reload. Confirm:
- Backdrop now shows a soft, volumetric color field that visibly drifts.
- A rounded rectangle of accent-tinted light is centered (the Turrell aperture) and breathes/shimmers gently.
- Edges of objects show subtle red/blue fringing (chromatic aberration).
- Soft vignette at the corners.
- On death, the whole screen flashes red and decays.
- On chamber transition, the field crossfades to the new chamber's palette.
- Performance: smooth playback, no judder. Open devtools performance tab if unsure.

- [ ] **Step 3: Commit**

```bash
git add shader.js
git commit -m "feat: full Turrell fragment shader (volumetric field, aperture, bloom, chromatic aberration, grain, vignette, death flash)"
```

---

## Task 9: Polish — remove the now-redundant Canvas2D backdrop and watermark when shader is active

**Goal:** Reduce visual noise from the duplicate background that runs when both backdrops draw, and clean up dead code.

**Files:**
- Modify: `main.js`

- [ ] **Step 1: Make the Canvas2D backdrop only draw when shader is null**

In `main.js` `render()`, the line from Task 7 already conditions `drawTurrellBackdrop` on `!shader`. Confirm it reads:
```js
if (!shader) drawTurrellBackdrop(drawPalette, state.t);
```

The score watermark (`drawForegroundType`) overlaps awkwardly with the shader aperture. Also condition it on shader fallback:
```js
if (!shader) drawForegroundType(drawPalette);
```

The score is already in the HTML HUD with `mix-blend-mode: difference`, so it remains visible without the canvas watermark.

- [ ] **Step 2: Verify in browser**

Reload. Confirm:
- Backdrop looks clean (only one layer rendering the color field).
- Score still clearly visible in the HUD.
- No visual regressions.

- [ ] **Step 3: Commit**

```bash
git add main.js
git commit -m "polish: hide canvas2d backdrop and watermark when WebGL shader is active"
```

---

## Task 10: Final integration check

**Goal:** Catch anything missed by walking through every interaction end-to-end.

**Files:** None — verification only.

- [ ] **Step 1: Cold-load test**

Hard reload (cmd-shift-R). Confirm:
- Title screen shows, Kanye hovers in idle mode with subtle head bob.
- Tap/space starts the game. First flap unlocks audio and triggers the 808 thud.

- [ ] **Step 2: Mid-play sensory checklist**

Play for 30+ seconds. Confirm all the following observable independently:
- Audio: flap → thud (pitch descending). Pass pipe → clang. Every 5 points → gospel stab. Pipe gaps with varying heights → clangs with varying pitch.
- Kanye: head rotates with velocity. Cap tilts at less than head angle. Jaw drops on flap and score. Glint sweeps left-to-right across glasses on each flap. Slat color matches current chamber.
- Shader: light field drifts. Aperture pulses. Chromatic aberration at edges. Vignette at corners. Grain present.

- [ ] **Step 3: Death sequence checklist**

Crash into a pipe deliberately. Confirm:
- Screen flashes red, decays.
- Camera shake briefly.
- Kanye's jaw drops fully, glasses tilt off-axis, body tumbles.
- Vocal-chop death sound plays.
- Overlay returns with "CHAMBER COLLAPSED" message.

- [ ] **Step 4: Mute persistence**

Press `M` to mute. Reload. Confirm audio stays muted across reloads. Press `M` again to re-enable.

- [ ] **Step 5: WebGL fallback sanity test**

Temporarily edit `shader.js` to `throw new Error('test')` at the top of `createShaderBackdrop`. Reload. Confirm:
- Console logs the warning.
- Game still runs.
- Canvas2D backdrop renders instead.
- Revert the test change.

- [ ] **Step 6: Final commit (only if there are changes)**

If any fixes were made during this task:
```bash
git add -A
git commit -m "fix: integration polish from final QA"
```

If nothing needed fixing, no commit is necessary. The plan is complete.

---

## Spec coverage check

Confirm every spec section maps to tasks:
- **Architecture (layered canvases + modules):** Tasks 1, 2, 3, 4, 7
- **Audio system (graph, voices, musicality, API, controls):** Task 6
- **Kanye SVG rig (markup, animation rig):** Tasks 4, 5
- **WebGL shader (uniforms, passes, fallback):** Tasks 7, 8
- **Game loop and state machine:** Task 3 + integration in 5, 6, 7
- **Testing strategy (verification by play):** Task 10 + per-task verification steps
- **Risks (sterile audio, SVG perf, flat shader):** Mitigated by spec-driven implementation; Task 10 verifies

No gaps. Plan complete.
