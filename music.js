// Procedural era soundtrack — seven beds, one scheduler, zero assets.
//
// A bed is pure data: bpm + sustained voices + 16-step tracks. Voice renderers
// are small factory functions that schedule one event's worth of sound into
// the bed's own GainNode, which feeds audio.js's clean music bus. On era
// change the old bed ramps out while the new ramps in (max two beds alive).
// Yeezus deliberately routes its bass stabs through the SFX distortion.

import * as audio from './audio.js';

const SEMI = (n) => Math.pow(2, n / 12);
const BAR_STEPS = 16;

// ---------------- Bed specs (data only) ----------------
// chords: arrays of semitone offsets from root, one per bar (looping).
// tracks: { voice, pattern[16], params, everyBars? } — pattern values are velocity.
const BEDS = {
  dropout: {
    bpm: 84, root: 233.08, swing: 0.16,
    chords: [[0, 4, 7, 11], [-3, 0, 4, 7], [-7, -3, 0, 5], [-5, -1, 2, 7]],
    sustained: [{ voice: 'sub', params: { offset: -24, gain: 0.05 } }],
    tracks: [
      { voice: 'chordStab', pattern: [1, 0, 0, 0, 0, 0, .8, 0, 0, 0, 0, 0, 1, 0, 0, 0],
        params: { type: 'triangle', dur: 0.5, lp: 1800, warble: 12, gain: 0.16 } },
      { voice: 'chordStab', pattern: [0, 0, 0, 0, 0, 0, 0, 0, 1, 0, 0, 0, 0, 0, 0, 0], everyBars: 4,
        params: { type: 'triangle', dur: 0.22, lp: 3200, octave: 12, warble: 20, gain: 0.12 } },
      { voice: 'noiseHit', pattern: [0, 0, .5, 0, 0, .4, 0, 0, 0, .5, 0, 0, 0, 0, .4, 0],
        params: { freq: 6000, q: 0.6, dur: 0.02, gain: 0.018, type: 'highpass' } },
    ],
  },
  graduation: {
    bpm: 116, root: 261.63, swing: 0,
    chords: [[0], [0], [-3], [-5]],
    sustained: [{ voice: 'pad', params: { offsets: [0, 4, 7], type: 'sawtooth', lp: 900, gain: 0.045 } }],
    tracks: [
      { voice: 'arp', pattern: [1, .6, .8, .6, 1, .6, .8, .6, 1, .6, .8, .6, 1, .6, .8, .6],
        params: { degrees: [0, 2, 4, 7, 9, 12, 14, 12, 9, 7], type: 'square', dur: 0.11, lp: 2600, gain: 0.055, delay: true } },
      { voice: 'kick', pattern: [1, 0, 0, 0, 1, 0, 0, 0, 1, 0, 0, 0, 1, 0, 0, 0],
        params: { f0: 130, f1: 48, dur: 0.16, gain: 0.30 } },
    ],
  },
  heartbreak: {
    bpm: 60, root: 174.61, swing: 0,
    chords: [[0], [0], [-4], [-4]],
    sustained: [{ voice: 'pad', params: { offsets: [0, 7], type: 'sine', lp: 700, gain: 0.06 } }],
    tracks: [
      { voice: 'heartbeat', pattern: [1, 0, 0, 0, 1, 0, 0, 0, 1, 0, 0, 0, 1, 0, 0, 0],
        params: { f0: 92, f1: 38, dur: 0.30, gain: 0.42 } },
      { voice: 'lead', pattern: [0, 0, 0, 0, 0, 0, 0, 0, 1, 0, 0, 0, 0, 0, 0, 0], everyBars: 8,
        params: { degrees: [7, 5, 3, 0], type: 'square', dur: 2.4, lp: 1200, glide: 0.18, gain: 0.05 } },
    ],
  },
  mbdtf: {
    bpm: 90, root: 130.81, swing: 0,
    chords: [[0, 3, 7], [8, 12, 15], [3, 7, 10], [10, 14, 17]],
    sustained: [{ voice: 'sub', params: { offset: -12, gain: 0.05 } }],
    tracks: [
      { voice: 'chordPad', pattern: [1, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0],
        params: { type: 'sawtooth', detune: 9, attack: 0.5, dur: 2.6, lp: 850, gain: 0.10 } },
      { voice: 'kick', pattern: [1, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0],
        params: { f0: 68, f1: 34, dur: 0.5, gain: 0.34, noise: true } },
      { voice: 'arp', pattern: [0, 0, 0, 0, 0, 0, 0, 0, 0, .5, .4, .5, 0, .4, 0, .5], everyBars: 2,
        params: { degrees: [12, 15, 19, 24, 19, 15], type: 'sine', dur: 0.4, lp: 5200, gain: 0.035, fm: 2.01 } },
    ],
  },
  yeezus: {
    bpm: 130, root: 65.41, swing: 0,
    chords: [[0], [0], [3], [5]],
    silentBars: 8,   // every 8th bar hard-mutes: the Yeezus stop
    sustained: [],
    tracks: [
      { voice: 'bassStab', pattern: [1, 0, 0, 1, 0, 0, 1, 0, 0, 0, 1, 1, 0, 0, 0, 0],
        params: { type: 'square', dur: 0.14, gain: 0.30, sfxBus: true } },
      { voice: 'noiseHit', pattern: [0, 0, 1, 0, 0, 0, 1, 0, 0, 1, 0, 0, 0, 0, 1, 0],
        params: { freq: 3000, q: 8, dur: 0.05, gain: 0.06 } },
      { voice: 'siren', pattern: [1, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0], everyBars: 4,
        params: { f0: 200, f1: 780, dur: 1.6, gain: 0.045 } },
    ],
  },
  pablo: {
    bpm: 72, root: 174.61, swing: 0.08,
    chords: [[0, 4, 7], [-5, -1, 2], [-8, -5, 0], [-10, -6, -3]],
    sustained: [{ voice: 'sub', params: { offset: -24, gain: 0.05 } }],
    tracks: [
      { voice: 'choir', pattern: [1, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0],
        params: { attack: 0.6, dur: 3.0, gain: 0.10 } },
      { voice: 'noiseHit', pattern: [0, 0, .4, 0, 0, 0, .4, 0, 0, 0, .4, 0, 0, 0, .4, 0],
        params: { freq: 7200, q: 0.8, dur: 0.05, gain: 0.02, type: 'highpass' } },
    ],
  },
  donda: {
    bpm: 52, root: 116.54, swing: 0,
    chords: [[0, 7, 12], [0, 7, 12], [0, 5, 12], [0, 7, 10]],
    sustained: [
      { voice: 'organ', params: { gain: 0.09 } },
      { voice: 'sub', params: { offset: -24, gain: 0.06 } },
    ],
    tracks: [
      { voice: 'kick', pattern: [1, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0], everyBars: 2,
        params: { f0: 55, f1: 29, dur: 0.9, gain: 0.22 } },
      { voice: 'arp', pattern: [0, 0, 0, 0, 0, 0, 0, 0, 1, 0, 0, 0, 0, 0, 0, 0], everyBars: 16,
        params: { degrees: [19], type: 'sine', dur: 2.0, lp: 4000, gain: 0.04, fm: 1.5 } },
    ],
  },
};

// ---------------- Voice renderers ----------------
function envGain(ctx, out, when, peak, attack, dur) {
  const g = ctx.createGain();
  g.gain.setValueAtTime(0.0001, when);
  g.gain.exponentialRampToValueAtTime(Math.max(0.001, peak), when + Math.max(0.003, attack));
  g.gain.exponentialRampToValueAtTime(0.0001, when + dur);
  g.connect(out);
  return g;
}

const VOICES = {
  chordStab(bed, when, vel, P) {
    const chord = bed.chord();
    const g = envGain(bed.ctx, bed.out, when, P.gain * vel, 0.008, P.dur);
    const lp = bed.ctx.createBiquadFilter();
    lp.type = 'lowpass'; lp.frequency.value = P.lp;
    lp.connect(g);
    for (const off of chord) {
      const o = bed.ctx.createOscillator();
      o.type = P.type;
      o.frequency.value = bed.spec.root * SEMI(off + (P.octave || 0));
      if (P.warble) {
        o.detune.setValueAtTime(-P.warble, when);
        o.detune.linearRampToValueAtTime(P.warble, when + P.dur);
      }
      o.connect(lp);
      o.start(when); o.stop(when + P.dur + 0.05);
    }
  },
  chordPad(bed, when, vel, P) {
    const chord = bed.chord();
    const g = envGain(bed.ctx, bed.out, when, P.gain * vel, P.attack, P.dur);
    const lp = bed.ctx.createBiquadFilter();
    lp.type = 'lowpass'; lp.frequency.value = P.lp;
    lp.connect(g);
    for (const off of chord) {
      for (const dt of [-P.detune, P.detune]) {
        const o = bed.ctx.createOscillator();
        o.type = P.type;
        o.frequency.value = bed.spec.root * SEMI(off);
        o.detune.value = dt;
        o.connect(lp);
        o.start(when); o.stop(when + P.dur + 0.1);
      }
    }
  },
  arp(bed, when, vel, P) {
    const deg = P.degrees[bed.arpIdx++ % P.degrees.length];
    const g = envGain(bed.ctx, bed.out, when, P.gain * vel, 0.004, P.dur);
    const lp = bed.ctx.createBiquadFilter();
    lp.type = 'lowpass'; lp.frequency.value = P.lp;
    lp.connect(P.delay ? bed.delayIn : g);
    if (P.delay) bed.delayIn.connect(g); // dry through the same envelope
    const o = bed.ctx.createOscillator();
    o.type = P.type;
    o.frequency.value = bed.spec.root * SEMI(deg + bed.chord()[0]);
    if (P.fm) {
      const m = bed.ctx.createOscillator();
      const mg = bed.ctx.createGain();
      m.frequency.value = o.frequency.value * P.fm;
      mg.gain.value = o.frequency.value * 1.4;
      m.connect(mg).connect(o.frequency);
      m.start(when); m.stop(when + P.dur);
    }
    o.connect(lp);
    o.start(when); o.stop(when + P.dur + 0.05);
  },
  lead(bed, when, vel, P) {
    // Portamento autotune caricature: glides through degrees in quantized steps.
    const g = envGain(bed.ctx, bed.out, when, P.gain * vel, 0.05, P.dur);
    const lp = bed.ctx.createBiquadFilter();
    lp.type = 'lowpass'; lp.frequency.value = P.lp;
    lp.connect(g);
    const o = bed.ctx.createOscillator();
    o.type = P.type;
    const stepDur = P.dur / P.degrees.length;
    P.degrees.forEach((deg, i) => {
      const f = bed.spec.root * SEMI(deg);
      const t = when + i * stepDur;
      if (i === 0) o.frequency.setValueAtTime(f, t);
      else o.frequency.exponentialRampToValueAtTime(f, t + Math.min(P.glide, stepDur * 0.8));
    });
    o.connect(lp);
    o.start(when); o.stop(when + P.dur + 0.05);
  },
  kick(bed, when, vel, P) {
    const g = envGain(bed.ctx, bed.out, when, P.gain * vel, 0.003, P.dur);
    const o = bed.ctx.createOscillator();
    o.type = 'sine';
    o.frequency.setValueAtTime(P.f0, when);
    o.frequency.exponentialRampToValueAtTime(P.f1, when + P.dur * 0.8);
    o.connect(g);
    o.start(when); o.stop(when + P.dur + 0.05);
    if (P.noise) VOICES.noiseHit(bed, when, vel * 0.5, { freq: 900, q: 0.7, dur: 0.08, gain: P.gain * 0.25 });
  },
  heartbeat(bed, when, vel, P) {
    VOICES.kick(bed, when, vel, P);                              // lub
    VOICES.kick(bed, when + 0.12, vel * 0.55, { ...P, f0: P.f0 * 0.85 }); // DUB
  },
  bassStab(bed, when, vel, P) {
    const out = P.sfxBus ? audio.getSfxBus() : bed.out;
    const g = bed.ctx.createGain();
    g.gain.setValueAtTime(0.0001, when);
    g.gain.exponentialRampToValueAtTime(P.gain * vel, when + 0.004);
    g.gain.exponentialRampToValueAtTime(0.0001, when + P.dur);
    g.connect(out);
    bed.stabs = bed.stabs || 0;
    const o = bed.ctx.createOscillator();
    o.type = P.type;
    o.frequency.value = bed.spec.root * SEMI(bed.chord()[0] + [0, 0, 3, 5][bed.stabs++ % 4]);
    o.connect(g);
    o.start(when); o.stop(when + P.dur + 0.03);
  },
  noiseHit(bed, when, vel, P) {
    const ctx = bed.ctx;
    const len = Math.floor(ctx.sampleRate * (P.dur + 0.02));
    const buf = ctx.createBuffer(1, len, ctx.sampleRate);
    const d = buf.getChannelData(0);
    for (let i = 0; i < len; i++) d[i] = Math.random() * 2 - 1;
    const src = ctx.createBufferSource(); src.buffer = buf;
    const f = ctx.createBiquadFilter();
    f.type = P.type || 'bandpass'; f.frequency.value = P.freq; f.Q.value = P.q;
    const g = envGain(ctx, bed.out, when, P.gain * vel, 0.002, P.dur + 0.01);
    src.connect(f).connect(g);
    src.start(when); src.stop(when + P.dur + 0.02);
  },
  siren(bed, when, vel, P) {
    const g = envGain(bed.ctx, bed.out, when, P.gain * vel, 0.3, P.dur);
    const o = bed.ctx.createOscillator();
    o.type = 'sawtooth';
    o.frequency.setValueAtTime(P.f0, when);
    o.frequency.exponentialRampToValueAtTime(P.f1, when + P.dur * 0.9);
    o.connect(g);
    o.start(when); o.stop(when + P.dur + 0.05);
  },
  choir(bed, when, vel, P) {
    const chord = bed.chord();
    const g = envGain(bed.ctx, bed.out, when, P.gain * vel, P.attack, P.dur);
    // Two formant bandpasses ≈ "ahh".
    const f1 = bed.ctx.createBiquadFilter();
    f1.type = 'bandpass'; f1.frequency.value = 700; f1.Q.value = 1.1;
    const f2 = bed.ctx.createBiquadFilter();
    f2.type = 'bandpass'; f2.frequency.value = 1200; f2.Q.value = 1.3;
    f1.connect(g); f2.connect(g);
    const vib = bed.ctx.createOscillator();
    const vibG = bed.ctx.createGain();
    vib.frequency.value = 5; vibG.gain.value = 4;
    vib.connect(vibG);
    for (const off of chord) {
      for (const dt of [-6, 5]) {
        const o = bed.ctx.createOscillator();
        o.type = 'sawtooth';
        o.frequency.value = bed.spec.root * SEMI(off);
        o.detune.value = dt;
        vibG.connect(o.detune);
        o.connect(f1); o.connect(f2);
        o.start(when); o.stop(when + P.dur + 0.1);
      }
    }
    vib.start(when); vib.stop(when + P.dur + 0.1);
  },
};

// Sustained voices live for the bed's whole life.
const SUSTAINED = {
  sub(bed, P) {
    const g = bed.ctx.createGain(); g.gain.value = P.gain;
    const o = bed.ctx.createOscillator();
    o.type = 'sine';
    o.frequency.value = bed.spec.root * SEMI(P.offset);
    o.connect(g).connect(bed.out);
    o.start();
    return [o, g];
  },
  pad(bed, P) {
    const g = bed.ctx.createGain(); g.gain.value = P.gain;
    const lp = bed.ctx.createBiquadFilter();
    lp.type = 'lowpass'; lp.frequency.value = P.lp;
    lp.connect(g).connect(bed.out);
    const nodes = [g, lp];
    for (const off of P.offsets) {
      for (const dt of [-5, 4]) {
        const o = bed.ctx.createOscillator();
        o.type = P.type;
        o.frequency.value = bed.spec.root * SEMI(off);
        o.detune.value = dt;
        o.connect(lp);
        o.start();
        nodes.push(o);
      }
    }
    return nodes;
  },
  organ(bed, P) {
    // Additive partials + a 20s swell cycle — the Donda drone.
    const g = bed.ctx.createGain(); g.gain.value = P.gain;
    const lfo = bed.ctx.createOscillator();
    const lfoG = bed.ctx.createGain();
    lfo.frequency.value = 0.05; lfoG.gain.value = P.gain * 0.5;
    lfo.connect(lfoG).connect(g.gain);
    g.connect(bed.out);
    const nodes = [g, lfo, lfoG];
    for (const [partial, pg] of [[1, 1], [2, 0.5], [3, 0.3], [4, 0.2], [6, 0.12], [8, 0.08]]) {
      const og = bed.ctx.createGain(); og.gain.value = pg;
      const o = bed.ctx.createOscillator();
      o.type = 'sine';
      o.frequency.value = bed.spec.root * partial;
      o.connect(og).connect(g);
      o.start();
      nodes.push(o, og);
    }
    lfo.start();
    return nodes;
  },
};

// ---------------- Bed lifecycle + scheduler ----------------
let current = null;    // active bed
let fading = null;     // previous bed while it ramps out
let timer = 0;
let started = false;
let modeGain = 1;      // 0.4 on the title screen, 1 in play

function makeBed(id) {
  const ctx = audio.getCtx();
  const spec = BEDS[id];
  const out = ctx.createGain();
  out.gain.value = 0.0001;
  out.connect(audio.getMusicBus());
  const bed = {
    id, spec, ctx, out,
    sustained: [],
    step: 0, bar: 0,
    nextTime: ctx.currentTime + 0.06,
    arpIdx: 0,
    startTime: ctx.currentTime,
    transpose: 0,
    chord() { return this.spec.chords[this.bar % this.spec.chords.length].map(o => o + this.transpose); },
  };
  // Shared feedback delay for arps that ask for it.
  bed.delayIn = ctx.createGain();
  const d = ctx.createDelay(1);
  d.delayTime.value = 60 / spec.bpm / 2;
  const fb = ctx.createGain(); fb.gain.value = 0.3;
  bed.delayIn.connect(d); d.connect(fb).connect(d);
  d.connect(bed.out);
  bed.sustainedExtra = [d, fb, bed.delayIn];
  for (const s of spec.sustained) bed.sustained.push(...SUSTAINED[s.voice](bed, s.params));
  return bed;
}

function scheduleBed(bed, horizon) {
  const stepDur = 60 / bed.spec.bpm / 4;
  while (bed.nextTime < horizon) {
    const silent = bed.spec.silentBars && (bed.bar % bed.spec.silentBars === bed.spec.silentBars - 1) && bed.step < 8;
    if (!silent) {
      for (const tr of bed.spec.tracks) {
        const vel = tr.pattern[bed.step];
        if (!vel) continue;
        if (tr.everyBars && bed.bar % tr.everyBars !== 0) continue;
        const swing = (bed.step % 2 === 1) ? (bed.spec.swing || 0) * stepDur : 0;
        VOICES[tr.voice](bed, bed.nextTime + swing, vel, tr.params);
      }
    }
    bed.step = (bed.step + 1) % BAR_STEPS;
    if (bed.step === 0) bed.bar++;
    bed.nextTime += stepDur;
  }
}

function killBed(bed) {
  for (const n of [...bed.sustained, ...bed.sustainedExtra]) {
    try { if (n.stop) n.stop(); n.disconnect(); } catch (e) { /* already gone */ }
  }
  try { bed.out.disconnect(); } catch (e) { /* already gone */ }
}

function tickScheduler() {
  const ctx = audio.getCtx();
  if (ctx.state !== 'running') return;
  const horizon = ctx.currentTime + 0.15;
  if (current) scheduleBed(current, horizon);
}

export function start() {
  if (started) return;
  started = true;
  timer = setInterval(tickScheduler, 50);
  if (!current) setEra(0, 0);
}

export function stop() {
  clearInterval(timer);
  started = false;
  if (current) { killBed(current); current = null; }
  if (fading) { killBed(fading); fading = null; }
}

// Switch beds with a crossfade. lap transposes everything up a semitone per
// GOAT lap — cheap escalating mania.
export function setEra(idx, lap = 0) {
  const ids = ['dropout', 'graduation', 'heartbreak', 'mbdtf', 'yeezus', 'pablo', 'donda'];
  const id = ids[idx % ids.length];
  const ctx = audio.getCtx();
  if (current && current.id === id && current.lapN === lap) return;

  if (fading) { killBed(fading); fading = null; }
  if (current) {
    fading = current;
    fading.out.gain.setTargetAtTime(0.0001, ctx.currentTime, 0.5);
    const dead = fading;
    setTimeout(() => { if (fading === dead) { killBed(dead); fading = null; } else killBed(dead); }, 2600);
  }
  current = makeBed(id);
  current.lapN = lap;
  current.transpose = lap;
  current.out.gain.setTargetAtTime(0.9 * modeGain, ctx.currentTime + 0.1, 0.7);
}

// Title screen plays the bed quietly; gameplay at full level.
export function setMode(mode) {
  modeGain = mode === 'playing' ? 1 : 0.45;
  if (current) current.out.gain.setTargetAtTime(0.9 * modeGain, audio.getCtx().currentTime, 0.4);
}

// 0..1 phase of the current bed's beat — drives the 808s pulse visuals.
export function getPulsePhase() {
  if (!current) return null;
  const ctx = audio.getCtx();
  if (ctx.state !== 'running') return null;
  const beatDur = 60 / current.spec.bpm;
  const t = ctx.currentTime - current.startTime;
  return (t / beatDur) % 1;
}

// Current chord frequencies (for scale-quantized SFX).
export function getScaleFreqs() {
  if (!current) return null;
  return current.chord().map(off => current.spec.root * SEMI(off));
}

// Test harness: force-schedule N seconds of the current bed regardless of the
// audio clock, so every voice code path executes (exceptions surface even on
// headless builds whose audio clock never advances).
export function _debugPump(sec = 4) {
  if (!current) return 'no bed';
  scheduleBed(current, current.nextTime + sec);
  return `pumped ${sec}s id=${current.id} bar=${current.bar} step=${current.step}`;
}
