import { CHAMBERS, chamberFor } from './chambers.js';

  const canvas = document.getElementById('game');
  const ctx = canvas.getContext('2d');
  const W = canvas.width;
  const H = canvas.height;

  const scoreEl = document.getElementById('score');
  const bestEl = document.getElementById('best');
  const chamberEl = document.getElementById('chamber');
  const overlay = document.getElementById('overlay');
  const deathChamberEl = document.getElementById('death-chamber');

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

  // --- Game state ---
  const state = {
    mode: 'idle', // idle | playing | dead
    t: 0,
    score: 0,
    best: parseInt(localStorage.getItem('flappykanye_best') || '0', 10),
    pipes: [],
    spawnTimer: 0,
    kanye: {
      x: W * 0.28,
      y: H * 0.5,
      vy: 0,
      rot: 0,
    },
    shake: 0,
    flash: 0,
  };
  bestEl.textContent = state.best;

  const GRAVITY = 1700;       // px/s^2
  const FLAP    = -520;       // px/s
  const PIPE_GAP = 230;       // gap height
  const PIPE_W   = 110;       // monolith width
  const PIPE_DX  = 220;       // px/s leftward
  const PIPE_SPAWN = 1.45;    // seconds

  function reset() {
    state.pipes = [];
    state.spawnTimer = 0;
    state.kanye.y = H * 0.5;
    state.kanye.vy = 0;
    state.kanye.rot = 0;
    state.score = 0;
    state.t = 0;
    state.shake = 0;
    state.flash = 0;
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
    state.kanye.vy = FLAP;
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

  function spawnPipe() {
    const margin = 110;
    const gapY = margin + Math.random() * (H - margin * 2 - PIPE_GAP);
    state.pipes.push({ x: W + PIPE_W, gapY, gapH: PIPE_GAP, passed: false });
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

  function drawKanye(k, palette) {
    // South Park-style Kanye: round flesh head, jaw, sunglasses, baseball cap.
    ctx.save();
    ctx.translate(k.x, k.y);
    ctx.rotate(k.rot);

    // Subtle bob shadow
    ctx.fillStyle = 'rgba(0,0,0,0.35)';
    ctx.beginPath();
    ctx.ellipse(2, 4, 28, 30, 0, 0, Math.PI * 2);
    ctx.fill();

    // Head — flesh tone
    const head = '#a8754f';
    ctx.fillStyle = head;
    ctx.beginPath();
    ctx.ellipse(0, 0, 26, 28, 0, 0, Math.PI * 2);
    ctx.fill();

    // Lower jaw block (South Park style — separate piece)
    ctx.fillStyle = '#8a5d3d';
    ctx.beginPath();
    ctx.ellipse(0, 14, 18, 10, 0, 0, Math.PI * 2);
    ctx.fill();

    // Mouth line
    ctx.strokeStyle = '#3a1f0f';
    ctx.lineWidth = 1.5;
    ctx.beginPath();
    ctx.moveTo(-8, 14);
    ctx.quadraticCurveTo(0, 18, 8, 14);
    ctx.stroke();

    // Baseball cap — Donda all-black
    ctx.fillStyle = '#0a0a0a';
    ctx.beginPath();
    ctx.arc(0, -10, 26, Math.PI, 0);
    ctx.fill();
    ctx.fillRect(-26, -12, 52, 6);
    // Brim
    ctx.fillRect(2, -10, 28, 4);
    // Cap highlight
    ctx.fillStyle = '#222';
    ctx.fillRect(-24, -22, 12, 2);

    // Shutter shades — Yeezus / Glow in the Dark era
    ctx.fillStyle = '#0a0a0a';
    ctx.fillRect(-22, -4, 44, 10);
    // Shutter slats
    ctx.strokeStyle = palette ? rgbToCss(hexToRgb(palette.accent), 0.85) : '#b8231c';
    ctx.lineWidth = 1.2;
    for (let i = 0; i < 4; i++) {
      const yy = -2 + i * 2.2;
      ctx.beginPath();
      ctx.moveTo(-20, yy);
      ctx.lineTo(20, yy);
      ctx.stroke();
    }

    // Tiny ears
    ctx.fillStyle = head;
    ctx.beginPath();
    ctx.ellipse(-26, 2, 3, 5, 0, 0, Math.PI * 2);
    ctx.ellipse(26, 2, 3, 5, 0, 0, Math.PI * 2);
    ctx.fill();

    // Body sliver peeking out below the head (small wing-flap suggestion)
    const flapPhase = Math.sin(state.t * 22);
    ctx.fillStyle = '#0a0a0a';
    ctx.beginPath();
    ctx.ellipse(-18, 22 + flapPhase * 2, 10, 6, -0.4, 0, Math.PI * 2);
    ctx.ellipse(18, 22 - flapPhase * 2, 10, 6, 0.4, 0, Math.PI * 2);
    ctx.fill();

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

  // --- Physics + main loop ---
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

  function update(dt) {
    // Idle hover
    if (state.mode === 'idle') {
      state.kanye.y = H * 0.5 + Math.sin(state.t * 3) * 16;
      state.kanye.rot = Math.sin(state.t * 3) * 0.1;
      return;
    }

    if (state.mode === 'playing') {
      state.kanye.vy += GRAVITY * dt;
      state.kanye.y += state.kanye.vy * dt;
      // Rotation reflects vertical velocity, clamped.
      const target = Math.max(-0.5, Math.min(1.2, state.kanye.vy / 700));
      state.kanye.rot += (target - state.kanye.rot) * Math.min(1, dt * 8);

      // Spawn pipes on a steady cadence.
      state.spawnTimer -= dt;
      if (state.spawnTimer <= 0) {
        spawnPipe();
        state.spawnTimer = PIPE_SPAWN;
      }

      // Move pipes & score.
      for (const p of state.pipes) {
        p.x -= PIPE_DX * dt;
        if (!p.passed && p.x + PIPE_W < state.kanye.x - 26) {
          p.passed = true;
          state.score += 1;
          scoreEl.textContent = String(state.score);
          const c = chamberFor(state.score).from;
          chamberEl.textContent = c.name;
        }
      }
      state.pipes = state.pipes.filter(p => p.x + PIPE_W > -40);

      // Collisions — circle vs rectangles.
      const r = 22;
      const kx = state.kanye.x, ky = state.kanye.y;
      if (ky - r < 0 || ky + r > H) return die();
      for (const p of state.pipes) {
        if (kx + r < p.x || kx - r > p.x + PIPE_W) continue;
        if (ky - r < p.gapY || ky + r > p.gapY + p.gapH) return die();
      }
    }

    if (state.mode === 'dead') {
      // Let Kanye fall after death for one more beat.
      state.kanye.vy += GRAVITY * dt;
      state.kanye.y += state.kanye.vy * dt;
      state.kanye.rot += dt * 4;
      state.kanye.y = Math.min(state.kanye.y, H - 24);
    }

    if (state.shake > 0) state.shake = Math.max(0, state.shake - dt * 60);
    if (state.flash > 0) state.flash = Math.max(0, state.flash - dt * 2);
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

    ctx.save();
    if (state.shake > 0) {
      ctx.translate(
        (Math.random() - 0.5) * state.shake,
        (Math.random() - 0.5) * state.shake
      );
    }

    drawTurrellBackdrop(drawPalette, state.t);
    drawForegroundType(drawPalette);
    for (const p of state.pipes) drawMonolith(p, drawPalette);
    drawKanye(state.kanye, drawPalette);

    // Death flash — red Yeezus burst.
    if (state.flash > 0) {
      ctx.fillStyle = `rgba(184,35,28,${state.flash * 0.6})`;
      ctx.fillRect(0, 0, W, H);
    }

    ctx.restore();
  }

  // Kick off
  reset();
  requestAnimationFrame((t) => { last = t; frame(t); });
