import { PHYSICS } from './game.js';

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
    deathTilt: 0,
  };
}

export function placeKanye(rig, kanye, stageEl) {
  const sw = stageEl.clientWidth;
  const sh = stageEl.clientHeight;
  const px = (kanye.x / PHYSICS.W) * sw - SVG_HALF;
  const py = (kanye.y / PHYSICS.H) * sh - SVG_HALF;
  rig.root.style.transform = `translate3d(${px}px, ${(py - rig.headBob).toFixed(2)}px, 0)`;
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
  rig.glasses.removeAttribute('transform');
}
