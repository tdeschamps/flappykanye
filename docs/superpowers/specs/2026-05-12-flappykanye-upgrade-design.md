# Flappy Kanye — Mind-Blowing Upgrade

**Date:** 2026-05-12
**Status:** Approved (pending user spec review)

## Goal

Transform the current single-file Flappy Kanye prototype from a competent gradient-and-primitives game into something people stop scrolling to share. Three high-leverage moves, executed deeply rather than broadly: **procedural Yeezus-style audio**, a **rigged SVG Kanye character**, and a **WebGL Turrell shader backdrop**.

Non-goals for this iteration: era-specific gameplay mechanics, meta-game (unlocks/leaderboard/GIF export), mobile-specific tuning, accessibility audit. Those are deliberate cuts to keep the scope shippable.

## Architecture

Three independent rendering layers stacked inside `#stage`, plus an audio graph that runs in parallel. One game loop owns the clock and drives all three.

```
┌──────────────────────────────────────────┐
│  HTML overlay (score, chamber name, HUD) │
├──────────────────────────────────────────┤
│  SVG Kanye (absolutely positioned)       │   ← rigged character
├──────────────────────────────────────────┤
│  Canvas2D #fg  — pipes, death flash      │   ← gameplay objects
├──────────────────────────────────────────┤
│  WebGL    #bg  — Turrell light field     │   ← backdrop
└──────────────────────────────────────────┘
       │
       └─→ Web Audio graph (parallel)
```

**Why this layering:** each layer has one job and fails independently. A shader bug can't break gameplay; an audio failure can't break rendering; the SVG rig can be redrawn without touching the canvases. Matches CLAUDE.md Karpathy rule 1: keep the working thing working.

### File layout

| File | Responsibility |
|---|---|
| `index.html` | Stage, two canvases, SVG Kanye rig markup, HUD, overlay |
| `style.css` | All styling extracted from the inline `<style>` block |
| `main.js` | Entry point, game loop, input, state machine |
| `game.js` | Physics, pipe spawning, collisions, scoring |
| `kanye.js` | SVG rig refs + procedural animation driven by game state |
| `chambers.js` | Chamber definitions (palette, accent, audio cue mapping) |
| `shader.js` | WebGL program: vertex + fragment shader sources, uniform sync |
| `audio.js` | `AudioContext`, synth voices, FX bus, public API |

Plain ES modules. Zero build step. Loaded via `<script type="module">`.

## Audio system

Web Audio API, fully procedural. Single `AudioContext`, unlocked on first flap.

### Graph

```
[voices] → [pre-fx gain] → [waveshaper (soft clip)] → [convolver (plate IR)] → [master limiter] → destination
```

The convolver impulse response is generated at init time — 80ms of decaying filtered noise, baked into an `AudioBuffer`. No network, no assets.

### Voices

| Voice | Trigger | Synthesis |
|---|---|---|
| `sub808` | Every flap | Sine osc @ 55Hz, pitch envelope sweeping 110→40Hz over 120ms, heavy waveshaper distortion, short decay. |
| `clang` | Pipe passed (score++) | FM pair: carrier 800Hz + modulator 1300Hz at modulation index 4, 90ms decay. Pitch shifted by gap height. |
| `vocalChop` | Death | Filtered pink noise burst + ring-modulated 220Hz sine, played through pitch-shifted overlap. Hard-clipped. |
| `gospelStab` | Chamber transition (every 5 points) | Three detuned sawtooths (root + fifth + octave) through bandpass with envelope sweep 200→2000Hz. |
| `ambientBed` | Continuous | Two slightly detuned saw pads at -28dB, slow LFO on lowpass cutoff. |
| `breath` | Idle, ~8s interval | Filtered pink noise pulse, soft. |

### Musicality (without a metronome)

- `sub808` pitch walks down a Phrygian scale across consecutive flaps; resets on collision. Gives flap timing a melodic shape without locking to BPM.
- `clang` pitch maps to pipe `gapY` — high gaps clang higher. The level effectively plays the player.
- `gospelStab` plays in a different inversion each chamber transition.

### Public API

```js
audio.init();           // creates context on first user gesture
audio.flap();
audio.score(gapY);      // gapY drives clang pitch
audio.chamber(idx);     // triggers gospel stab in the right voicing
audio.death();
audio.setMuted(bool);
```

### Controls

- `M` key toggles mute.
- Small mute button in HUD corner, mirrors keyboard state.
- Mute state persisted to `localStorage`.

## Kanye SVG rig

Inline `<svg>` in `index.html`, ~60px nominal size, absolutely positioned inside `#stage`. JS holds references to ~9 inner `<g>`/element nodes and updates their `transform` attributes each frame.

### Layer stack (back → front)

1. `body` — hoodie sliver, jaw-pivot anchor
2. `head` — flesh oval with subtle South Park asymmetry (~2px wider on the left)
3. `ear-left`, `ear-right` — small ovals
4. `jaw` — separate piece, pivots from a point just under the head
5. `mouth` — child of `jaw`, swaps between `closed` / `o` / `ad-lib` path shapes
6. `nose` — small dark arc
7. `cap` — Donda all-black, tilts at 30% of body rotation
8. `glasses` — Yeezus shutter shades; slat strokes driven by chamber accent color
9. `glasses-glint` — bright `<rect>` that sweeps across the slats on each flap

### Animation rig

Procedural, no keyframes. All driven from game state each frame.

| Input | Effect |
|---|---|
| `vy` | Body rotation clamped to [-30°, +60°]. Cap tilts at 0.3× body rotation. |
| Flap event | Jaw drop pulse (decays over 200ms), glint sweep (300ms), head bob (-8px → 0 over 120ms). |
| Idle mode | 3Hz head bob, 0.5Hz cap tilt, occasional `mouth → "o"` (mumble). |
| Score event | One-frame `mouth → "ad-lib"`, synchronized with audio "HUH" via `audio.score()`. |
| Chamber transition | Glasses slat color crossfades to new chamber accent over 1.2s. |
| Death | Jaw drops fully, glasses tilt 15° off-axis, cap separates and falls with its own gravity sim for 1.5s, body tumbles. |

### Why SVG over Canvas2D

- One transform-attribute mutation per layer per frame vs. ~30 canvas draw ops
- Resolution-independent — looks identical retina vs. not
- Inspectable in devtools during iteration (Karpathy rule 8: fast feedback)

## WebGL Turrell shader

Backdrop canvas with `webgl` context. One program. One fullscreen triangle (3 vertices total, no buffers beyond that). All visual work happens in the fragment shader, ~150 lines of GLSL.

### Uniforms (synced each frame from JS)

| Uniform | Source | Effect |
|---|---|---|
| `uTime` | `state.t` | Color drift, breathing aperture |
| `uResolution` | canvas size | Normalized coordinates |
| `uColorA`, `uColorB`, `uAccent` | crossfaded chamber palette | Field colors |
| `uAperturePos` | slow Lissajous of `uTime` | Light source position |
| `uApertureSize` | static, pulses on score | Iconic Turrell rectangle |
| `uFlashIntensity` | decays from 1.0 on death | Red wash overlay |
| `uShake` | decays after collisions | Aperture displacement |
| `uMode` | int: 0=idle, 1=play, 2=dead | Mode-specific tweaks |

### Fragment shader passes (single pass, ordered ops)

1. **Volumetric light field** — Radial gradient between `uColorA` and `uColorB`, offset by layered sin/cos so the "light source" drifts through perceived 3D space rather than on a flat plane.
2. **Soft aperture** — Signed-distance field for a rounded rectangle, interior tinted toward `uAccent`, edges feathered with `smoothstep`.
3. **Cheap bloom** — Re-evaluate aperture SDF at 4 offset positions, average. Glowing edges without multi-pass blur.
4. **Chromatic aberration** — Per-channel position offset scaled by distance from center, capped at 1.5px. Subtle but transformative.
5. **Film grain** — `hash21(uv + uTime)` at 4% intensity.
6. **Vignette** — Soft corner darkening.
7. **Death flash** — `mix(color, vec3(0.72,0.14,0.11), uFlashIntensity)`.

### Performance and fallback

Target: 60fps at 540×960. Math is cheap (~30 ops/pixel, no loops, no textures). Mobile is the risk.

- WebGL init wrapped in try/catch.
- If init fails: hide `#bg`, gameplay canvas falls back to its current Canvas2D gradient backdrop. Game still works.
- If sustained framerate < 45fps for 2s: same fallback, with a console log. No user-facing error.

## Game loop and state machine

States: `idle`, `playing`, `dead`. Single transition flow unchanged from current code.

Each frame:
1. Advance physics (`game.js`)
2. Update Kanye rig from state (`kanye.js`)
3. Sync shader uniforms (`shader.js`)
4. Render WebGL backdrop
5. Render Canvas2D pipes + death flash
6. Update HUD text

Audio events fire from the state machine, not the render loop — flap, score, chamber, death are all events, not per-frame work.

## Testing strategy

No test framework — this is a single-page game with strong visual feedback. Verification is by play.

Smoke checklist for each layer:
- **Audio:** Mute toggle works; flapping during sustained play produces a phrasing arc, not just monotone thuds; death sound clearly differs from flap.
- **Kanye:** Jaw drops on death; cap tilts visibly when rotating; glasses recolor on chamber transition; glint sweeps on flap.
- **Shader:** Backdrop is clearly volumetric (not a flat gradient); aperture drifts; chromatic aberration visible at edges; vignette present; death flash red and decays smoothly.
- **Integration:** Game playable at 60fps in Chrome and Safari on macOS; WebGL fallback works when forced (comment out shader init).

## Risks

- **Audio that feels "AI-procedural"** — sterile, click-track-y. Mitigation: stay tied to gameplay rhythm (flaps drive timing), avoid loops, use the Phrygian walk so it has a vibe.
- **SVG performance with frequent transform updates** — Should be fine for 9 elements but worth measuring. Mitigation: if needed, batch into single root transform and offset children with fixed positions.
- **Shader looking like Instagram filter rather than Turrell** — The volumetric step is what saves it from this. If it still looks flat, increase aperture motion and reduce vignette.
- **Scope creep mid-implementation** — Era-specific mechanics are tempting. Mitigation: explicit non-goals list above. Anything not in scope goes in a follow-up doc.

## Out of scope (deliberate)

- Mobile touch tuning beyond what already works
- High scores beyond the existing `localStorage` single-best
- Era-specific gameplay mechanics
- Replay export, sharing, leaderboards
- Accessibility audit
- Build pipeline / bundling
