import { PHYSICS } from './game.js';

// Face-only SVG sprite. viewBox is "-38 -134 76 84" (76 wide × 84 tall) cropping
// the head. The face/eye center sits at SVG-y ≈ -92, i.e. (-92 - -134)/84 = 0.5.
const SVG_VB_W = 76;
const SVG_VB_H = 84;
const SVG_BODY_H = 84;           // rendered head height in logical units
const SVG_BODY_W = SVG_BODY_H * (SVG_VB_W / SVG_VB_H);
const SVG_FACE_FROM_TOP = 0.5;   // align hitbox to the eye line

// Pupil rest positions (from the SVG markup) and how far they can dart.
const PUPIL_L = { x: -2.4, y: -90 };
const PUPIL_R = { x: 2.4, y: -90 };
const PUPIL_DART = 1.6;

export function createKanyeRig(el) {
  return {
    root: el,
    jaw:     el.querySelector('#k-jaw'),
    cap:     el.querySelector('#k-cap'),
    eyes:    el.querySelector('#k-eyes'),
    pupilL:  el.querySelector('#k-pupil-l'),
    pupilR:  el.querySelector('#k-pupil-r'),
    // Animation state
    rot: 0,            // current whole-sprite rotation (deg)
    jawDrop: 0,        // 0..1, decays after flap; 1.0 on death (SVG only)
    headBob: 0,        // logical units, decays after flap
    deathTilt: 0,
  };
}

export function placeKanye(rig, kanye, stageEl) {
  const scale = stageEl.clientHeight / PHYSICS.H;   // logical units → CSS px

  const bodyW = SVG_BODY_W;
  const bodyH = SVG_BODY_H;
  const chestFromTop = SVG_FACE_FROM_TOP;

  // Center horizontally on kanye.x; align kanye.y to the face line. Whole-sprite
  // tilt/spin (rig.rot) pivots about that point.
  const topLeftX = (kanye.x - bodyW / 2) * scale;
  const topLeftY = (kanye.y - bodyH * chestFromTop - rig.headBob) * scale;
  rig.root.style.width = `${(bodyW * scale).toFixed(2)}px`;
  rig.root.style.height = `${(bodyH * scale).toFixed(2)}px`;
  rig.root.style.transformOrigin = `50% ${(chestFromTop * 100).toFixed(0)}%`;
  rig.root.style.transform =
    `translate3d(${topLeftX.toFixed(2)}px, ${topLeftY.toFixed(2)}px, 0) rotate(${rig.rot.toFixed(2)}deg)`;
}

export function updateKanyeRig(rig, state, dt) {
  rig.jawDrop = Math.max(0, rig.jawDrop - dt * 4);
  rig.headBob = Math.max(0, rig.headBob - dt * 50);

  // Whole-body rotation from velocity.
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
  rig.rot = rot;

  // Subtle idle head bob on the hair group.
  const capTilt = (state.mode === 'idle' ? Math.sin(state.t * 0.5) * 3 : 0);
  rig.cap.setAttribute('transform', `rotate(${capTilt.toFixed(2)} 0 -104)`);

  // Jaw/goatee drops slightly on flap and death.
  const jawY = rig.jawDrop * 4 + (state.mode === 'dead' ? 4 : 0);
  rig.jaw.setAttribute('transform', `translate(0 ${jawY.toFixed(2)})`);

  // Eyes: pupils dart in the direction of vertical motion; cross/widen on death.
  if (state.mode === 'dead') {
    // Cross-eyed: pupils to inner corners, eyes widen a touch.
    setPupil(rig.pupilL, PUPIL_L, 1.3, 0.6);
    setPupil(rig.pupilR, PUPIL_R, -1.3, 0.6);
  } else {
    const vy = state.kanye.vy || 0;
    const dy = Math.max(-1, Math.min(1, vy / 500)) * PUPIL_DART;   // look down when falling
    const dx = state.mode === 'idle' ? Math.sin(state.t * 1.5) * 0.6 : 0;
    setPupil(rig.pupilL, PUPIL_L, dx, dy);
    setPupil(rig.pupilR, PUPIL_R, dx, dy);
  }
}

function setPupil(el, rest, dx, dy) {
  el.setAttribute('cx', (rest.x + dx).toFixed(2));
  el.setAttribute('cy', (rest.y + dy).toFixed(2));
}

export function triggerFlap(rig) {
  rig.jawDrop = 0.6;
  rig.headBob = 8;
}

export function triggerScore(rig) {
  rig.jawDrop = Math.max(rig.jawDrop, 0.8);
}

export function resetKanyeRig(rig) {
  rig.jawDrop = 0;
  rig.headBob = 0;
  rig.deathTilt = 0;
}
