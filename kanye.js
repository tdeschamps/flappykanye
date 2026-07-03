// Pixel-sprite Kanye — the South Park design translated to 16-bit. The sprite
// lives on the low-res game canvas in texel space; rotation is quantized to
// 15° steps (the hi-bit tell).
//
// Rendering rule: every frame is COMPOSED unrotated (base + pupils/mouth/lids)
// into an offscreen canvas, then stamped onto the game canvas with drawImage.
// Shape fills antialias on a rotated context; images with smoothing off don't —
// composing first keeps every texel hard.

const PAL = {
  k: '#15110d',   // afro
  s: '#9b6440',   // skin
  d: '#7a4a2e',   // skin shadow
  b: '#0c0c0c',   // eyebrows / pupils
  w: '#f4f1ea',   // eye whites
  g: '#120f0b',   // goatee
  c: '#0c0c0e',   // collar
  l: '#c4c8ce',   // chain silver
};

// 20×22 texels. South Park proportions: giant joined eyes, M hairline, goatee
// crescent, chain collar peeking at the bust cutoff.
const BASE = [
  '......kkkkkkkk......',
  '....kkkkkkkkkkkk....',
  '...kkkkkkkkkkkkkk...',
  '..kkkkkkkkkkkkkkkk..',
  '..kkkkkkkkkkkkkkkk..',
  '.kkkkkkkkkkkkkkkkkk.',
  '.kkssssskkkkssssskk.',
  '.ksbbssssssssssbbsk.',
  '.ksssbbbssssbbbsssk.',
  '.kswwwwwwsswwwwwwsk.',
  '.kswwwwwwwwwwwwwwsk.',
  'skswwwwwwwwwwwwwwsks',
  '.kswwwwwwwwwwwwwwsk.',
  '.kswwwwwwsswwwwwwsk.',
  '.kssssssssssssssssk.',
  '.kssssssssssssssssk.',
  '..dssssssssssssssd..',
  '..dgggsssssssgggd...',
  '...ggggsssssgggg....',
  '....gggggggggg......',
  '..cccccccccccccc....',
  '..cclcclcclcclcc....',
];
const SPR_W = 20, SPR_H = 22;
const ANCHOR_X = 10, ANCHOR_Y = 11;   // the eye line — hitbox alignment

// Runtime overlay geometry (texels).
const EYE_L = { cx: 6, cy: 11, inner: 8 };    // left eye center + inner-edge col
const EYE_R = { cx: 13, cy: 11, inner: 11 };
const PUPIL_DART = 1.5;

function bake(rows) {
  const cv = document.createElement('canvas');
  cv.width = SPR_W; cv.height = SPR_H;
  const c = cv.getContext('2d');
  for (let y = 0; y < SPR_H; y++) {
    for (let x = 0; x < SPR_W; x++) {
      const ch = rows[y][x];
      if (ch === '.') continue;
      c.fillStyle = PAL[ch] || '#ff00ff';
      c.fillRect(x, y, 1, 1);
    }
  }
  return cv;
}

export function createKanye() {
  const frame = document.createElement('canvas');
  frame.width = SPR_W; frame.height = SPR_H;
  return {
    base: bake(BASE),
    frame,
    fctx: frame.getContext('2d'),
    rot: 0,
    jawDrop: 0,
    headBob: 0,
    deathTilt: 0,
    blinkT: 0,
    blinkNext: 2.4,
  };
}

export function resetKanye(spr) {
  spr.jawDrop = 0;
  spr.headBob = 0;
  spr.deathTilt = 0;
  spr.blinkT = 0;
  spr.blinkNext = 2.4;
}

export function triggerFlap(spr) {
  spr.jawDrop = 0.6;
  spr.headBob = 8;
}

export function triggerScore(spr) {
  spr.jawDrop = Math.max(spr.jawDrop, 0.8);
}

export function updateKanye(spr, state, dt) {
  spr.jawDrop = Math.max(0, spr.jawDrop - dt * 4);
  spr.headBob = Math.max(0, spr.headBob - dt * 50);

  if (state.mode === 'idle') {
    spr.rot = Math.sin(state.t * 3) * 6;
  } else if (state.mode === 'dead') {
    spr.deathTilt += dt * 200;
    spr.rot = spr.deathTilt;
    spr.jawDrop = 1;
  } else {
    spr.rot = Math.max(-30, Math.min(60, state.kanye.vy * 0.06));
  }

  if (state.mode !== 'dead') {
    spr.blinkT = Math.max(0, spr.blinkT - dt);
    spr.blinkNext -= dt;
    if (spr.blinkNext <= 0) {
      spr.blinkT = 0.12;
      spr.blinkNext = 1.8 + Math.random() * 3;
    }
  }
}

// Compose the current frame (unrotated, hard texels).
function compose(spr, state) {
  const c = spr.fctx;
  c.clearRect(0, 0, SPR_W, SPR_H);
  c.drawImage(spr.base, 0, 0);

  const dead = state.mode === 'dead';

  if (dead) {
    // X-eyes.
    c.fillStyle = PAL.b;
    for (const e of [EYE_L, EYE_R]) {
      c.fillRect(e.cx - 1, e.cy - 1, 1, 1);
      c.fillRect(e.cx + 1, e.cy - 1, 1, 1);
      c.fillRect(e.cx, e.cy, 1, 1);
      c.fillRect(e.cx - 1, e.cy + 1, 1, 1);
      c.fillRect(e.cx + 1, e.cy + 1, 1, 1);
    }
  } else if (spr.blinkT > 0) {
    // Lids: skin band across both eyes.
    c.fillStyle = PAL.s;
    c.fillRect(3, 10, 14, 3);
  } else {
    // Pupils sit at the inner edges (South Park), dart with vertical motion.
    const vy = state.kanye.vy || 0;
    const dy = Math.round(Math.max(-1, Math.min(1, vy / 500)) * PUPIL_DART);
    const dx = state.mode === 'idle' ? Math.round(Math.sin(state.t * 1.5)) : 0;
    c.fillStyle = PAL.b;
    c.fillRect(EYE_L.inner + dx, EYE_L.cy - 1 + dy, 1, 2);
    c.fillRect(EYE_R.inner + dx, EYE_R.cy - 1 + dy, 1, 2);
  }

  // Mouth: frown (corners down), or open jaw on flap/death.
  if (spr.jawDrop > 0.25 || dead) {
    c.fillStyle = '#1a0b04';
    c.fillRect(8, 15, 4, dead ? 3 : 2);
  } else {
    c.fillStyle = '#1a0b04';
    c.fillRect(8, 15, 4, 1);
    c.fillRect(7, 16, 1, 1);
    c.fillRect(12, 16, 1, 1);
  }
}

// Draw in texel space. tex = texels per logical unit. The ego inflates the
// head — visual only, the hitbox never grows.
export function drawKanye(ctx, spr, state, tex) {
  compose(spr, state);

  const px = Math.round(state.kanye.x * tex);
  const py = Math.round((state.kanye.y - spr.headBob) * tex);
  const q = Math.round(spr.rot / 15) * 15;   // quantized rotation — the 16-bit tell
  const s = 1 + (state.ego || 0) * 0.18;

  ctx.save();
  ctx.translate(px, py);
  ctx.rotate(q * Math.PI / 180);
  ctx.scale(s, s);
  ctx.drawImage(spr.frame, -ANCHOR_X, -ANCHOR_Y);
  ctx.restore();
}
