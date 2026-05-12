const VERT = `
attribute vec2 aPos;
void main() { gl_Position = vec4(aPos, 0.0, 1.0); }
`;

// Placeholder fragment shader — solid black. Task 8 replaces this.
const FRAG = `
precision mediump float;
void main() { gl_FragColor = vec4(0.0, 0.0, 0.0, 1.0); }
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
    'uAperturePos', 'uApertureSize', 'uFlashIntensity', 'uShake', 'uMode',
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
