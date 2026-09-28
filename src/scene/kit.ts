// Small procedural toolkit: palette, seeded noise, displaced and vertex-coloured geometry.

import * as THREE from "three";

export const PALETTE = {
  moss: new THREE.Color("#5f7a3a"),
  mossDeep: new THREE.Color("#3d5428"),
  grass: new THREE.Color("#8a9a4e"),
  earth: new THREE.Color("#5a4332"),
  earthDeep: new THREE.Color("#3a2c22"),
  stone: new THREE.Color("#7d7f78"),
  stoneWet: new THREE.Color("#4f5553"),
  lichen: new THREE.Color("#b7b58a"),
  wood: new THREE.Color("#7a5236"),
  woodDark: new THREE.Color("#4a3120"),
  wool: new THREE.Color("#c7503a"),
  water: new THREE.Color("#3f6f7a"),
  lantern: new THREE.Color("#ffb45e"),
  fog: new THREE.Color("#dfe6e4"),
  rain: new THREE.Color("#a9cde0"),
  wind: new THREE.Color("#f1efd8"),
  fern: new THREE.Color("#6f9a3c"),
  sky: new THREE.Color("#9fb3b4"),
};

/** Deterministic pseudo-random generator (mulberry32). */
export function rng(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function hash3(x: number, y: number, z: number): number {
  const s = Math.sin(x * 127.1 + y * 311.7 + z * 74.7) * 43758.5453;
  return s - Math.floor(s);
}

/** Smooth 3D value noise in [0, 1]. */
export function noise3(x: number, y: number, z: number): number {
  const xi = Math.floor(x);
  const yi = Math.floor(y);
  const zi = Math.floor(z);
  const f = (t: number) => t * t * (3 - 2 * t);
  const u = f(x - xi);
  const v = f(y - yi);
  const w = f(z - zi);
  const lerp = (a: number, b: number, t: number) => a + (b - a) * t;
  const c = (dx: number, dy: number, dz: number) => hash3(xi + dx, yi + dy, zi + dz);
  return lerp(
    lerp(lerp(c(0, 0, 0), c(1, 0, 0), u), lerp(c(0, 1, 0), c(1, 1, 0), u), v),
    lerp(lerp(c(0, 0, 1), c(1, 0, 1), u), lerp(c(0, 1, 1), c(1, 1, 1), u), v),
    w,
  );
}

export function fbm(x: number, y: number, z: number): number {
  return (
    noise3(x, y, z) * 0.55 +
    noise3(x * 2.1, y * 2.1, z * 2.1) * 0.3 +
    noise3(x * 4.3, y * 4.3, z * 4.3) * 0.15
  );
}

/** Push vertices outward along their direction from the centre by noise, then colour by height. */
export function roughen(
  geo: THREE.BufferGeometry,
  amount: number,
  scale: number,
  seed: number,
  paint: (p: THREE.Vector3, n: number) => THREE.Color,
): THREE.BufferGeometry {
  const g = geo.index ? geo.toNonIndexed() : geo;
  const pos = g.getAttribute("position") as THREE.BufferAttribute;
  const colors = new Float32Array(pos.count * 3);
  const p = new THREE.Vector3();
  const dir = new THREE.Vector3();
  for (let i = 0; i < pos.count; i++) {
    p.fromBufferAttribute(pos, i);
    const n = fbm(p.x * scale + seed, p.y * scale, p.z * scale - seed);
    dir.copy(p).normalize();
    p.addScaledVector(dir, (n - 0.5) * amount);
    pos.setXYZ(i, p.x, p.y, p.z);
    const c = paint(p, n);
    colors[i * 3] = c.r;
    colors[i * 3 + 1] = c.g;
    colors[i * 3 + 2] = c.b;
  }
  g.setAttribute("color", new THREE.BufferAttribute(colors, 3));
  g.computeVertexNormals();
  return g;
}

const cache = new Map<string, THREE.MeshStandardMaterial>();

/** Shared vertex-coloured material, rough and matte like wet stone and moss. */
export function earthy(roughness = 0.92): THREE.MeshStandardMaterial {
  const key = `earthy${roughness}`;
  let m = cache.get(key);
  if (!m) {
    m = new THREE.MeshStandardMaterial({ vertexColors: true, roughness, metalness: 0 });
    cache.set(key, m);
  }
  return m;
}

export function solid(
  color: THREE.ColorRepresentation,
  roughness = 0.8,
): THREE.MeshStandardMaterial {
  const key = `${new THREE.Color(color).getHexString()}/${roughness}`;
  let m = cache.get(key);
  if (!m) {
    m = new THREE.MeshStandardMaterial({ color, roughness, metalness: 0 });
    cache.set(key, m);
  }
  return m;
}

/** A soft round sprite texture used for fog puffs and cloud. */
export function puffTexture(): THREE.Texture {
  const size = 128;
  const canvas = document.createElement("canvas");
  canvas.width = size;
  canvas.height = size;
  const ctx = canvas.getContext("2d");
  if (ctx) {
    const g = ctx.createRadialGradient(size / 2, size / 2, 0, size / 2, size / 2, size / 2);
    g.addColorStop(0, "rgba(255,255,255,0.9)");
    g.addColorStop(0.45, "rgba(255,255,255,0.45)");
    g.addColorStop(1, "rgba(255,255,255,0)");
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, size, size);
  }
  const tex = new THREE.CanvasTexture(canvas);
  tex.colorSpace = THREE.SRGBColorSpace;
  return tex;
}

export function mesh(
  geo: THREE.BufferGeometry,
  mat: THREE.Material | THREE.Material[],
  shadow: "cast" | "receive" | "both" | "none" = "both",
): THREE.Mesh {
  const m = new THREE.Mesh(geo, mat);
  m.castShadow = shadow === "cast" || shadow === "both";
  m.receiveShadow = shadow === "receive" || shadow === "both";
  return m;
}

export const mix = (a: THREE.Color, b: THREE.Color, t: number): THREE.Color =>
  a.clone().lerp(b, Math.min(1, Math.max(0, t)));
