// Procedural era soundtrack — seven tracks, one scheduler, zero assets.
//
// Sound direction (round 2): drone-first. The backbone of every era is the
// ORIGINAL bed that shipped with the game — two detuned saws through an
// LFO-swept lowpass into the waveshaper distortion — dark, hypnotic,
// installation music. Each era tints the drone (root, cutoff, color) and adds
// at most two sparse accents. Yeezus is the original, verbatim, nothing else.
//
// A bed is pure data: bpm + sustained voices + 16-step tracks. On era change
// the old bed ramps out while the new ramps in (max two beds alive).

import * as audio from './audio.js';

const SEMI = (n) => Math.pow(2, n / 12);
const BAR_STEPS = 16;

// ---------------- Bed specs (data only) ----------------
// chords: semitone offsets from root, one per bar (looping) — they are the
// tonal centers for stabs/pads and for scale-quantized score SFX.
const BEDS = {
  // THE COLLEGE DROPOUT — dusty soul in a dark room: warm drone, one worn
  // minor-7 stab every other bar, lazy boom-bap thump and brushed snare.
  dropout: {
    bpm: 84, root: 58.27, swing: 0.14,
    chords: [[0, 3, 7, 10], [-4, 0, 3, 7], [-7, -4, 0, 5], [-2, 2, 5, 8]],
    sustained: [{ voice: 'drone', params: { cutoff: 700, gain: 0.045, sfx: true, lfoDepth: 250 } }],
    tracks: [
      { voice: 'chordStab', pattern: [1, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0], everyBars: 2,
        params: { type: 'triangle', dur: 1.4, lp: 1100, warble: 12, octave: 24, gain: 0.09 } },
      { voice: 'kick', pattern: [1, 0, 0, 0, 0, 0, 0, 0, 0, 0, .7, 0, 0, 0, 0, 0],
        params: { f0: 110, f1: 44, dur: 0.22, gain: 0.26 } },
      { voice: 'noiseHit', pattern: [0, 0, 0, 0, 0, 0, 0, 0, 1, 0, 0, 0, 0, 0, 0, 0],
        params: { freq: 1600, q: 1.1, dur: 0.13, gain: 0.08 } },
    ],
  },
  // GRADUATION — the stadium at night: brighter drone, one slow light-sweep
  // swell per bar, dubby kick on the downbeat.
  graduation: {
    bpm: 96, root: 82.41, swing: 0,
    chords: [[0, 3, 7], [-2, 2, 5], [3, 7, 10], [-4, 0, 3]],
    sustained: [{ voice: 'drone', params: { cutoff: 1000, gain: 0.04, sfx: true, lfoRate: 0.09, lfoDepth: 420 } }],
    tracks: [
      { voice: 'swell', pattern: [1, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0],
        params: { f0: 220, f1: 1500, dur: 2.0, octave: 12, gain: 0.045 } },
      { voice: 'kick', pattern: [1, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0],
        params: { f0: 100, f1: 40, dur: 0.3, gain: 0.2 } },
    ],
  },
  // 808s & HEARTBREAK — the cold room: hollow triangle drone with a fifth,
  // the literal heartbeat, one lonely autotune glide every eight bars.
  heartbreak: {
    bpm: 60, root: 92.5, swing: 0,
    chords: [[0], [0], [-4], [-4]],
    sustained: [{ voice: 'drone', params: { type: 'triangle', cutoff: 600, gain: 0.05, fifth: true, lfoDepth: 150 } }],
    tracks: [
      { voice: 'heartbeat', pattern: [1, 0, 0, 0, 1, 0, 0, 0, 1, 0, 0, 0, 1, 0, 0, 0],
        params: { f0: 92, f1: 38, dur: 0.30, gain: 0.42 } },
      { voice: 'lead', pattern: [0, 0, 0, 0, 0, 0, 0, 0, 1, 0, 0, 0, 0, 0, 0, 0], everyBars: 8,
        params: { degrees: [19, 17, 15, 12], type: 'square', dur: 2.4, lp: 1200, glide: 0.18, gain: 0.04 } },
    ],
  },
  // MBDTF — dark opulence: driven drone with a fifth, timpani on the bar,
  // a slow minor string swell every other bar.
  mbdtf: {
    bpm: 90, root: 65.41, swing: 0,
    chords: [[0, 3, 7], [8, 12, 15], [3, 7, 10], [10, 13, 17]],
    sustained: [{ voice: 'drone', params: { cutoff: 750, gain: 0.05, fifth: true, sfx: true } }],
    tracks: [
      { voice: 'kick', pattern: [1, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0],
        params: { f0: 68, f1: 34, dur: 0.5, gain: 0.3, noise: true } },
      { voice: 'chordPad', pattern: [1, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0], everyBars: 2,
        params: { type: 'sawtooth', detune: 9, attack: 1.4, dur: 4.6, lp: 900, octave: 12, gain: 0.07 } },
    ],
  },
  // YEEZUS — the original bed, verbatim. Two saws at 55/55.4Hz through the
  // swept lowpass into the distortion. Perfect already; touch nothing.
  yeezus: {
    bpm: 130, root: 55, swing: 0,
    chords: [[0], [0], [3], [5]],
    sustained: [{ voice: 'drone', params: { cutoff: 800, gain: 0.05, sfx: true, lfoRate: 0.07, lfoDepth: 350, detuneRatio: 55.4 / 55 } }],
    tracks: [],
  },
  // TLOP / YE — gospel at dusk: warm drone, somber minor-plagal pads,
  // a single soft clap on the 3.
  pablo: {
    bpm: 70, root: 87.31, swing: 0.08,
    chords: [[0, 3, 7], [-5, -2, 2], [3, 7, 10], [-7, -4, 0]],
    sustained: [{ voice: 'drone', params: { cutoff: 800, gain: 0.04, lfoDepth: 220 } }],
    tracks: [
      { voice: 'chordPad', pattern: [1, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0], everyBars: 2,
        params: { type: 'triangle', detune: 6, attack: 0.8, dur: 3.4, lp: 1300, octave: 12, gain: 0.08 } },
      { voice: 'noiseHit', pattern: [0, 0, 0, 0, 0, 0, 0, 0, .8, 0, 0, 0, 0, 0, 0, 0],
        params: { freq: 1200, q: 1.0, dur: 0.09, gain: 0.045 } },
    ],
  },
  // DONDA — void liturgy: the additive organ swell, a sub pulse every other
  // bar, one distant bell rarely.
  donda: {
    bpm: 52, root: 58.27, swing: 0,
    chords: [[0, 7, 12], [0, 7, 12], [0, 5, 12], [0, 7, 10]],
    sustained: [
      { voice: 'organ', params: { gain: 0.09 } },
      { voice: 'drone', params: { type: 'triangle', cutoff: 400, gain: 0.035, lfoDepth: 120 } },
    ],
    tracks: [
      { voice: 'kick', pattern: [1, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0], everyBars: 2,
        params: { f0: 55, f1: 29, dur: 0.9, gain: 0.22 } },
      { voice: 'arp', pattern: [0, 0, 0, 0, 0, 0, 0, 0, 1, 0, 0, 0, 0, 0, 0, 0], everyBars: 32,
        params: { degrees: [19], type: 'sine', dur: 2.0, lp: 4000, gain: 0.035, fm: 1.5 } },
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
        o.frequency.value = bed.spec.root * SEMI(off + (P.octave || 0));
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
    lp.connect(g);
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
    // Portamento autotune caricature: glides through degrees in hard steps.
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
    VOICES.kick(bed, when, vel, P);                                       // lub
    VOICES.kick(bed, when + 0.12, vel * 0.55, { ...P, f0: P.f0 * 0.85 }); // DUB
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
  swell(bed, when, vel, P) {
    // A slow bandpass opening over a chord-rooted saw — stadium lights.
    const g = envGain(bed.ctx, bed.out, when, P.gain * vel, P.dur * 0.5, P.dur);
    const bp = bed.ctx.createBiquadFilter();
    bp.type = 'bandpass'; bp.Q.value = 1.4;
    bp.frequency.setValueAtTime(P.f0, when);
    bp.frequency.exponentialRampToValueAtTime(P.f1, when + P.dur * 0.85);
    bp.connect(g);
    const o = bed.ctx.createOscillator();
    o.type = 'sawtooth';
    o.frequency.value = bed.spec.root * SEMI(bed.chord()[0] + (P.octave || 0));
    o.connect(bp);
    o.start(when); o.stop(when + P.dur + 0.05);
  },
};

// Sustained voices live for the bed's whole life.
const SUSTAINED = {
  // The backbone: the original startBed, parameterized. Two detuned saws
  // (optionally + a fifth) through an LFO-swept lowpass; sfx:true inserts the
  // waveshaper distortion locally so the era crossfade still owns the level.
  drone(bed, P) {
    const ctx = bed.ctx;
    const g = ctx.createGain(); g.gain.value = P.gain;
    const lp = ctx.createBiquadFilter();
    lp.type = 'lowpass'; lp.frequency.value = P.cutoff; lp.Q.value = 0.6;
    const nodes = [g, lp];
    let head = g;
    if (P.sfx) {
      const shaper = ctx.createWaveShaper();
      shaper.curve = audio.makeDistortionCurve(40);
      shaper.oversample = '4x';
      lp.connect(shaper).connect(g);
      nodes.push(shaper);
    } else {
      lp.connect(g);
    }
    g.connect(bed.out);
    const root = bed.spec.root * SEMI(bed.transpose);
    const freqs = [root, root * (P.detuneRatio || 1.007)];
    if (P.fifth) freqs.push(root * 1.5);
    for (const f of freqs) {
      const o = ctx.createOscillator();
      o.type = P.type || 'sawtooth';
      o.frequency.value = f;
      o.connect(lp);
      o.start();
      nodes.push(o);
    }
    const lfo = ctx.createOscillator();
    const lfoG = ctx.createGain();
    lfo.frequency.value = P.lfoRate ?? 0.07;
    lfoG.gain.value = P.lfoDepth ?? 350;
    lfo.connect(lfoG).connect(lp.frequency);
    lfo.start();
    nodes.push(lfo, lfoG);
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
    const root = bed.spec.root * SEMI(bed.transpose);
    for (const [partial, pg] of [[1, 1], [2, 0.5], [3, 0.3], [4, 0.2], [6, 0.12], [8, 0.08]]) {
      const og = bed.ctx.createGain(); og.gain.value = pg;
      const o = bed.ctx.createOscillator();
      o.type = 'sine';
      o.frequency.value = root * partial;
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
let modeGain = 1;      // 0.45 on the title screen, 1 in play

function makeBed(id, transpose = 0) {
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
    transpose,
    chord() { return this.spec.chords[this.bar % this.spec.chords.length].map(o => o + this.transpose); },
  };
  for (const s of spec.sustained) bed.sustained.push(...SUSTAINED[s.voice](bed, s.params));
  return bed;
}

function scheduleBed(bed, horizon) {
  const stepDur = 60 / bed.spec.bpm / 4;
  while (bed.nextTime < horizon) {
    for (const tr of bed.spec.tracks) {
      const vel = tr.pattern[bed.step];
      if (!vel) continue;
      if (tr.everyBars && bed.bar % tr.everyBars !== 0) continue;
      const swing = (bed.step % 2 === 1) ? (bed.spec.swing || 0) * stepDur : 0;
      VOICES[tr.voice](bed, bed.nextTime + swing, vel, tr.params);
    }
    bed.step = (bed.step + 1) % BAR_STEPS;
    if (bed.step === 0) bed.bar++;
    bed.nextTime += stepDur;
  }
}

function killBed(bed) {
  for (const n of bed.sustained) {
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

// Switch beds with a crossfade. GOAT laps transpose the whole bed up a
// semitone per lap — cheap escalating mania.
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
  current = makeBed(id, lap);
  current.lapN = lap;
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
