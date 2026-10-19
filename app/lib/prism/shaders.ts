/* PRISM — shader set.
   Signature look: 15-bit dithered output, chromatic splits, sharp technical grid.
   All shaders are GLSL1 (three's default) and stay light for mobile GPUs. */

/* ---------------------------------- shared --------------------------------- */

export const QUAD_VERT = /* glsl */`
varying vec2 vUv;
void main() {
  vUv = uv;
  gl_Position = vec4(position.xy, 0.0, 1.0);
}
`

/* --------------------------------- background ------------------------------- */

export const BG_FRAG = /* glsl */`
precision highp float;
varying vec2 vUv;
uniform float uTime;
uniform float uScan;    // scanline sweep position (1.2 -> -0.2 during boot)
uniform vec3  uVoidA;
uniform vec3  uVoidB;
uniform vec3  uGlow;
uniform float uFlash;
uniform vec2  uRes;

float hash(vec2 p) {
  return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453123);
}

void main() {
  vec2 uv = vUv;
  vec3 col = mix(uVoidA, uVoidB, smoothstep(0.0, 1.0, uv.y) * 0.85 + 0.15);

  // horizon glow
  float d = abs(uv.y - 0.44);
  col += uGlow * exp(-d * 9.0) * 0.30;

  // boot scanline
  float band = smoothstep(0.035, 0.0, abs(uv.y - uScan));
  col += uGlow * band * 0.85;

  // fine grain (static, cheap)
  col += (hash(uv * uRes * 0.5) - 0.5) * 0.02;

  col += uFlash * vec3(0.95, 0.98, 1.0);
  gl_FragColor = vec4(col, 1.0);
}
`

/* ----------------------------------- grid ----------------------------------- */

export const GRID_VERT = /* glsl */`
varying vec3 vWorld;
void main() {
  vec4 w = modelMatrix * vec4(position, 1.0);
  vWorld = w.xyz;
  gl_Position = projectionMatrix * viewMatrix * w;
}
`

export const GRID_FRAG = /* glsl */`
precision highp float;
varying vec3 vWorld;
uniform float uTime;
uniform float uWave;     // expanding shockwave radius
uniform float uOpacity;
uniform vec3  uColor;
uniform vec3  uAccent;

void main() {
  vec2 g = vWorld.xz;
  vec2 f = abs(fract(g * 0.5 - 0.5) - 0.5) / max(fwidth(g * 0.5), 1e-5);
  float line = 1.0 - min(min(f.x, f.y), 1.0);

  float dist = length(g);
  float fade = smoothstep(42.0, 5.0, dist);

  float ring = smoothstep(2.6, 0.0, abs(dist - uWave)) * 0.9;
  float pulse = 0.5 + 0.5 * sin(uTime * 1.4 - dist * 0.35);

  vec3 col = mix(uColor, uAccent, ring);
  float a = (line * (0.16 + pulse * 0.06) + ring * line * 2.2) * fade * uOpacity;
  gl_FragColor = vec4(col, a);
}
`

/* ------------------------------ name point cloud ---------------------------- */

export const POINTS_VERT = /* glsl */`
attribute vec3  aTarget;   // resting position formed as the name
attribute float aDelay;    // per-point stagger 0..1
attribute float aSeed;
uniform float uTime;
uniform float uFormT;      // 0 = rushing in, 1 = formed
uniform float uSize;
uniform float uDrift;
uniform float uGlitch;     // 0..1 band displacement
uniform float uSwirl;      // spin applied while rushing in (0 = none)
varying float vVel;
varying float vSeed;

void main() {
  float t = clamp((uFormT - aDelay * 0.35) / 0.65, 0.0, 1.0);
  t = t * t * (3.0 - 2.0 * t);

  vec3 p = mix(position, aTarget, t);

  // swirl while rushing in
  float ang = (1.0 - t) * uSwirl;
  float ca = cos(ang), sa = sin(ang);
  p.xz = mat2(ca, -sa, sa, ca) * p.xz;

  // idle drift (live phase only)
  p.x += sin(uTime * 0.6 + aSeed * 41.0) * uDrift;
  p.y += cos(uTime * 0.5 + aSeed * 29.0) * uDrift;
  p.z += sin(uTime * 0.45 + aSeed * 17.0) * uDrift;

  // glitch bands slice through the cloud
  float band = step(0.72, fract(aSeed * 7.31 + uTime * 0.35));
  p.x += (fract(aSeed * 13.7) - 0.5) * 1.8 * band * uGlitch;

  vVel = 1.0 - t;
  vSeed = aSeed;

  vec4 mv = modelViewMatrix * vec4(p, 1.0);
  gl_PointSize = clamp((1.6 + vVel * 2.4) * uSize * (32.0 / max(-mv.z, 0.1)), 0.7, 9.0);
  gl_Position = projectionMatrix * mv;
}
`

export const POINTS_FRAG = /* glsl */`
precision highp float;
varying float vVel;
varying float vSeed;
uniform vec3 uColA;
uniform vec3 uColB;
uniform float uFlash;
uniform float uDim;   // fades the cloud into a backdrop once the entrance ends

void main() {
  vec2 c = gl_PointCoord - 0.5;
  float d = length(c);
  float a = smoothstep(0.5, 0.1, d);

  vec3 col = mix(uColA, uColB, fract(vSeed * 3.14));
  // chromatic fringe on fast-moving points
  col.r += vVel * 0.30 * step(0.0, c.x);
  col.b += vVel * 0.30 * step(c.x, 0.0);
  col += uFlash * 0.5;

  float tw = 0.55 + 0.45 * fract(vSeed * 91.7 + 0.37);
  gl_FragColor = vec4(col * uDim, a * tw);
}
`

/* ---------------------------------- motes ----------------------------------- */

export const MOTE_VERT = /* glsl */`
attribute float aSeed;
uniform float uTime;
uniform float uSize;
varying float vSeed;
void main() {
  vSeed = aSeed;
  vec3 p = position;
  p.x += sin(uTime * 0.22 + aSeed * 51.0) * 1.6;
  p.y += cos(uTime * 0.18 + aSeed * 37.0) * 1.2;
  p.z += sin(uTime * 0.2 + aSeed * 23.0) * 1.6;
  vec4 mv = modelViewMatrix * vec4(p, 1.0);
  gl_PointSize = clamp(uSize * (120.0 / max(-mv.z, 0.1)), 0.6, 4.0);
  gl_Position = projectionMatrix * mv;
}
`

export const MOTE_FRAG = /* glsl */`
precision highp float;
varying float vSeed;
uniform vec3 uColor;
void main() {
  float d = length(gl_PointCoord - 0.5);
  float a = smoothstep(0.5, 0.05, d) * (0.12 + 0.30 * fract(vSeed * 71.3));
  gl_FragColor = vec4(uColor, a);
}
`

/* --------------------------------- glyph chips ------------------------------ */

export const GLYPH_VERT = /* glsl */`
attribute vec2  aCorner;    // -1..1 quad corner
attribute vec2  aIconUv;    // atlas cell origin
attribute float aIndex;
attribute float aRadius;
attribute float aSpeed;
attribute float aPhase;
attribute float aY;
uniform float uTime;
uniform float uLand;        // 0 = flying in, 1 = settled
uniform float uHoverIdx;
uniform float uHoverStr;
uniform float uSize;        // viewport glyph scale (smaller on narrow screens)
uniform vec2  uCell;        // atlas cell size in uv units
varying vec2  vUv;
varying vec2  vLocal;       // -1..1 quad corner (for the sign frame)
varying float vGlow;
varying float vFade;

void main() {
  float ang = uTime * aSpeed + aPhase;
  vec3 base = vec3(cos(ang) * aRadius, aY + sin(uTime * 0.7 + aPhase) * 0.22, sin(ang) * aRadius - 2.2);

  vec3 start = vec3(base.x * 2.6, base.y - 2.4, -30.0);
  float li = clamp((uLand - aIndex * 0.055) / 0.55, 0.0, 1.0);
  li = 1.0 - pow(1.0 - li, 3.0);

  float hover = smoothstep(0.6, 0.0, abs(aIndex - uHoverIdx)) * uHoverStr;
  vec3 center = mix(start, base, li);

  float scale = (0.4 + hover * 0.12) * uSize;
  vec3 world = center + vec3(aCorner.x * scale, aCorner.y * scale, 0.0);

  vec4 mv = modelViewMatrix * vec4(world, 1.0);
  gl_Position = projectionMatrix * mv;

  vUv = aIconUv + (aCorner * 0.5 + 0.5) * uCell;
  vLocal = aCorner;
  vGlow = hover * 1.4 + li * 0.25;
  vFade = smoothstep(0.0, 0.35, li) * (1.0 - smoothstep(10.0, 15.0, -mv.z));
}
`

export const GLYPH_FRAG = /* glsl */`
precision highp float;
varying vec2  vUv;
varying vec2  vLocal;
varying float vGlow;
varying float vFade;
uniform sampler2D uAtlas;
uniform vec3 uColor;

void main() {
  float glyph = texture2D(uAtlas, vUv).a;

  // neon sign chip: rounded frame + faint glass, the icon glowing inside
  vec2 p = abs(vLocal) - 0.7;
  float d = length(max(p, 0.0)) + min(max(p.x, p.y), 0.0) - 0.3;

  float frame = smoothstep(0.08, 0.0, abs(d + 0.05));
  float glass = smoothstep(0.0, -0.3, d) * 0.16;
  float core = clamp(frame * 1.9 + glass + glyph * 0.9, 0.0, 1.0);

  vec3 col = uColor * (0.85 + 0.35 * core + vGlow * 0.8);
  gl_FragColor = vec4(col, core * vFade * (0.7 + vGlow * 0.55));
}
`

/* ----------------------------------- post ----------------------------------- */

export const POST_FRAG = /* glsl */`
precision highp float;
varying vec2 vUv;
uniform sampler2D uTex;
uniform float uTime;
uniform float uFlash;
uniform float uGlitch;
uniform float uVig;

float bayer2(vec2 a) {
  a = floor(a);
  return fract(a.x / 2.0 + a.y * a.y * 0.75);
}
#define bayer4(a) (bayer2(0.5 * (a)) * 0.25 + bayer2(a))

void main() {
  vec2 uv = vUv;

  // horizontal slice displacement during glitches
  float row = floor(uv.y * 23.0);
  float slice = step(0.87, fract(sin(row * 91.7 + floor(uTime * 11.0) * 4.13) * 43758.5453)) * uGlitch;
  uv.x += (bayer2(uv.yy * 191.0) - 0.5) * 0.032 * slice;

  // chromatic split
  float shift = 0.001 * (1.0 + uGlitch * 1.4);
  vec3 col;
  col.r = texture2D(uTex, uv + vec2(shift, 0.0)).r;
  col.g = texture2D(uTex, uv).g;
  col.b = texture2D(uTex, uv - vec2(shift, 0.0)).b;

  col += uFlash;

  // 15-bit quantise + bayer dither
  float b = bayer4(gl_FragCoord.xy);
  col = floor(col * 31.0 + b) / 31.0;

  // vignette
  col *= 1.0 - uVig * dot(uv - 0.5, uv - 0.5) * 1.4;

  gl_FragColor = vec4(col, 1.0);
}
`

/* ------------------------------ holo billboards ----------------------------- */

export const PANEL_VERT = /* glsl */`
attribute vec2  aUvMin;    // atlas cell bounds (prevents entry-tear bleed)
attribute vec2  aUvMax;
attribute float aSeed;
attribute float aDelay;    // stagger 0..1 across the panel cluster
attribute float aFade;     // distance dimming baked at build time
attribute float aPid;      // panel index (hover highlight)
attribute float aStation;  // which journey station this board belongs to
uniform float uTime;
uniform float uForm;       // entrance progress (0 boot, 1 formed)
varying vec2  vUv;
varying vec2  vMin;
varying vec2  vMax;
varying float vSeed;
varying float vIn;
varying float vFade;
varying float vPid;
varying float vStation;

void main() {
  float t = clamp((uForm - aDelay) / 0.28, 0.0, 1.0);
  t = 1.0 - pow(1.0 - t, 3.0);
  vIn = t;

  vec3 p = position;
  float h = fract(aSeed * 91.7);
  p.y += (1.0 - t) * (0.35 + h * 0.55);
  p.x += (1.0 - t) * (fract(aSeed * 57.1) - 0.5) * 0.55;

  vUv = uv;
  vMin = aUvMin;
  vMax = aUvMax;
  vSeed = aSeed;
  vFade = aFade;
  vPid = aPid;
  vStation = aStation;
  gl_Position = projectionMatrix * modelViewMatrix * vec4(p, 1.0);
}
`

export const PANEL_FRAG = /* glsl */`
precision highp float;
varying vec2  vUv;
varying vec2  vMin;
varying vec2  vMax;
varying float vSeed;
varying float vIn;
varying float vFade;
varying float vPid;
varying float vStation;
uniform sampler2D uTex;
uniform float uTime;
uniform vec3  uTint;
uniform float uHoverId;
uniform float uFocus;      // damped float station index (the journey position)

void main() {
  // tearing glitch while the panel is still syncing in
  float tear = smoothstep(0.0, 0.2, vIn) * (1.0 - smoothstep(0.2, 0.5, vIn));
  vec2 uv = vUv;
  uv.x += tear * 0.035 * step(0.55, fract(vUv.y * 60.0 + uTime * 9.0));
  uv.y += tear * 0.02 * step(0.60, fract(vUv.x * 40.0 - uTime * 7.0));
  uv = clamp(uv, vMin, vMax);

  vec4 tex = texture2D(uTex, uv);
  float flick = 0.88 + 0.12 * sin(uTime * (1.3 + vSeed * 2.1) + vSeed * 57.0);
  float dead = step(0.994, fract(sin(floor(uTime * 6.0) + vSeed * 97.3) * 43758.5453));
  vec3 col = tex.rgb * uTint * (flick * (1.0 - dead * 0.45)) * vFade;

  // only the station you are standing at reads at full power — the rest of
  // the street glows but steps aside
  float focus = 1.0 - clamp(abs(vStation - uFocus), 0.0, 1.0);
  col *= mix(0.22, 1.0, focus * focus);

  // hovered board blazes a little brighter
  float hov = 1.0 - step(0.5, abs(vPid - uHoverId));
  col *= 1.0 + hov * 0.9 * focus;

  gl_FragColor = vec4(col * vIn, tex.a * vIn);
}
`

/* -------------------------------- neon skyline ------------------------------ */

export const TOWER_VERT = /* glsl */`
attribute float aSeed;
attribute float aNeon;     // 0 = primary strip, 1 = accent strip
attribute vec2  aSeg;      // window grid density
varying vec2  vUv;
varying float vSeed;
varying float vNeon;
varying vec2  vSeg;
varying float vDist;
void main() {
  vUv = uv;
  vSeed = aSeed;
  vNeon = aNeon;
  vSeg = aSeg;
  vec4 w = modelMatrix * vec4(position, 1.0);
  vDist = -w.z;
  gl_Position = projectionMatrix * viewMatrix * w;
}
`

export const TOWER_FRAG = /* glsl */`
precision highp float;
varying vec2  vUv;
varying float vSeed;
varying float vNeon;
varying vec2  vSeg;
varying float vDist;
uniform float uTime;
uniform float uLit;        // city power level (entrance)
uniform vec3  uColA;
uniform vec3  uColB;
uniform vec3  uVoid;
uniform vec3  uFog;

float hash(vec2 p) {
  return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453123);
}

void main() {
  vec2 cell = floor(vUv * vSeg + vSeed * 3.7);
  float rowGap = step(0.38, fract(vUv.x * vSeg.x));
  float colGap = step(0.40, fract(vUv.y * vSeg.y));
  float lit = step(0.52, hash(cell)) * rowGap * colGap;
  float tw = 0.7 + 0.3 * sin(uTime * 1.1 + hash(cell) * 40.0);
  vec3 win = mix(uColA * 0.55, uColB * 0.7, step(0.88, hash(cell * 1.71 + 5.0)));

  vec3 col = uVoid;
  col += win * lit * tw * 0.72 * uLit;
  float top = smoothstep(0.97, 1.0, vUv.y);
  col += mix(uColA, uColB, vNeon) * top * 0.7 * uLit;

  float fog = smoothstep(22.0, 60.0, vDist);
  col = mix(col, uFog, fog);
  gl_FragColor = vec4(col, 1.0);
}
`

/* ------------------------------ floating orbs ------------------------------- */

export const ORB_VERT = /* glsl */`
attribute float aSize;
attribute float aSeed;
uniform float uTime;
uniform float uScale;
varying float vSeed;
void main() {
  vSeed = aSeed;
  vec3 p = position;
  p.y += sin(uTime * 0.31 + aSeed * 43.0) * 0.5;
  p.x += cos(uTime * 0.22 + aSeed * 29.0) * 0.4;
  vec4 mv = modelViewMatrix * vec4(p, 1.0);
  gl_PointSize = clamp(aSize * uScale * (140.0 / max(-mv.z, 0.5)), 1.2, 46.0);
  gl_Position = projectionMatrix * mv;
}
`

export const ORB_FRAG = /* glsl */`
precision highp float;
varying float vSeed;
uniform vec3  uColA;
uniform vec3  uColB;
uniform float uBright;
uniform float uTime;
void main() {
  vec2 c = gl_PointCoord - 0.5;
  float d = length(c);
  float core = smoothstep(0.5, 0.06, d);
  float ring = smoothstep(0.5, 0.44, d) * (1.0 - smoothstep(0.44, 0.34, d));
  vec3 col = mix(uColA, uColB, step(0.6, fract(vSeed * 7.77)));
  float pulse = 0.75 + 0.25 * sin(uTime * 1.6 + vSeed * 51.0);
  gl_FragColor = vec4(col * uBright * pulse, (core * 0.35 + ring * 0.5) * uBright);
}
`

/* ------------------------------- solid props -------------------------------- */

export const SOLID_VERT = /* glsl */`
varying vec3 vN;
varying vec3 vV;
void main() {
  vec4 mv = modelViewMatrix * vec4(position, 1.0);
  vN = normalize(normalMatrix * normal);
  vV = -mv.xyz;
  gl_Position = projectionMatrix * mv;
}
`

export const SOLID_FRAG = /* glsl */`
precision highp float;
varying vec3 vN;
varying vec3 vV;
uniform vec3  uBase;
uniform vec3  uRim;
uniform float uTime;
void main() {
  vec3 n = normalize(vN);
  vec3 v = normalize(vV);
  float nl = clamp(dot(n, normalize(vec3(0.35, 0.75, 0.55))), 0.0, 1.0);
  float q = floor(nl * 3.0) / 3.0;
  float rim = pow(1.0 - clamp(dot(n, v), 0.0, 1.0), 2.0);
  float scan = 0.94 + 0.06 * sin(vN.y * 40.0 + uTime * 4.0);
  vec3 col = uBase * (0.25 + q * 0.75) + uRim * rim * 0.9;
  gl_FragColor = vec4(col * scan, 1.0);
}
`
