let ctx = null;
let masterGain = null;
let preFx = null;
let shaper = null;
let convolver = null;
let musicBus = null;
let muted = localStorage.getItem('flappykanye_muted') === '1';

// Phrygian descending (E F G A B C D), wraps. Used to walk flap pitch.
const PHRYGIAN = [55, 52.2, 49, 46.25, 43.65, 41.2, 38.9];
let flapIdx = 0;

export function makeDistortionCurve(amount = 60) {
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

  // Music bus: clean into the limiter (SFX keep the waveshaper grit; music
  // doesn't want it), with a small send to the shared plate.
  musicBus = ctx.createGain();
  musicBus.gain.value = 0.65;
  musicBus.connect(limiter);
  const plateSend = ctx.createGain();
  plateSend.gain.value = 0.10;
  musicBus.connect(plateSend).connect(convolver);

  return ctx;
}

export function getCtx() { ensureCtx(); return ctx; }
export function getMusicBus() { ensureCtx(); return musicBus; }
export function getSfxBus() { ensureCtx(); return preFx; }

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

// Record scratch — the "I'ma let you finish" interruption.
export function scratch() {
  if (!ctx) ensureCtx();
  const now = ctx.currentTime;
  const len = Math.floor(ctx.sampleRate * 0.25);
  const buf = ctx.createBuffer(1, len, ctx.sampleRate);
  const d = buf.getChannelData(0);
  for (let i = 0; i < len; i++) d[i] = (Math.random() * 2 - 1) * (1 - i / len);
  const noise = ctx.createBufferSource(); noise.buffer = buf;
  const bp = ctx.createBiquadFilter();
  bp.type = 'bandpass'; bp.Q.value = 2.5;
  bp.frequency.setValueAtTime(2400, now);
  bp.frequency.exponentialRampToValueAtTime(320, now + 0.22);
  const ng = ctx.createGain();
  ng.gain.setValueAtTime(0.4, now);
  ng.gain.exponentialRampToValueAtTime(0.0001, now + 0.25);
  noise.connect(bp).connect(ng).connect(preFx);
  noise.start(now); noise.stop(now + 0.26);

  const o = ctx.createOscillator();
  o.type = 'sawtooth';
  o.frequency.setValueAtTime(760, now);
  o.frequency.exponentialRampToValueAtTime(110, now + 0.3);
  const og = ctx.createGain();
  og.gain.setValueAtTime(0.12, now);
  og.gain.exponentialRampToValueAtTime(0.0001, now + 0.3);
  o.connect(og).connect(preFx);
  o.start(now); o.stop(now + 0.32);
}

// Metallic stab for Yeezus glitch takeovers.
export function stab() {
  if (!ctx) ensureCtx();
  const now = ctx.currentTime;
  const len = Math.floor(ctx.sampleRate * 0.07);
  const buf = ctx.createBuffer(1, len, ctx.sampleRate);
  const d = buf.getChannelData(0);
  for (let i = 0; i < len; i++) d[i] = Math.random() * 2 - 1;
  const noise = ctx.createBufferSource(); noise.buffer = buf;
  const bp = ctx.createBiquadFilter();
  bp.type = 'bandpass'; bp.frequency.value = 3100; bp.Q.value = 9;
  const g = ctx.createGain();
  g.gain.setValueAtTime(0.22, now);
  g.gain.exponentialRampToValueAtTime(0.0001, now + 0.09);
  noise.connect(bp).connect(g).connect(preFx);
  noise.start(now); noise.stop(now + 0.1);
}

// autotune=true (the 808s room) quantizes the sweep into hard pitch steps —
// the T-Pain joke, one parameter deep. ego (0..1) raises the pitch: confidence
// is audible.
export function flap(autotune = false, ego = 0) {
  if (!ctx) ensureCtx();
  const now = ctx.currentTime;
  const root = PHRYGIAN[flapIdx % PHRYGIAN.length] * (1 + ego * 0.5);
  flapIdx++;

  const osc = ctx.createOscillator();
  osc.type = 'sine';
  if (autotune) {
    osc.frequency.setValueAtTime(root * 2, now);
    osc.frequency.setValueAtTime(root * 1.5, now + 0.04);
    osc.frequency.setValueAtTime(root * 1.12, now + 0.08);
    osc.frequency.setValueAtTime(root * 0.75, now + 0.12);
  } else {
    osc.frequency.setValueAtTime(root * 2, now);
    osc.frequency.exponentialRampToValueAtTime(root * 0.72, now + 0.12);
  }

  const g = ctx.createGain();
  g.gain.setValueAtTime(0.0001, now);
  g.gain.exponentialRampToValueAtTime(0.55, now + 0.005);
  g.gain.exponentialRampToValueAtTime(0.0001, now + 0.22);

  osc.connect(g).connect(preFx);
  osc.start(now);
  osc.stop(now + 0.25);
}

// scale = current bed chord frequencies; when present, the clang is quantized
// to the music instead of a free FM tone (gapY still picks the register).
export function score(gapY = 480, scale = null) {
  if (!ctx) ensureCtx();
  const now = ctx.currentTime;
  const norm = Math.max(0, Math.min(1, gapY / 960));
  let carrier = 600 + (1 - norm) * 500;
  if (scale && scale.length) {
    let best = carrier, bd = Infinity;
    for (const f of scale) {
      for (const m of [2, 4, 8]) {
        const c = f * m;
        const d = Math.abs(c - carrier);
        if (d < bd) { bd = d; best = c; }
      }
    }
    carrier = best;
  }

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

// Era-boundary swell: the old chamber chord + a rising filtered-noise
// crescendo underneath — marks the threshold while the room rebuilds.
export function eraSwell(idx) {
  if (!ctx) ensureCtx();
  const now = ctx.currentTime;
  const roots = [98, 87, 73.4, 110, 82.4, 65.4, 55];
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

  // The riser: 1.2s of noise sweeping up into the boundary.
  const len = Math.floor(ctx.sampleRate * 1.2);
  const buf = ctx.createBuffer(1, len, ctx.sampleRate);
  const data = buf.getChannelData(0);
  for (let i = 0; i < len; i++) data[i] = (Math.random() * 2 - 1) * (i / len);
  const noise = ctx.createBufferSource(); noise.buffer = buf;
  const bp = ctx.createBiquadFilter();
  bp.type = 'bandpass'; bp.Q.value = 1.4;
  bp.frequency.setValueAtTime(300, now);
  bp.frequency.exponentialRampToValueAtTime(2800, now + 1.15);
  const ng = ctx.createGain();
  ng.gain.setValueAtTime(0.0001, now);
  ng.gain.exponentialRampToValueAtTime(0.16, now + 1.0);
  ng.gain.exponentialRampToValueAtTime(0.0001, now + 1.25);
  noise.connect(bp).connect(ng).connect(preFx);
  noise.start(now); noise.stop(now + 1.3);
}

// eraId flavors the crash: yeezus hits harder into the distortion, donda adds
// a reverbed organ thud under the noise.
export function death(eraId = '') {
  if (!ctx) ensureCtx();
  const now = ctx.currentTime;

  if (eraId === 'donda') {
    const o = ctx.createOscillator();
    o.type = 'sine'; o.frequency.value = 58;
    const og = ctx.createGain();
    og.gain.setValueAtTime(0.0001, now);
    og.gain.exponentialRampToValueAtTime(0.5, now + 0.02);
    og.gain.exponentialRampToValueAtTime(0.0001, now + 1.4);
    o.connect(og);
    og.connect(convolver);
    og.connect(preFx);
    o.start(now); o.stop(now + 1.5);
  }
  const drive = eraId === 'yeezus' ? 1.5 : 1;

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

  const tone = ctx.createOscillator();
  tone.type = 'sine'; tone.frequency.value = 220;
  const ringG = ctx.createGain(); ringG.gain.value = 0;
  tone.connect(ringG);

  const sum = ctx.createGain();
  noise.connect(lp).connect(sum);
  ringG.connect(sum);

  const out = ctx.createGain();
  out.gain.setValueAtTime(0.0001, now);
  out.gain.exponentialRampToValueAtTime(0.6 * drive, now + 0.01);
  out.gain.exponentialRampToValueAtTime(0.0001, now + 0.75);

  sum.connect(out).connect(preFx);
  noise.start(now); tone.start(now);
  noise.stop(now + 0.8); tone.stop(now + 0.8);

  ringG.gain.setValueAtTime(0, now);
  ringG.gain.linearRampToValueAtTime(0.4, now + 0.05);
  ringG.gain.linearRampToValueAtTime(0, now + 0.4);
}
