import type { Recipes } from "./kit/build";
import {
  bend,
  blend,
  box,
  capsule,
  carve,
  chain,
  cone,
  cylinder,
  displace,
  ellipsoid,
  extrude,
  fbm,
  lathe,
  type Mat,
  mat,
  mirrorX,
  mottle,
  move,
  type Node,
  paint,
  polygon2,
  radial,
  rng,
  rotate,
  scale,
  sphere,
  subtract,
  torus,
  union,
  type Vec3,
} from "./kit/sdf";

const pick = <T>(r: () => number, list: T[]) => list[Math.floor(r() * list.length)] as T;
const range = (r: () => number, a: number, b: number) => a + (b - a) * r();
void [bend, blend, box, capsule, carve, chain, cone, cylinder, displace, ellipsoid, extrude, fbm, lathe, mirrorX, mottle, move, paint, polygon2, radial, rotate, scale, sphere, subtract, torus, union];
type Build = (seed: number, index: number) => Node;
void (0 as unknown as Mat | Vec3 | Build);

// BORROWED WEATHER — trail diorama kit: damp mossy rocks, stumps, signposts, the weather jar
// and a lantern shelter.
const rock: Build = (seed) => {
  // Trail stones in five habits (run-03's 80 were near-identical moss-capped pebbles): rounded
  // boulders, angular blocks, flat stepping slabs, trail cairns and split boulders, each with
  // a moss cap, lichen rosettes or bare stone.
  const r = rng(seed);
  const s = range(r, 0.3, 1.4);
  const stone = mat(pick(r, [0x6b6e6a, 0x7a7b73, 0x5e625e, 0x86857a, 0x8a8172, 0x5b5850]), 0.7);
  const moss = mat(pick(r, [0x4f6b2f, 0x5c7a34, 0x3f5a28]), 0.9);
  const lichen = mat(pick(r, [0xb8b27a, 0xc9c08e, 0xc98a3a]), 0.85);
  const habit = Math.floor(r() * 5);
  let body: Node;
  if (habit === 0) {
    body = blend(s * 0.2, ellipsoid(s, s * range(r, 0.4, 0.8), s * range(r, 0.6, 1), stone), move(ellipsoid(s * 0.6, s * 0.5, s * 0.6, stone), [s * 0.5, s * 0.1, s * 0.2]));
    body = displace(body, s * 0.06, 2.5 / s, 5, seed);
  } else if (habit === 1) {
    // Angular block: a bevelled box, tilted, with a crack cut through it.
    body = rotate(box(s * range(r, 1.2, 1.8), s * range(r, 0.7, 1.1), s * range(r, 0.9, 1.3), s * 0.08, stone), [range(r, -0.2, 0.2), r() * 3, range(r, -0.15, 0.15)]);
    body = carve(s * 0.02, body, move(rotate(box(s * 0.04, s * 3, s * 3), [0, r() * 3, range(r, -0.4, 0.4)]), [s * range(r, -0.3, 0.3), 0, 0]));
    body = displace(body, s * 0.03, 3.5 / s, 4, seed);
  } else if (habit === 2) {
    // Stepping slab: wide, thin, gently domed, worn at the edges.
    body = displace(blend(s * 0.1, box(s * range(r, 1.6, 2.2), s * range(r, 0.22, 0.34), s * range(r, 1.2, 1.8), s * 0.1, stone), move(ellipsoid(s * 0.7, s * 0.18, s * 0.6, stone), [0, s * 0.1, 0])), s * 0.025, 3 / s, 4, seed);
  } else if (habit === 3) {
    // Trail cairn: flattish stones stacked, each a little off-centre.
    const stones: Node[] = [];
    let y = 0;
    const count = 3 + Math.floor(r() * 3);
    for (let k = 0; k < count; k++) {
      const w = s * (0.55 - k * 0.07) * range(r, 0.85, 1.15);
      const h = w * range(r, 0.35, 0.5);
      stones.push(move(rotate(ellipsoid(w, h, w * range(r, 0.7, 1), stone), [range(r, -0.12, 0.12), r() * 3, range(r, -0.12, 0.12)]), [range(r, -0.06, 0.06) * s, y + h * 0.8, range(r, -0.06, 0.06) * s]));
      y += h * 1.55;
    }
    body = displace(union(...stones), s * 0.02, 4 / s, 4, seed);
  } else {
    // Split boulder: a rounded stone cracked through, the halves a hand apart.
    const whole = displace(ellipsoid(s, s * range(r, 0.55, 0.8), s * range(r, 0.7, 1), stone), s * 0.05, 2.5 / s, 5, seed);
    body = carve(s * 0.015, whole, rotate(box(s * range(r, 0.06, 0.12), s * 3, s * 3), [0, r() * 3, range(r, -0.2, 0.2)]));
  }
  const cover = r();
  const mossLine = range(r, 0.05, 0.45);
  return paint(body, (x, y, z, base) => {
    if (cover < 0.45 && y > s * mossLine + fbm(x * 3, y * 3, z * 3, 3, seed) * s * 0.3) return moss;
    if (cover >= 0.45 && cover < 0.8 && fbm(x * 9, y * 9, z * 9, 2, seed + 7) > 0.35) return lichen;
    return base;
  });
};
const stump: Build = (seed) => {
  const r = rng(seed);
  const rad = range(r, 0.15, 0.4);
  const bark = mat(0x5a4636, 0.95);
  const wood = mat(0xb08a5e, 0.8);
  const body = displace(cylinder(rad, rad * range(r, 1, 2.2), rad * 0.1, bark), rad * 0.05, 6 / rad, 3, seed);
  const rings = paint(move(cylinder(rad * 0.93, 0.02, 0, wood), [0, rad * 0.55, 0]), (x, _y, z, base) => {
    const t = Math.sin(Math.hypot(x, z) * 180) * 0.12 + 0.94;
    return { ...base, c: [base.c[0] * t, base.c[1] * t, base.c[2] * t] };
  });
  const roots = radial(capsule([rad * 0.8, -rad * 0.4, 0], [rad * 1.6, -rad * 0.9, 0], rad * 0.18, rad * 0.05, bark), 5);
  return union(blend(rad * 0.1, body, roots), rings);
};
const arrow2 = (w: number, h: number) => polygon2([[-w / 2, -h / 2], [w / 2 - h / 2, -h / 2], [w / 2, 0], [w / 2 - h / 2, h / 2], [-w / 2, h / 2]]);
const signpost: Build = (seed) => {
  const r = rng(seed);
  const wood = mat(pick(r, [0x7a5a3c, 0x8a6a45]), 0.85);
  const paintMat = mat(pick(r, [0xe8e0cc, 0xd9a441, 0x2f5a4a]), 0.6);
  const post = move(box(0.1, 1.6, 0.1, 0.01, wood), [0, 0.8, 0]);
  const boards: Node[] = [];
  const n = 1 + Math.floor(r() * 3);
  for (let i = 0; i < n; i++) {
    const w = range(r, 0.5, 0.8);
    const board = extrude(arrow2(w, 0.14), [-w / 2, -0.07, w / 2, 0.07], 0.03, 0.004, i % 2 ? paintMat : wood);
    boards.push(move(rotate(board, [0, r() * 3.14, 0]), [0, 1.35 - i * 0.2, 0]));
  }
  return displace(union(post, ...boards), 0.002, 30, 2, seed);
};
const jar: Build = (seed) => {
  const r = rng(seed);
  const glass = mat(0xa9c7c9, 0.08);
  const h = range(r, 0.18, 0.32);
  const rad = range(r, 0.07, 0.12);
  const body = lathe([[0, 0.005], [rad, 0.005], [rad, h * 0.8], [rad * 0.75, h * 0.92], [rad * 0.75, h]], 0.004, glass);
  const lid = move(cylinder(rad * 0.82, 0.03, 0.004, mat(pick(r, [0xc49a4a, 0x8a3a2a, 0x3a5a7a]), 0.4, 0.8)), [0, h + 0.012, 0]);
  const bail = move(rotate(torus(rad * 0.85, 0.003, mat(0x9aa0a6, 0.3, 1)), [Math.PI / 2, 0, 0]), [0, h * 0.95, 0]);
  const cloud = displace(move(ellipsoid(rad * 0.55, h * 0.25, rad * 0.55, mat(0xf2f4f5, 0.9)), [0, h * 0.45, 0]), rad * 0.12, 30, 3, seed);
  return union(body, lid, bail, cloud);
};
const shelter: Build = (seed) => {
  const r = rng(seed);
  const wood = mat(pick(r, [0x6d5037, 0x7e5e3f]), 0.85);
  const roofMat = mat(pick(r, [0x3a4a3a, 0x5a3a2a, 0x4a4f55]), 0.7);
  const w = range(r, 1.6, 2.4);
  const d = range(r, 1.2, 1.8);
  const walls = subtract(move(box(w, 1.6, d, 0.03, wood), [0, 0.8, 0]), move(box(w - 0.12, 1.5, d - 0.12), [0, 0.85, 0]), move(box(0.7, 1.2, 0.5), [0, 0.6, d / 2]));
  const pitch = 0.6;
  const roof = union(move(rotate(box(w + 0.3, 0.06, d * 0.65, 0.01, roofMat), [pitch, 0, 0]), [0, 1.85, -d * 0.24]), move(rotate(box(w + 0.3, 0.06, d * 0.65, 0.01, roofMat), [-pitch, 0, 0]), [0, 1.85, d * 0.24]));
  const lantern = union(move(sphere(0.07, mat(0xffc46b, 0.3)), [w * 0.35, 1.3, d / 2 + 0.12]), capsule([w * 0.35, 1.45, d / 2], [w * 0.35, 1.45, d / 2 + 0.12], 0.01, 0.01, wood));
  return union(walls, roof, lantern);
};

export const project = { id: "05-borrowed-weather", name: "BORROWED WEATHER", background: 0x2e3a33 };
export const families: Recipes["families"] = [
  { id: "trail-rock", count: 80, voxel: 0.012, keep: 0.25, dirt: 0.5, build: rock },
  { id: "stump", count: 32, voxel: 0.006, keep: 0.3, build: stump },
  { id: "signpost", count: 24, voxel: 0.006, keep: 0.3, build: signpost },
  { id: "weather-jar", count: 12, voxel: 0.002, keep: 0.35, hero: true, build: jar },
  { id: "lantern-shelter", count: 8, voxel: 0.02, keep: 0.3, hero: true, build: shelter },
];
export const textures: Recipes["textures"] = [
  { id: "damp-granite", ramp: [0x4a4d4a, 0x6b6e6a, 0x8a8b83], layers: [{ kind: "fbm", scale: 12, octaves: 6 }, { kind: "cells", count: 20, weight: 0.4 }], roughness: [0.35, 0.8], normal: 2 },
  { id: "moss", ramp: [0x2f4a1f, 0x4f6b2f, 0x6f8a3f], layers: [{ kind: "fbm", scale: 64, octaves: 4 }, { kind: "cells", count: 60, weight: 0.5 }], roughness: [0.85, 1], normal: 2.5 },
  { id: "trail-soil", ramp: [0x3a2f24, 0x5a4a38, 0x7a6448], layers: [{ kind: "fbm", scale: 16, octaves: 6 }, { kind: "cells", count: 40, weight: 0.3 }], roughness: [0.8, 0.95], normal: 1.5 },
  { id: "weathered-plank", ramp: [0x4a3a2a, 0x6d5037, 0x8a6a45], layers: [{ kind: "grain", rings: 20, warp: 1.8 }, { kind: "fibres", scale: 24, stretch: 8, weight: 0.5 }], roughness: [0.7, 0.9], normal: 1.8 },
  { id: "condensation-glass", ramp: [0x9fb9bb, 0xc3d6d8, 0xe6f0f1], layers: [{ kind: "cells", count: 48 }, { kind: "fbm", scale: 8, weight: 0.3 }], roughness: [0.05, 0.3], normal: 1.2 },
];
