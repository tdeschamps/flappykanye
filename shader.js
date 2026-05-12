const VERT = `
attribute vec2 aPos;
void main() { gl_Position = vec4(aPos, 0.0, 1.0); }
`;

const FRAG = `
precision mediump float;

uniform float uTime;
uniform vec2  uResolution;
uniform vec3  uColorA;
uniform vec3  uColorB;
uniform vec3  uAccent;
uniform vec2  uAperturePos;
uniform vec2  uApertureSize;
uniform float uApertureRadius;
uniform float uFlashIntensity;
uniform float uShake;
uniform int   uMode;

float hash21(vec2 p) {
  p = fract(p * vec2(123.34, 456.21));
  p += dot(p, p + 45.32);
  return fract(p.x * p.y);
}

// Signed-distance to a rounded rectangle centered at c with half-size h and radius r.
float sdRoundRect(vec2 p, vec2 c, vec2 h, float r) {
  vec2 q = abs(p - c) - h + vec2(r);
  return length(max(q, 0.0)) + min(max(q.x, q.y), 0.0) - r;
}

vec3 fieldAt(vec2 uv, float t) {
  // Drift the light center on a slow Lissajous so the field feels volumetric.
  vec2 driftCenter = vec2(
    0.5 + sin(t * 0.13) * 0.08,
    0.55 + cos(t * 0.11) * 0.06
  );
  float d = distance(uv, driftCenter);
  // Two layered radial falloffs combine into a softer, deeper field.
  float r1 = smoothstep(0.0, 0.85, d);
  float r2 = smoothstep(0.2, 1.05, d * 1.1);
  float k = clamp((r1 * 0.6 + r2 * 0.4), 0.0, 1.0);
  vec3 col = mix(uColorB, uColorA, k);

  // Aperture geometry. Breathe size with a slow sin so the portal feels alive.
  // Clamp the radius so it cannot exceed the smaller half-axis (else SDF inverts).
  float breathe = 1.0 + sin(t * 0.6) * 0.025;
  vec2 apHalf = uApertureSize * 0.5 * breathe;
  float r = min(uApertureRadius, min(apHalf.x, apHalf.y) * 0.999);
  float apJitter = sin(t * 0.4) * 0.005;
  vec2 apCenter = uAperturePos + vec2(0.0, apJitter);
  float sd = sdRoundRect(uv, apCenter, apHalf, r);

  // Cheap bloom — sample SDF at offsets, average to soften edges.
  float glow = 0.0;
  for (int i = 0; i < 4; i++) {
    float a = float(i) * 1.5707963;
    vec2 o = vec2(cos(a), sin(a)) * 0.006;
    glow += smoothstep(0.05, -0.02, sdRoundRect(uv + o, apCenter, apHalf, r));
  }
  glow *= 0.25;

  float inside = smoothstep(0.0, -0.03, sd);
  vec3 apertureInner = mix(uColorB, vec3(1.0), 0.12);
  vec3 tinted = mix(apertureInner, uAccent, 0.55);

  col = mix(col, tinted, inside * 0.85);
  col += uAccent * glow * 0.6;

  return col;
}

void main() {
  vec2 uv = gl_FragCoord.xy / uResolution.xy;
  // Map to 0..1 with y flipped to feel like screen space.
  vec2 sUv = vec2(uv.x, 1.0 - uv.y);

  // Subtle aperture shake from collisions.
  sUv += vec2(
    (hash21(sUv * 50.0 + uTime) - 0.5),
    (hash21(sUv * 73.0 - uTime) - 0.5)
  ) * (uShake / uResolution.y);

  // Chromatic aberration — per-channel sample offsets scaled by distance from center.
  vec2 center = vec2(0.5);
  vec2 ca = (sUv - center) * 0.006;
  vec3 col;
  col.r = fieldAt(sUv + ca, uTime).r;
  col.g = fieldAt(sUv,      uTime).g;
  col.b = fieldAt(sUv - ca, uTime).b;

  // Film grain.
  float grain = (hash21(gl_FragCoord.xy + uTime) - 0.5) * 0.06;
  col += grain;

  // Vignette — soft corner darkening.
  float vig = smoothstep(1.05, 0.35, length(sUv - center));
  col *= mix(0.6, 1.0, vig);

  // Death flash overlay — Yeezus blood red.
  vec3 blood = vec3(0.72, 0.14, 0.11);
  col = mix(col, blood, uFlashIntensity * 0.6);

  gl_FragColor = vec4(col, 1.0);
}
`;

function compile(gl, type, src) {
  const sh = gl.createShader(type);
  gl.shaderSource(sh, src);
  gl.compileShader(sh);
  if (!gl.getShaderParameter(sh, gl.COMPILE_STATUS)) {
    const log = gl.getShaderInfoLog(sh);
    gl.deleteShader(sh);
    throw new Error('Shader compile failed: ' + log);
  }
  return sh;
}

export function createShaderBackdrop(canvas) {
  const gl = canvas.getContext('webgl', { antialias: false, alpha: false });
  if (!gl) return null;

  let program;
  try {
    const vs = compile(gl, gl.VERTEX_SHADER, VERT);
    const fs = compile(gl, gl.FRAGMENT_SHADER, FRAG);
    program = gl.createProgram();
    gl.attachShader(program, vs);
    gl.attachShader(program, fs);
    gl.linkProgram(program);
    if (!gl.getProgramParameter(program, gl.LINK_STATUS)) {
      throw new Error('Program link failed: ' + gl.getProgramInfoLog(program));
    }
  } catch (e) {
    console.warn('[shader] init failed, falling back to Canvas2D backdrop:', e);
    return null;
  }

  // Fullscreen triangle: 3 verts covering NDC space [-1,3] x [-1,3]
  const buf = gl.createBuffer();
  gl.bindBuffer(gl.ARRAY_BUFFER, buf);
  gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([
    -1, -1,
     3, -1,
    -1,  3,
  ]), gl.STATIC_DRAW);

  const aPos = gl.getAttribLocation(program, 'aPos');

  const uniformNames = [
    'uTime', 'uResolution', 'uColorA', 'uColorB', 'uAccent',
    'uAperturePos', 'uApertureSize', 'uApertureRadius',
    'uFlashIntensity', 'uShake', 'uMode',
  ];
  const u = {};
  for (const n of uniformNames) u[n] = gl.getUniformLocation(program, n);

  function resize() {
    const dpr = Math.min(window.devicePixelRatio || 1, 2);
    const w = Math.floor(canvas.clientWidth * dpr);
    const h = Math.floor(canvas.clientHeight * dpr);
    if (canvas.width !== w || canvas.height !== h) {
      canvas.width = w;
      canvas.height = h;
    }
    gl.viewport(0, 0, canvas.width, canvas.height);
  }

  function render(uniforms) {
    resize();
    gl.useProgram(program);
    gl.bindBuffer(gl.ARRAY_BUFFER, buf);
    gl.enableVertexAttribArray(aPos);
    gl.vertexAttribPointer(aPos, 2, gl.FLOAT, false, 0, 0);

    if (u.uTime)            gl.uniform1f(u.uTime, uniforms.time);
    if (u.uResolution)      gl.uniform2f(u.uResolution, canvas.width, canvas.height);
    if (u.uColorA)          gl.uniform3fv(u.uColorA, uniforms.colorA);
    if (u.uColorB)          gl.uniform3fv(u.uColorB, uniforms.colorB);
    if (u.uAccent)          gl.uniform3fv(u.uAccent, uniforms.accent);
    if (u.uAperturePos)     gl.uniform2fv(u.uAperturePos, uniforms.aperturePos);
    if (u.uApertureSize)    gl.uniform2fv(u.uApertureSize, uniforms.apertureSize);
    if (u.uApertureRadius)  gl.uniform1f(u.uApertureRadius, uniforms.apertureRadius);
    if (u.uFlashIntensity)  gl.uniform1f(u.uFlashIntensity, uniforms.flash);
    if (u.uShake)           gl.uniform1f(u.uShake, uniforms.shake);
    if (u.uMode)            gl.uniform1i(u.uMode, uniforms.mode);

    gl.drawArrays(gl.TRIANGLES, 0, 3);
  }

  return { render };
}

export function hexToVec3(hex) {
  const v = parseInt(hex.slice(1), 16);
  return [((v >> 16) & 255) / 255, ((v >> 8) & 255) / 255, (v & 255) / 255];
}

export function mixVec3(a, b, t) {
  return [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t, a[2] + (b[2] - a[2]) * t];
}
