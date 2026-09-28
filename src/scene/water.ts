// Living water in two layers. The surface is a physical transmission material: it refracts the
// pebble bed below, reflects the HDRI sky through the environment, and carries a tileable
// ripple normal map scrolling with the flow. Over it, a thin shader layer adds only a pale foam
// line where water meets stone and turf, and rain rings while rain falls on it.

import * as THREE from "three";

const VERT = /* glsl */ `
#include <fog_pars_vertex>
varying vec2 vUv;
varying vec3 vWorld;
void main() {
  vUv = uv;
  vec4 world = modelMatrix * vec4(position, 1.0);
  vWorld = world.xyz;
  vec4 mvPosition = viewMatrix * world;
  gl_Position = projectionMatrix * mvPosition;
  #include <fog_vertex>
}`;

const FRAG = /* glsl */ `
#include <fog_pars_fragment>
uniform float time;
uniform float disc;
uniform float flow;
uniform float rain;
uniform vec3 deep;
uniform vec3 shallow;
uniform vec3 foam;
uniform vec3 sky;
varying vec2 vUv;
varying vec3 vWorld;
float hash(vec2 p) { return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453); }
float noise(vec2 p) {
  vec2 i = floor(p);
  vec2 f = fract(p);
  vec2 u = f * f * (3.0 - 2.0 * f);
  return mix(mix(hash(i), hash(i + vec2(1.0, 0.0)), u.x),
             mix(hash(i + vec2(0.0, 1.0)), hash(i + vec2(1.0, 1.0)), u.x), u.y);
}
float fbm(vec2 p) {
  float v = 0.0;
  float a = 0.5;
  for (int i = 0; i < 4; i++) { v += a * noise(p); p = p * 2.1 + 3.7; a *= 0.5; }
  return v;
}
void main() {
  vec2 p = vWorld.xz * 2.2;
  vec2 f = vec2(0.0, -time * 0.35 * flow);
  float h0 = fbm(p + f + time * 0.05);
  float hx = fbm(p + vec2(0.08, 0.0) + f + time * 0.05);
  float hz = fbm(p + vec2(0.0, 0.08) + f + time * 0.05);
  vec2 slope = vec2(hx - h0, hz - h0) * 6.0;
  // Rain rings: expanding circles in a jittered grid.
  vec2 cell = floor(vWorld.xz * 3.0);
  vec2 local = fract(vWorld.xz * 3.0) - 0.5;
  float phase = fract(time * 0.8 + hash(cell));
  float ring = smoothstep(0.03, 0.0, abs(length(local) - phase * 0.45)) * (1.0 - phase);
  slope += local * ring * rain * 3.0;
  vec3 n = normalize(vec3(-slope.x, 1.0, -slope.y));
  vec3 v = normalize(cameraPosition - vWorld);
  vec3 l = normalize(vec3(0.5, 0.35, -0.8));
  float fres = pow(1.0 - max(dot(n, v), 0.0), 3.0);
  float spec = pow(max(dot(reflect(-l, n), v), 0.0), 80.0);
  vec2 c = vUv * 2.0 - 1.0;
  float edge = disc > 0.5 ? 1.0 - length(c) : 1.0 - abs(c.x);
  float churn = noise(p * 2.5 + f * 2.0 + time * 0.3);
  float froth = smoothstep(0.2, 0.0, edge - churn * 0.12);
  // Foam and rain rings only: the surface below does reflection and refraction.
  vec3 col = mix(foam, sky, 0.2) * (0.8 + h0 * 0.3) + spec * vec3(1.0, 0.92, 0.78) * 0.4;
  float alpha = froth * 0.8 + ring * rain * 0.35 + fres * 0.04;
  alpha *= smoothstep(0.0, 0.03, edge + 0.01);
  gl_FragColor = vec4(col, alpha);
  #include <fog_fragment>
}`;

export interface Water {
  readonly mesh: THREE.Group;
  /** The foam overlay, which the AO pass should skip. */
  readonly overlay: THREE.Object3D;
  update(time: number, rain: number): void;
}

let ripples: THREE.DataTexture | null = null;
const surfaces: THREE.MeshPhysicalMaterial[] = [];

/**
 * The adaptive step's cheap water: no transmission pass, a tinted, slightly see-through surface
 * that still reflects the sky.
 */
export function cheapWater(): void {
  for (const m of surfaces) {
    m.transmission = 0;
    m.transparent = true;
    m.opacity = 0.82;
    m.color.set("#3f6a66");
    m.needsUpdate = true;
  }
}

/** A tileable ripple normal map: sums of waves whose frequencies are whole numbers per tile. */
function rippleNormals(): THREE.DataTexture {
  if (ripples) return ripples;
  const n = 256;
  const data = new Uint8Array(n * n * 4);
  const waves = Array.from({ length: 14 }, (_, i) => {
    const a = i * 2.39996;
    const k = 2 + (i % 7) * 1.5;
    return {
      kx: Math.round(Math.cos(a) * k),
      ky: Math.round(Math.sin(a) * k),
      amp: 1 / (1 + i * 0.35),
      ph: i * 1.7,
    };
  });
  for (let y = 0; y < n; y++)
    for (let x = 0; x < n; x++) {
      let dx = 0;
      let dy = 0;
      for (const w of waves) {
        const t = ((w.kx * x + w.ky * y) / n) * Math.PI * 2 + w.ph;
        const c = Math.cos(t) * w.amp;
        dx += c * w.kx;
        dy += c * w.ky;
      }
      const v = new THREE.Vector3(-dx * 0.02, -dy * 0.02, 1).normalize();
      const i = (y * n + x) * 4;
      data[i] = (v.x * 0.5 + 0.5) * 255;
      data[i + 1] = (v.y * 0.5 + 0.5) * 255;
      data[i + 2] = (v.z * 0.5 + 0.5) * 255;
      data[i + 3] = 255;
    }
  ripples = new THREE.DataTexture(data, n, n, THREE.RGBAFormat);
  ripples.wrapS = ripples.wrapT = THREE.RepeatWrapping;
  ripples.magFilter = THREE.LinearFilter;
  ripples.minFilter = THREE.LinearMipmapLinearFilter;
  ripples.generateMipmaps = true;
  ripples.colorSpace = THREE.NoColorSpace;
  ripples.needsUpdate = true;
  return ripples;
}

/**
 * A ribbon of water following a winding channel along z, built in the XY plane (water() lays
 * it flat): `centre(z)` is the channel's x, `half(z)` its half-width. uv.x runs across.
 */
export function channelRibbon(
  z0: number,
  z1: number,
  centre: (z: number) => number,
  half: (z: number) => number,
  steps = 48,
): THREE.BufferGeometry {
  const pos: number[] = [];
  const uv: number[] = [];
  const index: number[] = [];
  for (let i = 0; i <= steps; i++) {
    const z = z0 + ((z1 - z0) * i) / steps;
    const c = centre(z);
    const h = half(z);
    pos.push(c - h, -z, 0, c + h, -z, 0);
    uv.push(0, i / steps, 1, i / steps);
    if (i < steps) {
      const a = i * 2;
      index.push(a, a + 1, a + 2, a + 1, a + 3, a + 2);
    }
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute("position", new THREE.Float32BufferAttribute(pos, 3));
  g.setAttribute("uv", new THREE.Float32BufferAttribute(uv, 2));
  g.setIndex(index);
  g.computeVertexNormals();
  return g;
}

/**
 * A strip of flowing beck (`disc` false) or a still round tarn or puddle (`disc` true).
 * `shape` replaces the default plane or disc (for example a channelRibbon).
 */
export function water(
  width: number,
  depth: number,
  disc: boolean,
  flow = 1,
  shape?: THREE.BufferGeometry,
): Water {
  const mat = new THREE.ShaderMaterial({
    vertexShader: VERT,
    fragmentShader: FRAG,
    transparent: true,
    fog: true,
    uniforms: THREE.UniformsUtils.merge([
      THREE.UniformsLib.fog,
      {
        time: { value: 0 },
        disc: { value: disc ? 1 : 0 },
        flow: { value: flow },
        rain: { value: 0 },
        deep: { value: new THREE.Color("#1f4450") },
        shallow: { value: new THREE.Color("#4f8a8e") },
        foam: { value: new THREE.Color("#e6efe8") },
        sky: { value: new THREE.Color("#c9d6d6") },
      },
    ]),
  });
  const overlay = new THREE.Mesh(shape ?? new THREE.PlaneGeometry(width, depth), mat);
  overlay.rotation.x = -Math.PI / 2;
  overlay.position.y = 0.004;
  overlay.renderOrder = 2;
  const normals = rippleNormals().clone();
  normals.repeat.set(width * 1.2, depth * 1.2);
  normals.needsUpdate = true;
  const surfaceGeo = shape
    ? shape
    : disc
      ? new THREE.CircleGeometry(Math.min(width, depth) / 2, 48)
      : new THREE.PlaneGeometry(width, depth);
  const surface = new THREE.Mesh(
    surfaceGeo,
    new THREE.MeshPhysicalMaterial({
      color: "#ffffff",
      roughness: 0.05,
      metalness: 0,
      transmission: 1,
      thickness: 0.25,
      ior: 1.333,
      attenuationColor: new THREE.Color("#5d7f72"),
      attenuationDistance: 0.35,
      normalMap: normals,
      normalScale: new THREE.Vector2(0.35, 0.35),
      specularIntensity: 1,
    }),
  );
  surface.rotation.x = -Math.PI / 2;
  surface.receiveShadow = true;
  surfaces.push(surface.material);
  const group = new THREE.Group();
  group.add(surface, overlay);
  const u = mat.uniforms as Record<string, THREE.IUniform<number>>;
  return {
    mesh: group,
    overlay,
    update(time, rain) {
      if (u.time) u.time.value = time;
      if (u.rain) u.rain.value = rain;
      normals.offset.set(time * 0.013, -time * 0.05 * flow - time * 0.008);
    },
  };
}
