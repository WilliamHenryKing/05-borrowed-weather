// Reusable trail props: plinths, stones, grass tufts, logs, posts and the hiker.

import * as THREE from "three";
import { earthy, mesh, mix, PALETTE, rng, roughen, solid } from "./kit";

/** A diorama plinth: a mossy cap over layered earth and stone, like a cut-out of hillside. */
export function plinth(radius: number, depth: number, seed: number): THREE.Group {
  const group = new THREE.Group();
  const body = new THREE.CylinderGeometry(radius, radius * 0.72, depth, 36, 6);
  body.translate(0, -depth / 2, 0);
  const g = roughen(body, 0.45, 0.9, seed, (p, n) => {
    const t = -p.y / depth;
    if (t < 0.08) return mix(PALETTE.mossDeep, PALETTE.moss, n);
    const strata = Math.sin(p.y * 7 + n * 4) * 0.5 + 0.5;
    const base = mix(PALETTE.earth, PALETTE.earthDeep, t);
    return mix(base, PALETTE.stoneWet, strata * 0.45 + (n > 0.62 ? 0.4 : 0));
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
export function hiker(): { group: THREE.Group; jarFill: THREE.Mesh } {
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
  const jar = mesh(
    new THREE.CylinderGeometry(0.075, 0.075, 0.18, 16),
    new THREE.MeshPhysicalMaterial({
      color: "#e8f2f0",
      roughness: 0.12,
      transmission: 0.6,
      transparent: true,
      opacity: 0.55,
    }),
    "none",
  );
  jar.position.set(0.2, 0.34, 0.06);
  const jarFill = mesh(new THREE.SphereGeometry(0.06, 12, 10), solid("#ffffff", 0.6), "none");
  jarFill.position.copy(jar.position);
  const lid = mesh(
    new THREE.CylinderGeometry(0.08, 0.08, 0.035, 16),
    solid("#b58a45", 0.5),
    "none",
  );
  lid.position.set(0.2, 0.445, 0.06);
  group.add(coat, head, hat, bobble, pack, jar, jarFill, lid);
  return { group, jarFill };
}
