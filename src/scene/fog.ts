// Real fog: stacked horizontal sheets of drifting fbm noise, thick in the middle and thin at
// the edges, plus a few soft noisy billboards for side volume. `level` 0..1 thins, sinks and
// clears the bank; 1 is a full bank.

import * as THREE from "three";
import { fbm, rng } from "./kit";

const VERT = /* glsl */ `
#include <fog_pars_vertex>
varying vec2 vUv;
void main() {
  vUv = uv;
  vec4 mvPosition = modelViewMatrix * vec4(position, 1.0);
  gl_Position = projectionMatrix * mvPosition;
  #include <fog_vertex>
}`;

const FRAG = /* glsl */ `
#include <fog_pars_fragment>
uniform float time;
uniform float density;
uniform float seed;
uniform float squash;
uniform vec3 tint;
uniform vec3 shade;
varying vec2 vUv;
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
  for (int i = 0; i < 4; i++) { v += a * noise(p); p = p * 2.03 + 7.1; a *= 0.5; }
  return v;
}
void main() {
  vec2 p = vUv * 2.0 - 1.0;
  p.y *= squash;
  float r = length(p);
  float mask = 1.0 - smoothstep(0.2, 1.0, r);
  vec2 drift = vec2(time * 0.035, time * 0.021);
  float n = fbm(vUv * 3.2 + drift + seed);
  float n2 = fbm(vUv * 7.0 - drift * 1.7 + seed * 1.9);
  float body = n * 0.7 + n2 * 0.3;
  float d = smoothstep(0.32, 0.78, body * 0.85 + mask * 0.45) * mask;
  float a = clamp(d * density, 0.0, 1.0);
  vec3 col = mix(shade, tint, smoothstep(0.3, 0.8, body));
  gl_FragColor = vec4(col, a);
  #include <fog_fragment>
}`;

export interface FogOptions {
  radius: number;
  height: number;
  layers: number;
  /** Peak opacity of each sheet at full level. */
  density: number;
  billboards: number;
  seed: number;
  tint?: THREE.ColorRepresentation;
  /** Elongate the mask (>1 flattens it along one axis), for banks along a stream. */
  squash?: number;
}

let noisyPuff: THREE.Texture | null = null;

/** A soft puff with fbm holes in it, so billboards read as vapour, not balls. */
export function noisyPuffTexture(): THREE.Texture {
  if (noisyPuff) return noisyPuff;
  const size = 128;
  const canvas = document.createElement("canvas");
  canvas.width = size;
  canvas.height = size;
  const ctx = canvas.getContext("2d");
  if (ctx) {
    const img = ctx.createImageData(size, size);
    for (let y = 0; y < size; y++) {
      for (let x = 0; x < size; x++) {
        const u = x / size - 0.5;
        const v = y / size - 0.5;
        const r = Math.sqrt(u * u + v * v) * 2;
        const fall = Math.max(0, 1 - r) ** 1.6;
        const n = fbm(x * 0.045, y * 0.045, 3.7);
        const a = Math.max(0, Math.min(1, (n - 0.28) * 2.2)) * fall;
        const i = (y * size + x) * 4;
        img.data[i] = 255;
        img.data[i + 1] = 255;
        img.data[i + 2] = 255;
        img.data[i + 3] = Math.round(a * 255);
      }
    }
    ctx.putImageData(img, 0, 0);
  }
  noisyPuff = new THREE.CanvasTexture(canvas);
  noisyPuff.colorSpace = THREE.SRGBColorSpace;
  return noisyPuff;
}

export class FogVolume {
  readonly group = new THREE.Group();
  private readonly sheets: THREE.Mesh<THREE.PlaneGeometry, THREE.ShaderMaterial>[] = [];
  private readonly puffs: { sprite: THREE.Sprite; base: THREE.Vector3; phase: number }[] = [];
  private readonly puffMat: THREE.SpriteMaterial;
  private level = 0;

  constructor(private readonly o: FogOptions) {
    const r = rng(o.seed);
    const tint = new THREE.Color(o.tint ?? "#e9eeec");
    const shade = tint.clone().multiplyScalar(0.72).lerp(new THREE.Color("#8a9a9e"), 0.3);
    for (let i = 0; i < o.layers; i++) {
      const mat = new THREE.ShaderMaterial({
        vertexShader: VERT,
        fragmentShader: FRAG,
        transparent: true,
        depthWrite: false,
        side: THREE.DoubleSide,
        fog: true,
        uniforms: THREE.UniformsUtils.merge([
          THREE.UniformsLib.fog,
          {
            time: { value: 0 },
            density: { value: 0 },
            seed: { value: o.seed * 0.37 + i * 3.1 },
            squash: { value: o.squash ?? 1 },
            tint: { value: tint },
            shade: { value: shade },
          },
        ]),
      });
      const size = o.radius * 2.3 * (1 - (i / o.layers) * 0.25);
      const sheet = new THREE.Mesh(new THREE.PlaneGeometry(size, size), mat);
      sheet.rotation.x = -Math.PI / 2;
      sheet.renderOrder = 3 + i;
      this.sheets.push(sheet);
      this.group.add(sheet);
    }
    this.puffMat = new THREE.SpriteMaterial({
      map: noisyPuffTexture(),
      color: tint,
      transparent: true,
      opacity: 0,
      depthWrite: false,
    });
    for (let i = 0; i < o.billboards; i++) {
      const sprite = new THREE.Sprite(this.puffMat);
      const a = r() * Math.PI * 2;
      const d = Math.sqrt(r()) * o.radius * 0.7;
      const base = new THREE.Vector3(
        Math.cos(a) * d,
        o.height * (0.3 + r() * 0.5),
        Math.sin(a) * d,
      );
      const s = o.radius * (0.55 + r() * 0.45);
      sprite.scale.set(s * 1.5, s * 0.8, 1);
      sprite.renderOrder = 3;
      this.puffs.push({ sprite, base, phase: r() * 10 });
      this.group.add(sprite);
    }
  }

  setLevel(level: number): void {
    this.level = level;
  }

  update(time: number, motion: number): void {
    const lv = this.level;
    this.group.visible = lv > 0.01;
    if (!this.group.visible) return;
    const n = this.sheets.length;
    this.sheets.forEach((s, i) => {
      const t = (i + 0.5) / n;
      s.position.y = this.o.height * t * (0.35 + lv * 0.65);
      const u = s.material.uniforms as Record<string, THREE.IUniform<number>>;
      if (u.time) u.time.value = time * motion + i * 11;
      if (u.density) u.density.value = this.o.density * lv * (1.15 - t * 0.5);
    });
    this.puffMat.opacity = lv * this.o.density * 0.9;
    for (const p of this.puffs) {
      const drift = Math.sin(time * 0.2 * motion + p.phase) * 0.25;
      p.sprite.position.set(p.base.x + drift, p.base.y * (0.4 + lv * 0.6), p.base.z + drift * 0.5);
    }
  }
}
