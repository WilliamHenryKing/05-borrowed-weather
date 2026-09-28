// Living water: drifting fbm ripples, a fresnel sheen with a low-sun glint, a pale foam
// edge where it meets stone and grass, and rain rings while rain falls on it.

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
  vec3 col = mix(deep, shallow, 0.25 + h0 * 0.5);
  col = mix(col, sky, fres * 0.55) + spec * vec3(1.0, 0.92, 0.78) * 1.4;
  col = mix(col, foam, froth * 0.85);
  float alpha = mix(0.9, 0.97, froth) * smoothstep(0.0, 0.04, edge + 0.02);
  gl_FragColor = vec4(col, alpha);
  #include <fog_fragment>
}`;

export interface Water {
  readonly mesh: THREE.Mesh<THREE.PlaneGeometry, THREE.ShaderMaterial>;
  update(time: number, rain: number): void;
}

/** A strip of flowing beck (`disc` false) or a still round tarn or puddle (`disc` true). */
export function water(width: number, depth: number, disc: boolean, flow = 1): Water {
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
  const m = new THREE.Mesh(new THREE.PlaneGeometry(width, depth), mat);
  m.rotation.x = -Math.PI / 2;
  m.receiveShadow = true;
  const u = mat.uniforms as Record<string, THREE.IUniform<number>>;
  return {
    mesh: m,
    update(time, rain) {
      if (u.time) u.time.value = time;
      if (u.rain) u.rain.value = rain;
    },
  };
}
