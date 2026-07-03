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
