// H is the fixed logical height (the vertical playable space). W is derived from
// the viewport aspect ratio on init/resize, so the field widens on a laptop
// without any vertical physics retuning. Horizontal-flow constants are anchored
// to H — speed is "screen-heights per second" — so difficulty is identical on
// every screen and a wide viewport simply reveals more of the same track.
export const PHYSICS = {
  W: 540, H: 960,        // W overwritten by recomputeDims; H is the fixed unit
  GRAVITY: 1400,
  FLAP: -460,
  PIPE_GAP: 280,
  KANYE_R: 22,
  // Derived from H by recomputeDims():
  PIPE_W: 110,
  PIPE_DX: 192,
  PIPE_SPAWN: 1.7,
  KANYE_X: 173,
};

// Recompute the playfield width and H-anchored flow constants for a viewport.
export function recomputeDims(vw, vh) {
  const H = PHYSICS.H;
  PHYSICS.W = Math.round(H * (vw / vh));
  PHYSICS.PIPE_W = H * 0.11;       // ≈106
  PHYSICS.PIPE_DX = H * 0.20;      // ≈192 px/s, resolution-independent
  PHYSICS.PIPE_SPAWN = 1.7;        // spacing = PIPE_DX * PIPE_SPAWN ≈ H * 0.34
  PHYSICS.KANYE_X = H * 0.18;      // ≈173, fixed reaction window (not W*0.28)
}

export function createGameState() {
  return {
    mode: 'idle',
    t: 0,
    score: 0,
    best: 0,   // owned by main.js's save system
    pipes: [],
    spawnTimer: 0,
    spawnCount: 0,
    kanye: { x: PHYSICS.KANYE_X, y: PHYSICS.H * 0.5, vy: 0, rot: 0 },
    shake: 0,
    flash: 0,
    graceT: 0,          // >0 = era-boundary breather, collisions ignored
    transition: null,   // { t, dur } while a room rebuild is choreographed
    ego: 0,             // 0..1 — clean passes inflate it, time deflates it
    egoX2: false,       // full ego = double score until it decays below 0.9
    deadT: 0,           // seconds since death (restart lockout)
    // Era physics targets — set and eased by main.js each frame so game.js
    // stays pure. Values are logical units (dx = px/s, gravity absolute).
    tuning: {
      gap: PHYSICS.PIPE_GAP,
      dx: PHYSICS.PIPE_DX,
      spawn: PHYSICS.PIPE_SPAWN,
      gravity: PHYSICS.GRAVITY,
    },
    // Obstacle behavior kind for newly spawned pipes ('static'|'bob'|'pulse'|
    // 'drift'|'jitter'|'wave'|'reveal') — set by main.js from the active era.
    obstacle: 'static',
  };
}

export function resetGame(state) {
  state.pipes = [];
  state.spawnTimer = 0;
  state.spawnCount = 0;
  state.kanye.y = PHYSICS.H * 0.5;
  state.kanye.vy = 0;
  state.kanye.rot = 0;
  state.score = 0;
  state.t = 0;
  state.shake = 0;
  state.flash = 0;
  state.graceT = 0;
  state.transition = null;
  state.ego = 0;
  state.egoX2 = false;
  state.deadT = 0;
}

const GAP_MARGIN = 110;   // min distance from screen edges to a gap mouth

export function spawnPipe(state) {
  const gap = state.tuning.gap;
  const range = PHYSICS.H - GAP_MARGIN * 2 - gap;
  let gapY;
  if (state.obstacle === 'wave') {
    // TLOP: gap placement rides a sine across consecutive spawns — high, low,
    // high, like a choir swell. You fly the melody instead of dodging noise.
    const center = GAP_MARGIN + range / 2;
    gapY = center + Math.sin(state.spawnCount * 0.9) * (range / 2) * 0.9;
    gapY = Math.max(GAP_MARGIN, Math.min(GAP_MARGIN + range, gapY));
  } else {
    gapY = GAP_MARGIN + Math.random() * range;
  }
  state.pipes.push({
    x: PHYSICS.W + PHYSICS.PIPE_W,
    gapY,
    baseGapY: gapY,
    gapH: gap,
    baseGapH: gap,
    passed: false,
    kind: state.obstacle,
    seed: Math.random() * Math.PI * 2,
    born: state.t,
  });
  state.spawnCount++;
}

// Per-kind live behavior. 'jitter' and 'reveal' are draw-only (collision uses
// true geometry — always fair); the movers below are physical and the hitbox
// follows what you see.
function stepObstacles(state) {
  for (const p of state.pipes) {
    if (p.kind === 'bob') {
      p.gapY = p.baseGapY + Math.sin((state.t - p.born) * 1.1 + p.seed) * 24;
    } else if (p.kind === 'drift') {
      p.gapY = p.baseGapY + Math.sin((state.t - p.born) * (Math.PI * 2 / 3.2) + p.seed) * 34;
    } else if (p.kind === 'pulse') {
      // Gap breathes with the heartbeat (bed phase via main, state.t fallback).
      const beat = state.beatPhase ?? (state.t % 1);
      const lub = Math.max(0, Math.sin(beat * Math.PI * 6)) * Math.max(0, 1 - beat * 2.2);
      p.gapH = p.baseGapH + lub * 14;
      p.gapY = p.baseGapY - lub * 7;
    }
    // Clamp movers so a gap mouth never leaves the fair zone.
    if (p.kind === 'bob' || p.kind === 'drift') {
      p.gapY = Math.max(GAP_MARGIN, Math.min(PHYSICS.H - GAP_MARGIN - p.gapH, p.gapY));
    }
  }
}

// Returns one of: null | 'score' | 'death'
// When 'score', the gapY of the scored pipe is in state.lastScoredGapY for audio cue.
export function stepPhysics(state, dt) {
  if (state.mode !== 'playing') return null;

  state.kanye.vy += state.tuning.gravity * dt;
  state.kanye.y += state.kanye.vy * dt;
  const target = Math.max(-0.5, Math.min(1.2, state.kanye.vy / 700));
  state.kanye.rot += (target - state.kanye.rot) * Math.min(1, dt * 8);

  state.spawnTimer -= dt;
  if (state.spawnTimer <= 0) {
    spawnPipe(state);
    state.spawnTimer = state.tuning.spawn;
  }

  stepObstacles(state);

  let scored = false;
  for (const p of state.pipes) {
    p.x -= state.tuning.dx * dt;
    if (!p.passed && p.x + PHYSICS.PIPE_W < state.kanye.x - PHYSICS.KANYE_R) {
      p.passed = true;
      // Pass quality feeds the ego: dead-center third is a clean pass,
      // scraping an edge barely counts. Full ego doubles the score.
      const quality = Math.abs((p.gapY + p.gapH / 2) - state.kanye.y) / (p.gapH / 2);
      state.ego = Math.min(1, state.ego + (quality < 0.33 ? 0.16 : quality > 0.75 ? 0.04 : 0.09));
      if (state.ego >= 1) state.egoX2 = true;
      state.score += state.egoX2 ? 2 : 1;
      state.lastScoredGapY = p.gapY;
      scored = true;
    }
  }
  // Ego deflates with time; ×2 holds until it sags below 0.9.
  state.ego = Math.max(0, state.ego - 0.03 * dt);
  if (state.egoX2 && state.ego < 0.9) state.egoX2 = false;
  state.pipes = state.pipes.filter(p => p.x + PHYSICS.PIPE_W > -40);

  const { kanye } = state;
  const r = PHYSICS.KANYE_R;

  // Era-boundary grace: no deaths, just keep him inside the field.
  if (state.graceT > 0) {
    if (kanye.y - r < 0) { kanye.y = r; kanye.vy = Math.max(0, kanye.vy); }
    if (kanye.y + r > PHYSICS.H) { kanye.y = PHYSICS.H - r; kanye.vy = Math.min(0, kanye.vy); }
    return scored ? 'score' : null;
  }

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
