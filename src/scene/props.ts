// Reusable trail props: plinths, stones, grass tufts, logs, posts and the hiker.

import * as THREE from "three";
import { mergeVertices } from "three/addons/utils/BufferGeometryUtils.js";
import { assets, type Scan, tiled } from "./assets";
import { Jar } from "./jar";
import { fbm, mesh, PALETTE, rng, solid } from "./kit";
import type { SceneResources } from "./resources";
import { terrainMaterial } from "./terrain";

/**
 * A diorama plinth: one smooth lathed mass, flat turf on top rolling over a lip into a rocky
 * underside that tapers to a ragged tip. Noise displaces the sides; the top stays level so props
 * sit on it. Vertex colours: baked occlusion (R), per-island variation (G), rim nearness (B).
 */
/**
 * Where water has cut into a plinth's turf: `depth` below the surface (0 elsewhere) and `wet`
 * (0–1), the damp band along the banks.
 */
export type Carve = (x: number, z: number) => { depth: number; wet: number };

export function plinth(radius: number, depth: number, seed: number, carve?: Carve): THREE.Group {
  const group = new THREE.Group();
  const r = rng(seed);
  // Dense rings across the top so water can carve natural banks into it.
  const profile: THREE.Vector2[] = [new THREE.Vector2(0.001, 0.02)];
  for (let i = 1; i <= 22; i++) {
    const t = i / 22;
    profile.push(new THREE.Vector2(radius * 0.86 * t, 0.02 - 0.02 * t * t));
  }
  profile.push(
    new THREE.Vector2(radius * 0.93, -0.01),
    new THREE.Vector2(radius * 0.97, -0.05),
    new THREE.Vector2(radius, -0.14),
    new THREE.Vector2(radius * 0.98, -0.3),
  );
  const steps = 9;
  for (let i = 1; i <= steps; i++) {
    const t = i / steps;
    const w = radius * (0.98 - 0.8 * t ** 1.3) * (0.92 + r() * 0.16);
    profile.push(new THREE.Vector2(Math.max(0.05, w), -0.3 - (depth - 0.3) * t));
  }
  profile.push(new THREE.Vector2(0.001, -depth - 0.2));
  const lathe = new THREE.LatheGeometry(profile, carve ? 128 : 72);
  lathe.deleteAttribute("uv");
  lathe.deleteAttribute("normal");
  const geo = mergeVertices(lathe, 1e-4);
  const pos = geo.getAttribute("position") as THREE.BufferAttribute;
  const colors = new Float32Array(pos.count * 4);
  const p = new THREE.Vector3();
  const variation = 0.35 + r() * 0.3;
  for (let i = 0; i < pos.count; i++) {
    p.fromBufferAttribute(pos, i);
    const below = Math.max(0, -p.y);
    const side = Math.min(1, below / 0.25);
    const n = fbm(p.x * 0.9 + seed, p.y * 1.4, p.z * 0.9 - seed);
    const n2 = fbm(p.x * 3.1, p.y * 3.3 + seed, p.z * 3.1);
    const len = Math.hypot(p.x, p.z) || 1;
    const push = side * ((n - 0.5) * 0.7 + (n2 - 0.5) * 0.18) * Math.min(1, len / 0.4);
    p.x += (p.x / len) * push;
    p.z += (p.z / len) * push;
    p.y += side * (n2 - 0.5) * 0.2 + (1 - side) * (n2 - 0.5) * 0.015;
    const cut = carve && below < 0.05 ? carve(p.x, p.z) : { depth: 0, wet: 0 };
    p.y -= cut.depth;
    pos.setXYZ(i, p.x, p.y, p.z);
    const ao = 1 - Math.min(0.5, (below / depth) * 0.45) - Math.max(0, 0.5 - n) * 0.35 * side;
    colors[i * 4] = ao - cut.wet * 0.15;
    colors[i * 4 + 1] = variation + (n - 0.5) * 0.3;
    colors[i * 4 + 2] = 1 - Math.min(1, below / 0.55);
    colors[i * 4 + 3] = cut.wet;
  }
  geo.setAttribute("color", new THREE.BufferAttribute(colors, 4));
  geo.computeVertexNormals();
  const terrain = terrainMaterial(seed);
  const m = mesh(geo, terrain.material);
  group.add(m);
  group.userData.terrain = terrain;
  return group;
}

const tints = new Map<string, THREE.MeshStandardMaterial>();

/** A scan's material with one of a few hue and value shifts, darker when it sits in the wet. */
function tinted(
  base: THREE.MeshStandardMaterial,
  variant: number,
  wet: number,
): THREE.MeshStandardMaterial {
  const key = `${base.uuid}/${variant}/${wet.toFixed(1)}`;
  let m = tints.get(key);
  if (!m) {
    m = base.clone();
    const hsl = [
      [0, 0, 1],
      [0.02, -0.05, 0.92],
      [-0.015, 0.04, 1.06],
    ][variant] ?? [0, 0, 1];
    m.color
      .setHSL(0.1 + (hsl[0] ?? 0), 0.08 + (hsl[1] ?? 0), 0.5)
      .multiplyScalar(2 * (hsl[2] ?? 1));
    m.color.lerp(new THREE.Color(1, 1, 1), 0.55).multiplyScalar(1 - wet * 0.3);
    m.roughness = 1 - wet * 0.25;
    tints.set(key, m);
  }
  return m;
}

function seat(scan: Scan, size: number, seed: number, wet: number, sink: number): THREE.Group {
  const r = rng(seed * 7 + 3);
  const k = (size / scan.radius) * (0.85 + r() * 0.3);
  const m = mesh(scan.geometry, tinted(scan.material, Math.floor(r() * 3), wet));
  m.scale.set(k, k * (0.8 + r() * 0.4), k);
  m.rotation.y = r() * Math.PI * 2;
  m.position.y = -scan.height * m.scale.y * sink;
  const g = new THREE.Group();
  g.add(m);
  return g;
}

/** A scanned mossy rock about `size` in radius, turned and scaled at random and seated. */
export function stone(size: number, seed: number, wet = 0.4): THREE.Group {
  const { rocks } = assets();
  const scan = rocks[Math.floor(rng(seed)() * rocks.length) % rocks.length] as Scan;
  return seat(scan, size, seed, wet, 0.18);
}

/** The scanned boulder, for ledges and cliffs. */
export function boulder(size: number, seed: number, wet = 0.4): THREE.Group {
  return seat(assets().boulder, size, seed, wet, 0.12);
}

export { flowers, grassField as grass } from "./foliage";

const woods = new Map<string, THREE.MeshStandardMaterial>();

export function clearProps(resources: SceneResources): void {
  for (const material of [...tints.values(), ...woods.values()]) resources.material(material);
  tints.clear();
  woods.clear();
}

/** Scanned wood: weathered planks for joinery, bark for logs. `repeat` sets texel density. */
export function wood(kind: "planks" | "bark", tone = 1, repeat: [number, number] = [1, 1]) {
  const key = `${kind}/${tone}/${repeat.join("x")}`;
  let m = woods.get(key);
  if (!m) {
    const set = assets().sets[kind === "planks" ? "weathered_planks" : "bark_brown_02"];
    const tile = (t: THREE.Texture) => tiled(t, repeat);
    m = new THREE.MeshStandardMaterial({
      map: tile(set.colour),
      normalMap: tile(set.normal),
      roughnessMap: tile(set.arm),
      aoMap: tile(set.arm),
      aoMapIntensity: 0.8,
      color: new THREE.Color(tone, tone, tone),
    });
    woods.set(key, m);
  }
  return m;
}

function scanned(
  set: "mossy_rock" | "grass_ground" | "river_small_rocks",
  repeat: [number, number],
  tone: number,
) {
  const src = assets().sets[set];
  const tile = (t: THREE.Texture) => tiled(t, repeat);
  return new THREE.MeshStandardMaterial({
    map: tile(src.colour),
    normalMap: tile(src.normal),
    roughnessMap: tile(src.arm),
    aoMap: tile(src.arm),
    color: new THREE.Color(tone, tone, tone),
  });
}

/** Mossy stone masonry for the shelter's walls. */
export function masonry(repeat: [number, number]): THREE.MeshStandardMaterial {
  return scanned("mossy_rock", repeat, 0.95);
}

/** River pebbles for the beck and tarn beds, seen through the water. */
export function pebbles(repeat: [number, number]): THREE.MeshStandardMaterial {
  return scanned("river_small_rocks", repeat, 0.8);
}

/** Turf laid on the shelter roof. */
export function turfRoof(): THREE.MeshStandardMaterial {
  return scanned("grass_ground", [2, 1], 0.9);
}

export function log(length: number, radius: number, seed: number): THREE.Group {
  const g = new THREE.Group();
  const geo = new THREE.CylinderGeometry(radius, radius * 1.05, length, 20, 1);
  geo.rotateZ(Math.PI / 2);
  const body = mesh(geo, wood("bark", 0.9 + rng(seed)() * 0.2, [2, length * 2]));
  g.add(body);
  for (const side of [-1, 1]) {
    const end = new THREE.CircleGeometry(radius * 0.96, 14);
    end.rotateY((side * Math.PI) / 2);
    const endMesh = mesh(end, solid("#b8895c", 0.9), "none");
    endMesh.position.x = (side * length) / 2 + side * 0.005;
    g.add(endMesh);
  }
  return g;
}

export function post(height: number, tone = 1): THREE.Mesh {
  const geo = new THREE.BoxGeometry(0.12, height, 0.12);
  geo.translate(0, height / 2, 0);
  return mesh(geo, wood("planks", tone, [0.15, Math.max(0.3, height * 0.6)]));
}

/** The hiker: wool hat, coat, pack and the jar at the hip. */
export function hiker(): { group: THREE.Group; jar: Jar } {
  const group = new THREE.Group();
  const coat = mesh(new THREE.CapsuleGeometry(0.16, 0.3, 4, 12), solid("#56705f", 0.9));
  coat.position.y = 0.38;
  const head = mesh(new THREE.SphereGeometry(0.13, 16, 12), solid("#e0b394", 0.7));
  head.position.y = 0.72;
  const hat = mesh(
    new THREE.SphereGeometry(0.14, 16, 8, 0, Math.PI * 2, 0, Math.PI / 2),
    solid(PALETTE.wool, 0.95),
  );
  hat.position.y = 0.75;
  const bobble = mesh(new THREE.SphereGeometry(0.05, 8, 6), solid("#efe2c8", 1));
  bobble.position.y = 0.9;
  const pack = mesh(new THREE.BoxGeometry(0.26, 0.3, 0.14), solid("#8a5a34", 0.9));
  pack.position.set(0, 0.45, -0.17);
  for (const side of [-1, 1]) {
    const leg = mesh(new THREE.CapsuleGeometry(0.055, 0.16, 3, 6), solid("#3a3a40", 0.9));
    leg.position.set(side * 0.07, 0.1, 0);
    group.add(leg);
  }
  const jar = new Jar();
  jar.group.position.set(0.21, 0.36, 0.07);
  group.add(coat, head, hat, bobble, pack, jar.group);
  return { group, jar };
}

/** A small woolly sheep: a cluster of fleece puffs, dark face and legs. */
export function sheep(seed: number): THREE.Group {
  const g = new THREE.Group();
  const r = rng(seed);
  const wool = solid("#ece4d2", 1);
  for (let i = 0; i < 7; i++) {
    const puff = mesh(new THREE.IcosahedronGeometry(0.11 + r() * 0.04, 1), wool);
    puff.position.set((r() - 0.5) * 0.28, 0.3 + r() * 0.08, (r() - 0.5) * 0.18);
    g.add(puff);
  }
  const dark = solid("#2e2a28", 0.9);
  const head = mesh(new THREE.SphereGeometry(0.075, 10, 8), dark);
  head.scale.set(1, 0.9, 1.3);
  head.position.set(0.2, 0.34, 0);
  const ears = mesh(new THREE.BoxGeometry(0.02, 0.03, 0.18), dark);
  ears.position.set(0.19, 0.39, 0);
  g.add(head, ears);
  for (const [x, z] of [
    [-0.1, -0.06],
    [-0.1, 0.06],
    [0.1, -0.06],
    [0.1, 0.06],
  ] as const) {
    const leg = mesh(new THREE.CylinderGeometry(0.018, 0.018, 0.22, 5), dark);
    leg.position.set(x, 0.11, z);
    g.add(leg);
  }
  return g;
}

/** A small painted board naming the diorama, on a stake at the plinth edge. */
export function nameBoard(text: string): THREE.Group {
  const canvas = document.createElement("canvas");
  canvas.width = 256;
  canvas.height = 64;
  const ctx = canvas.getContext("2d");
  if (ctx) {
    ctx.fillStyle = "#8c6440";
    ctx.fillRect(0, 0, 256, 64);
    ctx.strokeStyle = "#5a3d24";
    ctx.lineWidth = 6;
    ctx.strokeRect(3, 3, 250, 58);
    ctx.fillStyle = "#f4e9cf";
    ctx.font = "italic 30px Georgia, 'Palatino Linotype', serif";
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";
    ctx.fillText(text, 128, 34);
  }
  const tex = new THREE.CanvasTexture(canvas);
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.anisotropy = 4;
  const g = new THREE.Group();
  const stake = post(0.5, 0.7);
  const edge = wood("planks", 0.6, [0.5, 0.2]);
  const board = mesh(new THREE.BoxGeometry(0.72, 0.18, 0.03), [
    edge,
    edge,
    edge,
    edge,
    new THREE.MeshStandardMaterial({ map: tex, roughness: 0.85 }),
    edge,
  ]);
  board.position.y = 0.5;
  g.add(stake, board);
  return g;
}
