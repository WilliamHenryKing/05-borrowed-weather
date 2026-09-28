// Reusable trail props: plinths, stones, grass tufts, logs, posts and the hiker.

import * as THREE from "three";
import { Jar } from "./jar";
import { earthy, fbm, mesh, mix, PALETTE, rng, roughen, solid } from "./kit";

const SLATE = new THREE.Color("#5b6266");
const RUST = new THREE.Color("#8a5d3e");

/** A diorama plinth: a mossy cap over layered earth and stone, like a cut-out of hillside. */
export function plinth(radius: number, depth: number, seed: number): THREE.Group {
  const group = new THREE.Group();
  const body = new THREE.CylinderGeometry(radius, radius * 0.72, depth, 36, 6);
  body.translate(0, -depth / 2, 0);
  const g = roughen(body, 0.45, 0.9, seed, (p, n) => {
    const t = -p.y / depth;
    if (t < 0.07) return mix(PALETTE.mossDeep, PALETTE.moss, n);
    if (t < 0.13 && n > 0.45) return mix(PALETTE.earthDeep, PALETTE.mossDeep, 0.6);
    // Strata of damp earth, slate, rust-stained and lichen-pale stone, darker towards the tip.
    const band = fbm(p.x * 0.6 + seed, p.y * 3.2, p.z * 0.6);
    const strata = Math.sin(p.y * 7 + n * 4) * 0.5 + 0.5;
    let c = mix(PALETTE.earth, SLATE, strata * 0.6);
    if (band > 0.6) c = mix(c, RUST, (band - 0.6) * 2.5);
    else if (band < 0.36) c = mix(c, PALETTE.lichen, (0.36 - band) * 1.8);
    if (n > 0.64) c = mix(c, PALETTE.stoneWet, 0.5);
    return mix(c, PALETTE.earthDeep, t * 0.75);
  });
  group.add(mesh(g, earthy()));
  const cap = new THREE.CircleGeometry(radius * 0.99, 40, 0, Math.PI * 2);
  cap.rotateX(-Math.PI / 2);
  const capG = roughen(cap, 0.08, 1.4, seed + 3, (_p, n) =>
    n > 0.6
      ? mix(PALETTE.grass, PALETTE.lichen, (n - 0.6) * 2)
      : mix(PALETTE.mossDeep, PALETTE.moss, n * 1.4),
  );
  const capMesh = mesh(capG, earthy(), "receive");
  capMesh.position.y = 0.02;
  group.add(capMesh);
  return group;
}

export function stone(size: number, seed: number, wet = 0.4): THREE.Mesh {
  const geo = new THREE.IcosahedronGeometry(size, 2);
  geo.scale(1, 0.62, 0.9);
  const g = roughen(geo, size * 0.5, 2.2 / size, seed, (p, n) => {
    const top = p.y > size * 0.25 && n > 0.55;
    const base = mix(PALETTE.stone, PALETTE.stoneWet, wet + (0.5 - n) * 0.6);
    return top ? mix(base, PALETTE.moss, 0.7) : base;
  });
  return mesh(g, earthy(0.78));
}

/** Instanced bent-grass tufts scattered over a disc, avoiding a cleared radius list. */
export function grass(
  radius: number,
  count: number,
  seed: number,
  clear: { x: number; z: number; r: number }[] = [],
): THREE.InstancedMesh {
  const blade = new THREE.ConeGeometry(0.022, 0.2, 3, 1);
  blade.translate(0, 0.1, 0);
  const mat = solid(PALETTE.grass, 0.9);
  const inst = new THREE.InstancedMesh(blade, mat, count);
  const r = rng(seed);
  const m = new THREE.Matrix4();
  const q = new THREE.Quaternion();
  const e = new THREE.Euler();
  const c = new THREE.Color();
  let placed = 0;
  for (let tries = 0; placed < count && tries < count * 6; tries++) {
    const a = r() * Math.PI * 2;
    const d = Math.sqrt(r()) * radius * 0.94;
    const x = Math.cos(a) * d;
    const z = Math.sin(a) * d;
    if (clear.some((k) => (x - k.x) ** 2 + (z - k.z) ** 2 < k.r * k.r)) continue;
    e.set((r() - 0.5) * 0.7, r() * Math.PI, (r() - 0.3) * 0.6);
    q.setFromEuler(e);
    const s = 0.55 + r() * 0.6;
    m.compose(new THREE.Vector3(x, 0, z), q, new THREE.Vector3(s, s * (0.7 + r()), s));
    inst.setMatrixAt(placed, m);
    inst.setColorAt(
      placed,
      c
        .copy(PALETTE.grass)
        .lerp(PALETTE.lichen, r() * 0.5)
        .offsetHSL(0, 0, (r() - 0.5) * 0.08),
    );
    placed++;
  }
  inst.count = placed;
  inst.castShadow = true;
  inst.receiveShadow = true;
  return inst;
}

export function log(length: number, radius: number, seed: number): THREE.Group {
  const g = new THREE.Group();
  const geo = new THREE.CylinderGeometry(radius, radius * 1.05, length, 14, 4);
  geo.rotateZ(Math.PI / 2);
  const body = roughen(geo, radius * 0.25, 3, seed, (p, n) =>
    p.y > radius * 0.5 && n > 0.45
      ? mix(PALETTE.moss, PALETTE.mossDeep, n)
      : mix(PALETTE.wood, PALETTE.woodDark, n),
  );
  g.add(mesh(body, earthy(0.85)));
  for (const side of [-1, 1]) {
    const end = new THREE.CircleGeometry(radius * 0.96, 14);
    end.rotateY((side * Math.PI) / 2);
    const endMesh = mesh(end, solid("#b8895c", 0.9), "none");
    endMesh.position.x = (side * length) / 2 + side * 0.005;
    g.add(endMesh);
  }
  return g;
}

export function post(height: number, color: THREE.ColorRepresentation = PALETTE.wood): THREE.Mesh {
  const geo = new THREE.BoxGeometry(0.12, height, 0.12);
  geo.translate(0, height / 2, 0);
  return mesh(geo, solid(color, 0.85));
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

/** Instanced meadow flowers: little heads of yellow, white and heather on short stems. */
export function flowers(radius: number, count: number, seed: number): THREE.InstancedMesh {
  const head = new THREE.IcosahedronGeometry(0.03, 0);
  head.translate(0, 0.08, 0);
  const inst = new THREE.InstancedMesh(head, solid("#ffffff", 0.7), count);
  const r = rng(seed);
  const colors = ["#f2d04b", "#f4efe2", "#b77bb8", "#e9a1b0"].map((c) => new THREE.Color(c));
  const m = new THREE.Matrix4();
  for (let i = 0; i < count; i++) {
    const a = r() * Math.PI * 2;
    const d = Math.sqrt(r()) * radius * 0.92;
    const s = 0.7 + r() * 0.8;
    m.makeScale(s, s, s).setPosition(Math.cos(a) * d, 0, Math.sin(a) * d);
    inst.setMatrixAt(i, m);
    inst.setColorAt(i, colors[i % colors.length] ?? colors[0] ?? new THREE.Color());
  }
  inst.castShadow = true;
  return inst;
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
  const stake = post(0.5, PALETTE.woodDark);
  const edge = solid("#5a3d24");
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
