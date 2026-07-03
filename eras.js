// The seven rooms — Kanye's discography as Turrell light installations.
// Each era owns its palette, aperture geometry, shader mood, physics tuning,
// obstacle behavior, music bed, and death quotes. One continuous run walks
// them chronologically; after Donda the run loops as GOAT laps.

export const POINTS_PER_ERA = 7;

// pal: a = outer field, b = inner light, accent = aperture/edge light,
//      ink = monolith fill, rim = monolith edge light.
// aperture: pos/size in 0..1 screen coords, radius per the SDF convention.
// mood: → shader uniforms (uGrain/uAberration/uGlitch/uFog).
// physics: gap in logical px, speed in screen-heights/s, spawn seconds,
//          gravityMul on PHYSICS.GRAVITY. FLAP itself is sacred.
export const ERAS = [
  {
    id: 'dropout', roman: 'I', album: 'THE COLLEGE DROPOUT', year: 2004,
    turrell: 'AFRUM (PROJECTION)',
    pal: { a: '#2b1608', b: '#c46a2b', accent: '#e8b04b', ink: '#3a2417', rim: '#f3d9a4' },
    aperture: { pos: [0.50, 0.58], size: [0.66, 0.38], radius: 0.02 },
    mood: { grain: 0.10, aberration: 0.004, glitch: 0, fog: 0.70 },
    physics: { gap: 300, speed: 0.185, spawn: 1.85, gravityMul: 1.00 },
    obstacle: 'static', bed: 'dropout',
    quotes: [
      "YOU CAN'T TELL ME NOTHING — EXCEPT, APPARENTLY, 'WATCH THE WALL.'",
      'THEY TOLD ME I COULD FLY. THEY HAD A POINT TO MAKE.',
      'FOUR FLAPS OF COLLEGE AND THIS IS WHAT WE GET.',
      'THE MARCHING BAND PLAYS ON WITHOUT YOU.',
    ],
  },
  {
    id: 'graduation', roman: 'II', album: 'LATE REG / GRADUATION', year: 2007,
    turrell: 'RAEMAR PINK WHITE',
    pal: { a: '#12063a', b: '#2bb7e6', accent: '#ff4fa3', ink: '#1b0e4f', rim: '#ffd54f' },
    aperture: { pos: [0.50, 0.48], size: [0.44, 0.44], radius: 0.14 },
    mood: { grain: 0.03, aberration: 0.008, glitch: 0, fog: 0.55 },
    physics: { gap: 285, speed: 0.20, spawn: 1.75, gravityMul: 1.00 },
    obstacle: 'bob', bed: 'graduation',
    quotes: [
      'YOU TRIED TO TOUCH THE SKY. THE SKY PRESSED CHARGES.',
      'THAT WHICH DOES NOT KILL ME... OH. NEVER MIND.',
      "I'M THE GREATEST AT ALMOST EVERYTHING. ALMOST.",
      'FLASHING LIGHTS CAUGHT YOU.',
    ],
  },
  {
    id: 'heartbreak', roman: 'III', album: '808s & HEARTBREAK', year: 2008,
    turrell: 'CATSO, RED',
    pal: { a: '#050607', b: '#3c4148', accent: '#c8102e', ink: '#0b0d0f', rim: '#c8102e' },
    aperture: { pos: [0.50, 0.50], size: [0.22, 0.62], radius: 0.01 },
    mood: { grain: 0.05, aberration: 0.002, glitch: 0, fog: 0.35 },
    physics: { gap: 272, speed: 0.205, spawn: 1.70, gravityMul: 0.92 },
    obstacle: 'pulse', bed: 'heartbreak',
    quotes: [
      'LOVE LOCKDOWN. FLIGHT LOCKDOWN.',
      'WELCOME TO HEARTBREAK. MIND THE ARCHITECTURE.',
      'THE 808 JUST FLATLINED.',
      'YOU WERE THE COLDEST EVER. NOW YOU ARE JUST COLD.',
    ],
  },
  {
    id: 'mbdtf', roman: 'IV', album: 'MY BEAUTIFUL DARK TWISTED FANTASY', year: 2010,
    turrell: "BRIDGET'S BARDO",
    pal: { a: '#1c0206', b: '#8e0e1e', accent: '#d4af37', ink: '#12040a', rim: '#e6c766' },
    aperture: { pos: [0.50, 0.46], size: [0.50, 0.70], radius: 0.10 },
    mood: { grain: 0.07, aberration: 0.006, glitch: 0, fog: 0.80 },
    physics: { gap: 262, speed: 0.215, spawn: 1.62, gravityMul: 1.05 },
    obstacle: 'drift', bed: 'mbdtf',
    quotes: [
      'NO ONE MAN SHOULD HAVE ALL THAT GRAVITY.',
      'CAN WE GET MUCH HIGHER? NOT WITH THAT TECHNIQUE.',
      'A TOAST TO THE CRASH LANDINGS.',
      'BEAUTIFUL. DARK. TWISTED. BRIEF.',
    ],
  },
  {
    id: 'yeezus', roman: 'V', album: 'YEEZUS', year: 2013,
    turrell: 'GANZFELD, INVERTED',
    pal: { a: '#f2f0eb', b: '#d8d4cc', accent: '#b8231c', ink: '#0a0a0a', rim: '#b8231c' },
    aperture: { pos: [0.50, 0.50], size: [0.10, 0.86], radius: 0.0 },
    mood: { grain: 0.12, aberration: 0.010, glitch: 1.0, fog: 0.25 },
    physics: { gap: 252, speed: 0.23, spawn: 1.52, gravityMul: 1.10 },
    obstacle: 'jitter', bed: 'yeezus',
    quotes: [
      'I AM A GOD. GODS DO NOT BOUNCE OFF WALLS.',
      'HURRY UP WITH MY DAMN RESPAWN.',
      'THE MONOLITH REMAINS UNDEFEATED.',
      'THAT WALL JUST WENT FULL MINIMALIST ON YOU.',
    ],
  },
  {
    id: 'pablo', roman: 'VI', album: 'THE LIFE OF PABLO / YE', year: 2016,
    turrell: 'SKYSPACE AT DAWN',
    pal: { a: '#3a1006', b: '#ff7a3d', accent: '#ffd29d', ink: '#28100b', rim: '#ffb26b' },
    aperture: { pos: [0.50, 0.55], size: [0.34, 0.34], radius: 0.32 },
    mood: { grain: 0.06, aberration: 0.004, glitch: 0, fog: 0.90 },
    physics: { gap: 246, speed: 0.235, spawn: 1.46, gravityMul: 1.00 },
    obstacle: 'wave', bed: 'pablo',
    quotes: [
      "NAME ONE GENIUS THAT AIN'T CRASHED. GO AHEAD. I'LL WAIT.",
      'I MISS THE OLD YOU. THE ONE FROM THREE SECONDS AGO, STILL FLYING.',
      'THIS ONE FEELS LIKE A SCENE FROM A SCARY MOVIE.',
      'WYOMING WAS CALMER THAN THIS.',
    ],
  },
  {
    id: 'donda', roman: 'VII', album: 'DONDA', year: 2021,
    turrell: 'PLEIADES',
    pal: { a: '#000000', b: '#0d0d0d', accent: '#e8e4da', ink: '#050505', rim: '#e8e4da' },
    aperture: { pos: [0.50, 0.42], size: [0.10, 0.10], radius: 0.10 },
    mood: { grain: 0.04, aberration: 0.002, glitch: 0, fog: 0.50 },
    physics: { gap: 240, speed: 0.245, spawn: 1.40, gravityMul: 1.08 },
    obstacle: 'reveal', bed: 'donda',
    quotes: [
      'THE VOID KEEPS THE SCORE.',
      'YOU FLEW INTO THE ONE THING IN AN EMPTY ROOM.',
      'THE LIGHT WAS RIGHT THERE.',
      'DONDA WOULD HAVE CAUGHT YOU.',
    ],
  },
];

// Extra death quotes appended in GOAT laps.
export const GOAT_QUOTES = [
  'GOATS ALSO FALL. THEY JUST FALL FAMOUS.',
  'LAP TWO AND STILL MORTAL. HUMBLING.',
];

// score → { era, next, idx, lap, pts }. Eras are held pure; blending between
// rooms is owned by the eased visual state in main.js, not by this lookup.
export function eraFor(score) {
  const raw = Math.floor(score / POINTS_PER_ERA);
  const idx = raw % ERAS.length;
  const lap = Math.floor(raw / ERAS.length);
  return {
    era: ERAS[idx],
    next: ERAS[(idx + 1) % ERAS.length],
    idx,
    lap,
    pts: score - raw * POINTS_PER_ERA,
  };
}
