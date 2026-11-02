// Foil — renders your card with a real-time holographic foil, tilting with your mouse, finger or phone.
// Exposes window.Foil once ready.

import * as THREE from 'three';

const reduceMotion = matchMedia('(prefers-reduced-motion: reduce)').matches;

/* ---------------- the foil, as a shader ---------------- */
const vertex = `varying vec2 vUv; void main(){ vUv = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }`;
const fragment = `
precision highp float;
varying vec2 vUv;
uniform sampler2D uArt;
uniform float uAspect, uRadius, uBorder, uStyle, uMask, uIntensity, uBorderFoil, uTime;
uniform vec3 uBorderColor;
uniform vec2 uTilt;

vec3 hsv(float h, float s, float v) { vec3 k = clamp(abs(mod(h * 6.0 + vec3(0.0, 4.0, 2.0), 6.0) - 3.0) - 1.0, 0.0, 1.0); return v * mix(vec3(1.0), k, s); }
float hash(vec2 p) { return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453); }
vec2 hash2(vec2 p) { return vec2(hash(p), hash(p + 19.19)); }
float noise(vec2 p) { vec2 i = floor(p), f = fract(p); f = f * f * (3.0 - 2.0 * f);
  return mix(mix(hash(i), hash(i + vec2(1.0, 0.0)), f.x), mix(hash(i + vec2(0.0, 1.0)), hash(i + vec2(1.0, 1.0)), f.x), f.y); }
float roundRect(vec2 p, vec2 b, float r) { vec2 q = abs(p) - b + r; return length(max(q, 0.0)) + min(max(q.x, q.y), 0.0) - r; }

void main() {
  vec2 p = (vUv - 0.5) * vec2(uAspect, 1.0);
  float edge = roundRect(p, vec2(uAspect * 0.5, 0.5), uRadius);
  float alpha = 1.0 - smoothstep(-0.0015, 0.0015, edge);
  if (alpha <= 0.0) discard;
  vec2 innerHalf = vec2(uAspect * 0.5 - uBorder, 0.5 - uBorder);
  float inner = roundRect(p, innerHalf, max(uRadius - uBorder, 0.004));
  float isBorder = uBorder > 0.0005 ? smoothstep(-0.0012, 0.0012, inner) : 0.0;
  vec2 artUv = (p + innerHalf) / (2.0 * innerHalf);
  vec3 art = texture2D(uArt, clamp(artUv, 0.0, 1.0)).rgb;
  vec3 base = mix(art, uBorderColor, isBorder);
  float L = dot(base, vec3(0.299, 0.587, 0.114));

  vec2 t = uTilt;
  vec2 q = vUv * vec2(uAspect, 1.0);
  vec3 foil;
  if (uStyle < 0.5) {                       // rainbow holo
    float h = fract(dot(vUv, vec2(0.8, 1.1)) * 1.25 + t.x * 0.55 + t.y * 0.4);
    float bands = 0.55 + 0.45 * sin((dot(vUv, vec2(1.0, 1.4)) + t.x * 0.5 - t.y * 0.3) * 26.0);
    foil = hsv(h, 0.6, 1.0) * bands;
  } else if (uStyle < 1.5) {                // glitter: tiny flakes that each catch the light at their own angle
    vec2 g = q * 150.0; vec2 id = floor(g); vec2 f = fract(g) - 0.5;
    vec2 n = (hash2(id) - 0.5) * 2.4;
    float facing = pow(max(0.0, 1.0 - length(n - t * 1.3) * 0.85), 3.0);
    float flake = smoothstep(0.55, 0.15, length(f));
    foil = hsv(fract(hash(id + 3.1) + t.x * 0.4 + t.y * 0.3), 0.45, 1.0) * facing * flake * 3.2
         + hsv(fract(vUv.y + t.x * 0.5), 0.4, 1.0) * 0.12;
  } else if (uStyle < 2.5) {                // galaxy
    float n1 = noise(q * 5.0 + t * 1.6), n2 = noise(q * 13.0 - t * 2.4);
    float h = fract(n1 * 1.4 + t.x * 0.4 + vUv.y * 0.3);
    vec2 g = q * 80.0; vec2 id = floor(g);
    float star = step(0.982, hash(id)) * pow(max(0.0, 1.0 - length(hash2(id) - 0.5 - t * 0.45) * 2.0), 3.0);
    foil = hsv(h, 0.55, 1.0) * (0.3 + 0.7 * n2) + vec3(star * 2.2);
  } else if (uStyle < 3.5) {                // prism stripes
    float x = vUv.x * 7.0 + t.x * 2.4 + vUv.y * 1.4;
    float bar = 0.5 + 0.5 * cos(fract(x) * 6.2832);
    foil = hsv(fract(floor(x) / 7.0 + t.y * 0.3 + vUv.y * 0.2), 0.65, 1.0) * (0.3 + 0.7 * bar);
  } else if (uStyle < 4.5 || (uStyle > 8.5 && uStyle < 9.5)) {   // gold / silver foil
    float a = dot(vUv - 0.5, normalize(vec2(0.7, 1.0))) * 2.2 + t.x * 0.9 - t.y * 0.6;
    float sh = 0.5 + 0.5 * sin(a * 5.0);
    vec3 lo = uStyle < 4.5 ? vec3(0.55, 0.38, 0.12) : vec3(0.42, 0.45, 0.5);
    vec3 hi = uStyle < 4.5 ? vec3(1.0, 0.9, 0.62) : vec3(1.0, 1.0, 1.0);
    foil = mix(lo, hi, sh) * (0.75 + 0.25 * noise(q * 260.0));
  } else if (uStyle < 5.5) {                // cracked ice: shattered facets
    vec2 g = q * 11.0; vec2 cell = floor(g); vec2 f = fract(g);
    float d1 = 9.0, d2 = 9.0; vec2 best = vec2(0.0);
    for (int y = -1; y <= 1; y++) for (int x = -1; x <= 1; x++) {
      vec2 o = vec2(float(x), float(y)); vec2 pt = o + hash2(cell + o); float d = length(pt - f);
      if (d < d1) { d2 = d1; d1 = d; best = cell + o; } else if (d < d2) { d2 = d; }
    }
    vec2 n = (hash2(best + 7.7) - 0.5) * 2.2;
    float facing = pow(max(0.0, 1.0 - length(n - t * 1.2) * 0.7), 2.0);
    float crack = 1.0 - smoothstep(0.0, 0.06, d2 - d1);
    foil = hsv(fract(hash(best) * 0.6 + t.x * 0.5 + t.y * 0.3), 0.5, 1.0) * (0.25 + 1.1 * facing) + vec3(crack * 0.6);
  } else if (uStyle < 6.5) {                // stars: four-point sparkles
    vec2 g = q * 18.0; vec2 id = floor(g); vec2 f = fract(g) - 0.5 - (hash2(id) - 0.5) * 0.5;
    float sz = 0.25 + 0.35 * hash(id + 2.0);
    float star = max(0.0, 1.0 - (abs(f.x * f.y) * 90.0 + length(f) * 2.6 / sz));
    float facing = pow(max(0.0, 1.0 - length((hash2(id + 5.0) - 0.5) * 2.4 - t * 1.3) * 0.8), 2.0);
    foil = hsv(fract(hash(id) + t.x * 0.3), 0.35, 1.0) * star * facing * 4.0 + hsv(fract(vUv.x + vUv.y + t.x * 0.4), 0.45, 1.0) * 0.18;
  } else if (uStyle < 7.5) {                // sunburst rays from the centre
    vec2 c = p - t * vec2(0.08, -0.08);
    float ang = atan(c.y, c.x), r = length(c);
    float rays = 0.5 + 0.5 * cos(ang * 22.0 + t.x * 3.0 - t.y * 2.0);
    foil = hsv(fract(ang / 6.2832 + r * 0.7 + t.x * 0.45 + t.y * 0.3), 0.6, 1.0) * (0.25 + 0.75 * rays);
  } else if (uStyle < 8.5) {                // ripple: rings that move with the light
    float r = length(p - t * vec2(0.18, -0.18));
    float bands = 0.5 + 0.5 * sin(r * 110.0 - t.x * 5.0 + t.y * 4.0);
    foil = hsv(fract(r * 2.0 + t.x * 0.4 + t.y * 0.25), 0.5, 1.0) * (0.35 + 0.45 * bands);
  } else if (uStyle < 10.5) {               // hearts
    vec2 g = q * 19.0; vec2 id = floor(g); vec2 f = (fract(g) - vec2(0.5, 0.32) - (hash2(id + 9.0) - 0.5) * 0.25) * 2.3;
    f.x = abs(f.x);
    float hd = (f.y + f.x > 1.0) ? length(f - vec2(0.25, 0.75)) - 0.3536
             : sqrt(min(dot(f - vec2(0.0, 1.0), f - vec2(0.0, 1.0)), dot(f - 0.5 * max(f.x + f.y, 0.0), f - 0.5 * max(f.x + f.y, 0.0)))) * sign(f.x - f.y);
    float heart = (1.0 - smoothstep(-0.02, 0.03, hd)) * step(0.45, hash(id + 4.0));
    float facing = pow(max(0.0, 1.0 - length((hash2(id) - 0.5) * 2.2 - t * 1.2) * 0.75), 2.0);
    foil = hsv(fract(hash(id) * 0.3 + 0.88 + t.x * 0.3 + t.y * 0.2), 0.45, 1.0) * heart * (0.35 + 1.4 * facing) + hsv(fract(vUv.y + t.x * 0.4), 0.3, 1.0) * 0.1;
  } else if (uStyle < 11.5) {               // pearl: soft pastel shimmer
    float n1 = noise(q * 3.0 + t * 0.8), n2 = noise(q * 9.0 - t);
    foil = hsv(fract(n1 * 0.8 + vUv.y * 0.4 + t.x * 0.35 + t.y * 0.2), 0.28, 1.0) * (0.55 + 0.45 * n2);
  } else {                                  // laser grid, like photocard sleeves
    vec2 g = q * 64.0; vec2 f = abs(fract(g) - 0.5);
    float line = smoothstep(0.36, 0.5, max(f.x, f.y));
    float parity = mod(floor(g.x) + floor(g.y), 2.0);
    float sweep = 0.5 + 0.5 * sin((vUv.x + vUv.y) * 9.0 + t.x * 4.0 - t.y * 3.0);
    foil = hsv(fract(vUv.x * 0.5 + vUv.y * 0.8 + parity * 0.08 + t.x * 0.5 + t.y * 0.35), 0.55, 1.0) * (0.15 + 0.6 * line + 0.35 * sweep);
  }

  float m = 1.0;                            // where the foil goes
  if (uMask > 0.5 && uMask < 1.5) m = smoothstep(0.45, 0.85, L);
  else if (uMask > 1.5 && uMask < 2.5) m = 1.0 - smoothstep(0.15, 0.5, L);
  else if (uMask > 2.5) m = isBorder;
  if (uBorderFoil > 0.5) m = max(m, isBorder);
  float k = uIntensity * m;
  // keep the art, tint it with the foil light (bright areas get less, so they don't wash out)
  bool metal = (uStyle > 3.5 && uStyle < 4.5) || (uStyle > 8.5 && uStyle < 9.5);
  vec3 col = metal
    ? mix(base, base * foil * 1.5 + foil * 0.12, k)
    : base * (1.0 - 0.3 * k) + foil * k * 0.55 * (1.0 - 0.55 * L) + base * foil * k * 0.35;

  vec2 gp = (vUv - (0.5 + t * vec2(-0.5, 0.5))) * vec2(uAspect, 1.0);   // glare follows the light
  col += exp(-dot(gp, gp) * 10.0) * 0.13;
  col += smoothstep(-0.012, 0.0, edge) * 0.25;                         // a thin bright cut edge
  gl_FragColor = vec4(col, alpha);
}`;

/* ---------------- a soft shadow under the card ---------------- */
function shadowTexture() {
  const c = document.createElement('canvas'); c.width = c.height = 128;
  const g = c.getContext('2d'), grad = g.createRadialGradient(64, 64, 8, 64, 64, 64);
  grad.addColorStop(0, 'rgba(0,0,0,0.55)'); grad.addColorStop(1, 'rgba(0,0,0,0)');
  g.fillStyle = grad; g.fillRect(0, 0, 128, 128);
  return new THREE.CanvasTexture(c);
}

export function createFoil(canvas) {
  const renderer = new THREE.WebGLRenderer({ canvas, antialias: true, alpha: true, preserveDrawingBuffer: false });
  renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
  renderer.setClearColor(0x000000, 0);

  const scene = new THREE.Scene();
  const camera = new THREE.PerspectiveCamera(28, 1, 0.1, 50);
  camera.position.set(0, 0, 3.2);

  const artTex = new THREE.CanvasTexture(document.createElement('canvas'));
  artTex.colorSpace = THREE.NoColorSpace;
  artTex.anisotropy = 8;
  const uniforms = {
    uArt: { value: artTex }, uAspect: { value: 55 / 85 }, uRadius: { value: 0.04 }, uBorder: { value: 0.03 },
    uStyle: { value: 0 }, uMask: { value: 0 }, uIntensity: { value: 0.75 }, uBorderFoil: { value: 0 }, uTime: { value: 0 },
    uBorderColor: { value: new THREE.Color(1, 1, 1) }, uTilt: { value: new THREE.Vector2() },
  };
  const card = new THREE.Mesh(new THREE.PlaneGeometry(1, 1), new THREE.ShaderMaterial({ vertexShader: vertex, fragmentShader: fragment, uniforms, transparent: true }));
  const shadow = new THREE.Mesh(new THREE.PlaneGeometry(1, 1), new THREE.MeshBasicMaterial({ map: shadowTexture(), transparent: true, depthWrite: false }));
  shadow.position.z = -0.25;
  scene.add(shadow, card);

  function setAspect(a) {
    uniforms.uAspect.value = a;
    card.scale.set(a, 1, 1);
    shadow.scale.set(a * 1.25, 1.2, 1);
    fit(camera, canvas.clientWidth / Math.max(1, canvas.clientHeight));
  }
  /** Keep the whole card in view, whatever the shape of the screen. */
  function fit(cam, viewAspect, margin = 1.32) {
    const a = uniforms.uAspect.value, v = THREE.MathUtils.degToRad(cam.fov);
    const needH = Math.max(1, a / viewAspect) * margin;
    cam.aspect = viewAspect;
    cam.position.z = needH / 2 / Math.tan(v / 2);
    cam.updateProjectionMatrix();
  }

  /* ---------- tilting ---------- */
  const tilt = new THREE.Vector2(), target = new THREE.Vector2();
  let mode = 'idle', scripted = null, lastInput = 0;
  const clamp = (x) => Math.max(-1, Math.min(1, x));
  function pointerTilt(e) {
    const r = canvas.getBoundingClientRect();
    target.set(clamp(((e.clientX - r.left) / r.width) * 2 - 1), clamp(((e.clientY - r.top) / r.height) * 2 - 1));
    mode = 'pointer'; lastInput = performance.now();
  }
  canvas.addEventListener('pointermove', pointerTilt);
  canvas.addEventListener('pointerdown', (e) => { pointerTilt(e); canvas.setPointerCapture(e.pointerId); });
  canvas.addEventListener('pointerleave', () => { if (mode === 'pointer') mode = 'idle'; });

  let base = null;
  function onOrientation(e) {
    if (e.gamma == null) return;
    if (!base) base = { beta: e.beta };
    target.set(clamp(e.gamma / 28), clamp((e.beta - base.beta) / 24));
    mode = 'motion'; lastInput = performance.now();
  }
  async function useMotion() {
    try {
      if (typeof DeviceOrientationEvent !== 'undefined' && typeof DeviceOrientationEvent.requestPermission === 'function') {
        if ((await DeviceOrientationEvent.requestPermission()) !== 'granted') return false;
      }
      base = null;
      window.addEventListener('deviceorientation', onOrientation);
      return true;
    } catch (e) { return false; }
  }

  /** A gentle figure-eight sway: used while idle and for videos. */
  const sway = (s) => new THREE.Vector2(Math.sin(s * Math.PI * 2) * 0.85, Math.sin(s * Math.PI * 4) * 0.45);

  function step(now) {
    if (scripted) target.copy(sway((now - scripted.start) / scripted.ms));
    else if (mode === 'idle' || (mode === 'pointer' && now - lastInput > 2500)) {
      mode = 'idle'; target.copy(reduceMotion ? new THREE.Vector2(0.25, -0.15) : sway(now / 7000).multiplyScalar(0.6));
    }
    tilt.lerp(target, scripted ? 1 : 0.12);
    uniforms.uTilt.value.copy(tilt);
    uniforms.uTime.value = now / 1000;
    card.rotation.set(tilt.y * 0.32, tilt.x * 0.42, 0);
    shadow.position.set(tilt.x * 0.06, -0.04 - tilt.y * 0.05, -0.25);
  }

  function resize() {
    const w = canvas.clientWidth, h = canvas.clientHeight;
    if (!w || !h) return;
    renderer.setSize(w, h, false);
    fit(camera, w / h);
  }
  new ResizeObserver(resize).observe(canvas);
  resize();

  let running = true;
  document.addEventListener('visibilitychange', () => { running = !document.hidden; if (running) requestAnimationFrame(loop); });
  function loop(now) {
    if (!running) return;
    step(now);
    renderer.render(scene, camera);
    requestAnimationFrame(loop);
  }
  requestAnimationFrame(loop);

  /* ---------- saving ---------- */
  let exporter = null;
  function exportRenderer(w, h) {
    if (!exporter) {
      const c = document.createElement('canvas');
      exporter = { canvas: c, renderer: new THREE.WebGLRenderer({ canvas: c, antialias: true, alpha: true, preserveDrawingBuffer: true }), camera: camera.clone() };
    }
    exporter.renderer.setPixelRatio(1);
    exporter.renderer.setSize(w, h, false);
    return exporter;
  }

  /** A transparent PNG of the card at its current angle. */
  function savePNG() {
    const a = uniforms.uAspect.value, H = 1600, W = Math.round(H * a * 1.12), HH = Math.round(H * 1.12);
    const ex = exportRenderer(W, HH);
    ex.renderer.setClearColor(0x000000, 0);
    shadow.visible = false;
    const keep = card.rotation.clone();
    card.rotation.set(tilt.y * 0.12, tilt.x * 0.16, 0);     // nearly flat, so the art isn't distorted
    fit(ex.camera, W / HH, 1.08);
    ex.renderer.render(scene, ex.camera);
    card.rotation.copy(keep); shadow.visible = true;
    return new Promise((done) => ex.canvas.toBlob(done, 'image/png'));
  }

  /** A 4-second vertical video (for Shorts / Reels) of the card tilting. */
  function saveVideo(bg, seconds = 4) {
    const W = 720, H = 1280;
    const ex = exportRenderer(W, H);
    const types = ['video/mp4;codecs=avc1', 'video/mp4', 'video/webm;codecs=vp9', 'video/webm'];
    const type = types.find((t) => window.MediaRecorder && MediaRecorder.isTypeSupported(t));
    if (!type || !ex.canvas.captureStream) return Promise.reject(new Error('unsupported'));
    ex.renderer.setClearColor(new THREE.Color(bg), 1);
    fit(ex.camera, W / H, 1.45);
    const stream = ex.canvas.captureStream(30);
    const rec = new MediaRecorder(stream, { mimeType: type, videoBitsPerSecond: 6_000_000 });
    const chunks = [];
    rec.ondataavailable = (e) => e.data.size && chunks.push(e.data);
    return new Promise((done) => {
      rec.onstop = () => { scripted = null; done({ blob: new Blob(chunks, { type: type.split(';')[0] }), ext: type.includes('mp4') ? 'mp4' : 'webm' }); };
      scripted = { start: performance.now(), ms: seconds * 1000 };
      rec.start();
      const tick = (now) => {
        step(now);
        ex.renderer.render(scene, ex.camera);
        if (now - scripted.start < seconds * 1000) requestAnimationFrame(tick);
        else rec.stop();
      };
      requestAnimationFrame(tick);
    });
  }

  return {
    /** art: a canvas already cut to the card's inner shape */
    setArt(c) { artTex.image = c; artTex.needsUpdate = true; },
    set(o) {
      if ('aspect' in o) setAspect(o.aspect);
      if ('style' in o) uniforms.uStyle.value = o.style;
      if ('mask' in o) uniforms.uMask.value = o.mask;
      if ('intensity' in o) uniforms.uIntensity.value = o.intensity;
      if ('border' in o) uniforms.uBorder.value = o.border;
      if ('radius' in o) uniforms.uRadius.value = o.radius;
      if ('borderColor' in o) uniforms.uBorderColor.value.set(o.borderColor);
      if ('borderFoil' in o) uniforms.uBorderFoil.value = o.borderFoil ? 1 : 0;
    },
    useMotion, savePNG, saveVideo,
  };
}

try {
  const canvas = document.getElementById('stage');
  const test = document.createElement('canvas');
  if (canvas && (test.getContext('webgl2') || test.getContext('webgl'))) {
    window.Foil = createFoil(canvas);
    window.dispatchEvent(new Event('foil-ready'));
  } else {
    window.dispatchEvent(new Event('foil-unsupported'));
  }
} catch (e) {
  console.warn(e);
  window.dispatchEvent(new Event('foil-unsupported'));
}
