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
  g.gain.value = 0.04;
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
  const carrier = 600 + (1 - norm) * 500;

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
  out.gain.exponentialRampToValueAtTime(0.6, now + 0.01);
  out.gain.exponentialRampToValueAtTime(0.0001, now + 0.75);

  sum.connect(out).connect(preFx);
  noise.start(now); tone.start(now);
  noise.stop(now + 0.8); tone.stop(now + 0.8);

  ringG.gain.setValueAtTime(0, now);
  ringG.gain.linearRampToValueAtTime(0.4, now + 0.05);
  ringG.gain.linearRampToValueAtTime(0, now + 0.4);
}
