// The sea of cloud far below the trail. It hides the HDRI's lower hemisphere and gives the
// islands something to float above: fbm cloud tops lit by the measured sun, their shadowed
// sides filled from the sky, fading into the horizon haze with distance.

import * as THREE from "three";
import type { SkyLight } from "./render/sky";

const VERT = /* glsl */ `
#include <fog_pars_vertex>
varying vec3 vWorld;
void main() {
  vec4 world = modelMatrix * vec4(position, 1.0);
  vWorld = world.xyz;
  vec4 mvPosition = viewMatrix * world;
  gl_Position = projectionMatrix * mvPosition;
  #include <fog_vertex>
}`;

const FRAG = /* glsl */ `
#include <fog_pars_fragment>
#define PI 3.14159265
uniform float time;
uniform vec3 sunDir;
uniform vec3 sunColour;
uniform vec3 skyColour;
uniform vec3 horizon;
varying vec3 vWorld;
float hash(vec2 p) { return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453); }
float noise(vec2 p) {
  vec2 i = floor(p), f = fract(p);
  f = f * f * (3.0 - 2.0 * f);
  return mix(mix(hash(i), hash(i + vec2(1.0, 0.0)), f.x), mix(hash(i + vec2(0.0, 1.0)), hash(i + 1.0), f.x), f.y);
}
float fbm(vec2 p) {
  float v = 0.0, a = 0.5;
  for (int i = 0; i < 5; i++) { v += a * noise(p); p = p * 2.07 + 5.3; a *= 0.5; }
  return v;
}
void main() {
  vec2 p = vWorld.xz * 0.035 + vec2(time * 0.004, time * 0.002);
  float h = fbm(p);
  float hx = fbm(p + vec2(0.02, 0.0));
  float hz = fbm(p + vec2(0.0, 0.02));
  vec3 n = normalize(vec3((h - hx) * 30.0, 1.0, (h - hz) * 30.0));
  // Lambertian cloud tops (albedo 0.85): sky irradiance, dimmer in the troughs, plus the sun.
  float lit = max(dot(n, sunDir), 0.0);
  float billow = smoothstep(0.32, 0.72, h);
  // Troughs between the billows sit in their own shade.
  vec3 col = 0.7 / PI * (skyColour * mix(0.35, 1.0, billow) + sunColour * lit * mix(0.25, 1.0, billow));
  float dist = length(vWorld.xz - cameraPosition.xz);
  col = mix(col, horizon, smoothstep(30.0, 180.0, dist));
  gl_FragColor = vec4(col, 1.0);
  #include <fog_fragment>
}`;

export class CloudFloor {
  readonly mesh: THREE.Mesh<THREE.CircleGeometry, THREE.ShaderMaterial>;

  constructor(sky: SkyLight, height: number, centre: THREE.Vector3) {
    // Irradiances in the sky's own units: the sun's, and the sky dome's (about π × its mean
    // radiance, approximated from the horizon band).
    const sunColour = sky.sunColour.clone().multiplyScalar(sky.sunIlluminance);
    const skyColour = sky.horizon
      .clone()
      .multiply(new THREE.Color(0.88, 0.94, 1.06))
      .multiplyScalar(Math.PI * 0.6);
    const material = new THREE.ShaderMaterial({
      vertexShader: VERT,
      fragmentShader: FRAG,
      fog: true,
      depthWrite: true,
      uniforms: THREE.UniformsUtils.merge([
        THREE.UniformsLib.fog,
        {
          time: { value: 0 },
          sunDir: { value: sky.sun.clone() },
          sunColour: { value: sunColour },
          skyColour: { value: skyColour },
          horizon: { value: sky.horizon.clone() },
        },
      ]),
    });
    this.mesh = new THREE.Mesh(new THREE.CircleGeometry(320, 64), material);
    this.mesh.rotation.x = -Math.PI / 2;
    this.mesh.position.set(centre.x, height, centre.z);
  }

  update(time: number): void {
    const u = this.mesh.material.uniforms as Record<string, THREE.IUniform<number>>;
    if (u.time) u.time.value = time;
  }
}
