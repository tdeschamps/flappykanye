// Procedural era soundtrack — seven tracks, one scheduler, zero assets.
//
// Direction (round 3): each era is anchored in THAT album's production
// signatures, beats first. Chipmunk-soul chops + boom-bap for College
// Dropout; stadium synths + four-on-floor for Graduation; TR-808 kit +
// autotune glides for 808s; dark maximalist strings/choir/toms for MBDTF;
// drones and dark slabs (the original bed, verbatim) + a Black-Skinhead tom
// gallop for Yeezus; gospel organ/choir/claps for TLOP; organ-void + huge
// 808 hits for Donda. Drums are mix-forward everywhere.
//
// A bed is pure data: bpm + sustained voices + 16-step tracks. On era change
// the old bed ramps out while the new ramps in (max two beds alive).

import * as audio from './audio.js';

const SEMI = (n) => Math.pow(2, n / 12);
const BAR_STEPS = 16;

// ---------------- Bed specs (data only) ----------------
// chords: semitone offsets from root per bar (looping) — tonal centers for
// stabs/pads and the scale-quantized score SFX.
const BEDS = {
  // THE COLLEGE DROPOUT · chipmunk soul, swung boom-bap.
  dropout: {
    bpm: 90, root: 116.54, swing: 0.16,
    chords: [[0, 3, 7, 10], [-4, 0, 3, 7], [-7, -3, 0, 5], [-2, 2, 5, 8]],
    sustained: [{ voice: 'drone', params: { type: 'triangle', cutoff: 500, gain: 0.025, lfoDepth: 80 } }],
    tracks: [
      { voice: 'chipmunkLead', pattern: [0, 0, 1, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0], everyBars: 2,
        params: { phrases: [[12, 15, 17, 15], [15, 17, 19, 22], [12, 10, 12, 15]], noteDur: 0.17, octave: 12, gain: 0.07 } },
      { voice: 'chordStab', pattern: [1, 0, 0, 0, 0, 0, 0, 0, 0, 0, .8, 0, 0, 0, 0, 0],
        params: { type: 'triangle', dur: 0.9, lp: 1400, warble: 10, octave: 12, gain: 0.07 } },
      { voice: 'bassNote', pattern: [1, 0, 0, 0, 0, 0, 0, .8, 0, 0, 1, 0, 0, 0, 0, 0],
        params: { degrees: [0, 0, 7], dur: 0.3, gain: 0.14 } },
      { voice: 'kick', pattern: [1, 0, 0, 0, 0, 0, 0, .9, 0, 0, .9, 0, 0, 0, 0, 0],
        params: { f0: 120, f1: 48, dur: 0.18, gain: 0.34 } },
      { voice: 'snare', pattern: [0, 0, 0, 0, 1, 0, 0, 0, 0, 0, 0, 0, 1, 0, 0, 0],
        params: { gain: 0.2 } },
      { voice: 'hat', pattern: [.7, 0, .5, 0, .8, 0, .5, 0, .7, 0, .5, 0, .8, 0, .6, 0],
        params: { gain: 0.05 } },
    ],
  },
  // GRADUATION · stadium synths, four-on-floor.
  graduation: {
    bpm: 112, root: 82.41, swing: 0,
    chords: [[0, 3, 7], [-2, 2, 5], [3, 7, 10], [-4, 0, 3]],
    sustained: [{ voice: 'drone', params: { cutoff: 900, gain: 0.028, lfoRate: 0.09, lfoDepth: 300 } }],
    tracks: [
      { voice: 'arp', pattern: [1, 0, .8, 0, 1, 0, .8, 0, 1, 0, .8, 0, 1, 0, .8, 0],
        params: { degrees: [0, 7, 12, 10], type: 'sawtooth', dur: 0.16, lp: 2200, q: 6, octave: 12, gain: 0.055 } },
      { voice: 'bassNote', pattern: [1, 0, 1, 0, 1, 0, 1, 0, 1, 0, 1, 0, 1, 0, 1, 0],
        params: { degrees: [0], dur: 0.12, gain: 0.11 } },
      { voice: 'kick', pattern: [1, 0, 0, 0, 1, 0, 0, 0, 1, 0, 0, 0, 1, 0, 0, 0],
        params: { f0: 130, f1: 45, dur: 0.16, gain: 0.34 } },
      { voice: 'clap', pattern: [0, 0, 0, 0, 1, 0, 0, 0, 0, 0, 0, 0, 1, 0, 0, 0],
        params: { gain: 0.16 } },
      { voice: 'hat', pattern: [0, 0, 1, 0, 0, 0, 1, 0, 0, 0, 1, 0, 0, 0, 1, 0],
        params: { open: true, gain: 0.04 } },
    ],
  },
  // 808s & HEARTBREAK · TR-808 kit + autotune melancholy.
  heartbreak: {
    bpm: 84, root: 92.5, swing: 0,
    chords: [[0], [0], [-4], [-4]],
    sustained: [{ voice: 'drone', params: { type: 'triangle', cutoff: 600, gain: 0.045, fifth: true, lfoDepth: 150 } }],
    tracks: [
      { voice: 'kick', pattern: [1, 0, 0, 0, 0, 0, 0, 0, 0, 0, .9, 0, 0, 0, 0, 0],
        params: { f0: 80, f1: 30, dur: 0.5, gain: 0.4 } },
      { voice: 'snare', pattern: [0, 0, 0, 0, 1, 0, 0, 0, 0, 0, 0, 0, 1, 0, 0, 0],
        params: { freq: 2600, q: 3, tone: 0, gain: 0.09 } },
      { voice: 'hat', pattern: [0, 0, .6, 0, 0, 0, .6, 0, 0, 0, .6, 0, 0, 0, .6, 0],
        params: { gain: 0.03 } },
      { voice: 'lead', pattern: [0, 0, 0, 0, 0, 0, 0, 0, 1, 0, 0, 0, 0, 0, 0, 0], everyBars: 4,
        params: { degrees: [19, 17, 15, 12], type: 'square', dur: 2.2, lp: 1200, glide: 0.18, gain: 0.045 } },
    ],
  },
  // MBDTF · dark maximalism: strings, choir, tribal toms, big drums.
  mbdtf: {
    bpm: 93, root: 65.41, swing: 0,
    chords: [[0, 3, 7], [8, 12, 15], [3, 7, 10], [10, 13, 17]],
    sustained: [{ voice: 'drone', params: { cutoff: 650, gain: 0.03, sfx: true } }],
    tracks: [
      { voice: 'chordPad', pattern: [1, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0], everyBars: 2,
        params: { type: 'sawtooth', detune: 9, attack: 1.2, dur: 4.4, lp: 950, octave: 12, gain: 0.07 } },
      { voice: 'choirPad', pattern: [0, 0, 0, 0, 0, 0, 0, 0, 1, 0, 0, 0, 0, 0, 0, 0], everyBars: 2,
        params: { attack: 0.8, dur: 2.6, octave: 12, gain: 0.06 } },
      { voice: 'kick', pattern: [1, 0, 0, 0, 0, 0, 0, 0, 1, 0, 0, 0, 0, 0, 0, 0],
        params: { f0: 70, f1: 34, dur: 0.4, gain: 0.36, noise: true } },
      { voice: 'snare', pattern: [0, 0, 0, 0, 1, 0, 0, 0, 0, 0, 0, 0, 1, 0, 0, 0],
        params: { gain: 0.22 } },
      { voice: 'clap', pattern: [0, 0, 0, 0, 1, 0, 0, 0, 0, 0, 0, 0, 1, 0, 0, 0],
        params: { gain: 0.1 } },
      { voice: 'tom', pattern: [0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 1, .9, .9, 1], everyBars: 4,
        params: { pitches: [[220, 120], [180, 100], [150, 85], [120, 70]], dur: 0.18, gain: 0.2 } },
    ],
  },
  // YEEZUS · drones and dark slabs: the original bed, verbatim, plus a
  // Black-Skinhead tom gallop — all percussion through the distortion.
  yeezus: {
    bpm: 130, root: 55, swing: 0, drumsSfx: true,
    chords: [[0], [0], [3], [5]],
    sustained: [{ voice: 'drone', params: { cutoff: 800, gain: 0.05, sfx: true, lfoRate: 0.07, lfoDepth: 350, detuneRatio: 55.4 / 55 } }],
    tracks: [
      { voice: 'tom', pattern: [1, 0, 0, 1, 0, 0, 1, 0, 1, 0, 0, 1, 0, 0, 1, 0],
        params: { pitches: [[150, 70], [110, 55]], dur: 0.14, gain: 0.3 } },
      { voice: 'snare', pattern: [0, 0, 0, 0, 1, 0, 0, 0, 0, 0, 0, 0, 1, 0, 0, 0],
        params: { freq: 1500, q: 0.8, gain: 0.3 } },
      { voice: 'hat', pattern: [.5, 0, .4, 0, .5, 0, .4, 0, .5, 0, .4, 0, .5, 0, .4, 0],
        params: { gain: 0.03 } },
    ],
  },
  // TLOP / YE · gospel: organ chords, choir, stomps and claps.
  pablo: {
    bpm: 80, root: 87.31, swing: 0.08,
    chords: [[0, 4, 7], [-5, -1, 2], [-8, -5, 0], [-7, -4, 0]],
    sustained: [],
    tracks: [
      { voice: 'organChord', pattern: [1, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0],
        params: { attack: 0.2, dur: 2.9, octave: 12, gain: 0.09 } },
      { voice: 'choirPad', pattern: [0, 0, 0, 0, 0, 0, 0, 0, 1, 0, 0, 0, 0, 0, 0, 0], everyBars: 2,
        params: { attack: 0.9, dur: 3.0, octave: 12, gain: 0.055 } },
      { voice: 'kick', pattern: [1, .6, 0, 0, 0, 0, 0, 0, 1, 0, 0, 0, 0, 0, 0, 0],
        params: { f0: 95, f1: 40, dur: 0.25, gain: 0.3 } },
      { voice: 'clap', pattern: [0, 0, 0, 0, 1, 0, 0, 0, 0, 0, 0, 0, 1, 0, 0, 0],
        params: { echo: true, gain: 0.18 } },
      { voice: 'hat', pattern: [0, 0, .6, 0, 0, 0, .6, 0, 0, 0, .6, 0, 0, 0, .6, 0],
        params: { freq: 8500, gain: 0.035 } },
      { voice: 'bassNote', pattern: [1, 0, 0, 0, 0, 0, 0, 0, 1, 0, 0, 0, 0, 0, 0, 0],
        params: { degrees: [0], dur: 0.6, gain: 0.12 } },
    ],
  },
  // DONDA · void liturgy: organ drone, one huge 808 per bar, rare rim.
  donda: {
    bpm: 65, root: 58.27, swing: 0,
    chords: [[0, 7, 12], [0, 7, 12], [0, 5, 12], [0, 7, 10]],
    sustained: [
      { voice: 'organ', params: { gain: 0.09 } },
      { voice: 'drone', params: { type: 'triangle', cutoff: 400, gain: 0.03, lfoDepth: 120 } },
    ],
    tracks: [
      { voice: 'kick', pattern: [1, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0],
        params: { f0: 60, f1: 26, dur: 1.0, gain: 0.34 } },
      { voice: 'snare', pattern: [0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 1, 0, 0, 0], everyBars: 2,
        params: { freq: 2600, q: 3, tone: 0, gain: 0.06 } },
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
  // ---- melodic / harmonic ----
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
  choirPad(bed, when, vel, P) {
    // Detuned saws through two vocal-formant bandpasses — "ahh".
    const chord = bed.chord();
    const g = envGain(bed.ctx, bed.out, when, P.gain * vel, P.attack, P.dur);
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
        o.frequency.value = bed.spec.root * SEMI(off + (P.octave || 0));
        o.detune.value = dt;
        vibG.connect(o.detune);
        o.connect(f1); o.connect(f2);
        o.start(when); o.stop(when + P.dur + 0.1);
      }
    }
    vib.start(when); vib.stop(when + P.dur + 0.1);
  },
  organChord(bed, when, vel, P) {
    // Gospel organ chord: additive sines per chord tone.
    const chord = bed.chord();
    const g = envGain(bed.ctx, bed.out, when, P.gain * vel, P.attack || 0.15, P.dur);
    for (const off of chord) {
      const f = bed.spec.root * SEMI(off + (P.octave || 12));
      for (const [partial, pg] of [[1, 1], [2, 0.4], [3, 0.2]]) {
        const og = bed.ctx.createGain(); og.gain.value = pg;
        const o = bed.ctx.createOscillator();
        o.type = 'sine'; o.frequency.value = f * partial;
        o.connect(og).connect(g);
        o.start(when); o.stop(when + P.dur + 0.1);
      }
    }
  },
  chipmunkLead(bed, when, vel, P) {
    // The sped-up-soul-vocal caricature: a short phrase, +40-cent bend-in,
    // vibrato, portamento between notes.
    const phrase = P.phrases[bed.phraseIdx = ((bed.phraseIdx || 0) + 1) % P.phrases.length];
    const noteDur = P.noteDur;
    const g = envGain(bed.ctx, bed.out, when, P.gain * vel, 0.03, phrase.length * noteDur + 0.2);
    const lp = bed.ctx.createBiquadFilter();
    lp.type = 'lowpass'; lp.frequency.value = 2600;
    lp.connect(g);
    const o1 = bed.ctx.createOscillator();
    const o2 = bed.ctx.createOscillator();
    o1.type = 'sine'; o2.type = 'triangle';
    const og2 = bed.ctx.createGain(); og2.gain.value = 0.4;
    o1.connect(lp); o2.connect(og2).connect(lp);
    phrase.forEach((deg, i) => {
      const f = bed.spec.root * SEMI(deg + (P.octave || 0) + bed.transpose);
      const t = when + i * noteDur;
      for (const o of [o1, o2]) {
        if (i === 0) o.frequency.setValueAtTime(f, t);
        else o.frequency.exponentialRampToValueAtTime(f, t + noteDur * 0.25);
      }
    });
    for (const o of [o1, o2]) {
      o.detune.setValueAtTime(40, when);
      o.detune.linearRampToValueAtTime(0, when + 0.1);
    }
    const vib = bed.ctx.createOscillator();
    const vibG = bed.ctx.createGain();
    vib.frequency.value = 5.5; vibG.gain.value = 9;
    vib.connect(vibG); vibG.connect(o1.detune); vibG.connect(o2.detune);
    const end = when + phrase.length * noteDur + 0.25;
    o1.start(when); o2.start(when); vib.start(when);
    o1.stop(end); o2.stop(end); vib.stop(end);
  },
  bassNote(bed, when, vel, P) {
    const degs = P.degrees || [0, 7];
    const deg = degs[bed.bassIdx = ((bed.bassIdx || 0) + 1) % degs.length];
    const g = envGain(bed.ctx, bed.out, when, P.gain * vel, 0.01, P.dur);
    const o = bed.ctx.createOscillator();
    o.type = 'sine';
    o.frequency.value = bed.spec.root * SEMI(bed.chord()[0] + deg);
    o.connect(g);
    o.start(when); o.stop(when + P.dur + 0.05);
  },
  arp(bed, when, vel, P) {
    const deg = P.degrees[bed.arpIdx++ % P.degrees.length];
    const g = envGain(bed.ctx, bed.out, when, P.gain * vel, 0.004, P.dur);
    const lp = bed.ctx.createBiquadFilter();
    lp.type = 'lowpass'; lp.frequency.value = P.lp;
    if (P.q) lp.Q.value = P.q;
    lp.connect(g);
    const o = bed.ctx.createOscillator();
    o.type = P.type;
    o.frequency.value = bed.spec.root * SEMI(deg + bed.chord()[0] + (P.octave || 0));
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
  swell(bed, when, vel, P) {
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
  // ---- percussion (routes to bed.drumOut — Yeezus distorts it) ----
  kick(bed, when, vel, P) {
    const g = envGain(bed.ctx, bed.drumOut, when, P.gain * vel, 0.003, P.dur);
    const o = bed.ctx.createOscillator();
    o.type = 'sine';
    o.frequency.setValueAtTime(P.f0, when);
    o.frequency.exponentialRampToValueAtTime(P.f1, when + P.dur * 0.8);
    o.connect(g);
    o.start(when); o.stop(when + P.dur + 0.05);
    if (P.noise) VOICES.noiseHit(bed, when, vel * 0.5, { freq: 900, q: 0.7, dur: 0.08, gain: P.gain * 0.25 });
  },
  heartbeat(bed, when, vel, P) {
    VOICES.kick(bed, when, vel, P);
    VOICES.kick(bed, when + 0.12, vel * 0.55, { ...P, f0: P.f0 * 0.85 });
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
    const g = envGain(ctx, bed.drumOut, when, P.gain * vel, 0.002, P.dur + 0.01);
    src.connect(f).connect(g);
    src.start(when); src.stop(when + P.dur + 0.02);
  },
  snare(bed, when, vel, P) {
    VOICES.noiseHit(bed, when, vel, { freq: P.freq || 1800, q: P.q || 0.9, dur: 0.12, gain: P.gain });
    if (P.tone !== 0) {
      const g = envGain(bed.ctx, bed.drumOut, when, P.gain * vel * 0.6, 0.002, 0.09);
      const o = bed.ctx.createOscillator();
      o.type = 'triangle'; o.frequency.value = 190;
      o.connect(g);
      o.start(when); o.stop(when + 0.1);
    }
  },
  hat(bed, when, vel, P) {
    VOICES.noiseHit(bed, when, vel, {
      freq: P.freq || 7000, q: 0.7, dur: P.open ? 0.09 : 0.03, gain: P.gain, type: 'highpass',
    });
  },
  clap(bed, when, vel, P) {
    for (const d of [0, 0.015, 0.03]) {
      VOICES.noiseHit(bed, when + d, vel * (d ? 0.7 : 1), { freq: 1200, q: 1.2, dur: 0.05, gain: P.gain * 0.8 });
    }
    if (P.echo) VOICES.noiseHit(bed, when + 0.12, vel * 0.4, { freq: 1200, q: 1.2, dur: 0.05, gain: P.gain * 0.4 });
  },
  tom(bed, when, vel, P) {
    const pitches = P.pitches || [[160, 90]];
    const [f0, f1] = pitches[bed.tomIdx = ((bed.tomIdx || 0) + 1) % pitches.length];
    VOICES.kick(bed, when, vel, { f0, f1, dur: P.dur || 0.18, gain: P.gain });
  },
};

// Sustained voices live for the bed's whole life.
const SUSTAINED = {
  // The Yeezus backbone: two detuned saws through an LFO-swept lowpass;
  // sfx:true inserts the waveshaper distortion locally so the era crossfade
  // still owns the level. Other eras use it quietly as a pad stand-in.
  drone(bed, P) {
    const ctx = bed.ctx;
    const g = ctx.createGain(); g.gain.value = P.gain;
    const lp = ctx.createBiquadFilter();
    lp.type = 'lowpass'; lp.frequency.value = P.cutoff; lp.Q.value = 0.6;
    const nodes = [g, lp];
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
let current = null;
let fading = null;
let timer = 0;
let started = false;
let modeGain = 1;

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
  // Percussion bus: straight to the bed, or through a local distortion
  // (Yeezus) — either way inside the crossfaded bed output.
  if (spec.drumsSfx) {
    const sh = ctx.createWaveShaper();
    sh.curve = audio.makeDistortionCurve(40);
    sh.oversample = '4x';
    sh.connect(out);
    bed.drumOut = ctx.createGain();
    bed.drumOut.connect(sh);
    bed.sustained.push(sh, bed.drumOut);
  } else {
    bed.drumOut = out;
  }
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

// Switch beds with a crossfade. GOAT laps transpose up a semitone per lap.
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
