// The upper trail: Vane Terrace, High Tarn and the Lantern Shelter.

import * as THREE from "three";
import type { DioramaParts } from "./diorama";
import { mesh, PALETTE, rng, solid } from "./kit";
import { boulder, grass, log, pebbles, plinth, post, stone, wood } from "./props";
import { water } from "./water";

/** A fern frond as a chain of leaflets; `curl` 1 rolls it into a fiddlehead, 0 lays it flat. */
function frond(segments: number): { root: THREE.Group; joints: THREE.Group[] } {
  const root = new THREE.Group();
  const joints: THREE.Group[] = [];
  let parent: THREE.Object3D = root;
  const leaf = solid(PALETTE.fern, 0.75);
  for (let i = 0; i < segments; i++) {
    const j = new THREE.Group();
    if (i > 0) j.position.x = 0.16;
    const blade = mesh(new THREE.BoxGeometry(0.17, 0.03, 0.34 - i * 0.03), leaf);
    blade.position.x = 0.08;
    j.add(blade);
    parent.add(j);
    joints.push(j);
    parent = j;
  }
  return { root, joints };
}

export function terrace(radius: number, seed: number): DioramaParts {
  const group = plinth(radius, 2.2, seed);
  group.add(grass(radius, 200, seed, [{ x: 0.8, z: -0.5, r: 0.8 }]));
  const cliff = boulder(1.15, seed + 3, 0.6);
  cliff.scale.set(1.3, 2.1, 0.75);
  cliff.position.set(-0.9, 0, -1.5);
  group.add(cliff);
  // Wind vane: a tall mast with four cloth sails that drive the basket lift.
  const mast = post(2.4, 0.7);
  mast.position.set(1.2, 0, -1.0);
  const hub = new THREE.Group();
  hub.position.set(1.2, 2.3, -0.9);
  const cloth = solid("#e5dcc4", 0.95);
  for (let i = 0; i < 4; i++) {
    const arm = new THREE.Group();
    arm.rotation.z = (i * Math.PI) / 2;
    const sail = mesh(new THREE.BoxGeometry(0.7, 0.22, 0.02), cloth);
    sail.position.x = 0.4;
    arm.add(sail);
    hub.add(arm);
  }
  group.add(mast, hub);
  // Basket lift on a rope running up and out of the diorama towards the tarn.
  const rope = mesh(
    new THREE.CylinderGeometry(0.012, 0.012, 3.6, 5),
    solid("#c9b58a", 0.9),
    "none",
  );
  rope.position.set(1.2, 2.0, -0.4);
  rope.rotation.x = -0.35;
  const basket = mesh(new THREE.CylinderGeometry(0.2, 0.16, 0.22, 10), wood("bark", 1.2, [2, 0.5]));
  group.add(rope, basket);
  // Fern stair: fronds sprouting from the cliff face at rising heights.
  const ferns = [0, 1, 2, 3].map((i) => {
    const f = frond(5);
    f.root.position.set(-1.35 + i * 0.12, 0.35 + i * 0.5, -1.05 + i * 0.04);
    f.root.rotation.y = -0.2 - i * 0.1;
    group.add(f.root);
    return f;
  });
  const seat = log(1.1, 0.16, seed + 9);
  seat.position.set(0.5, 0.15, 1.3);
  group.add(seat);
  let lift = 0;
  let spin = 0;
  return {
    group,
    stand: new THREE.Vector3(0.1, 0, 0.6),
    fogHeight: 1.2,
    fogSpread: 1.4,
    update(dt, time, calm, lv) {
      spin += dt * lv.wind * (calm ? 1 : 3);
      hub.rotation.z = spin;
      lift += dt * lv.wind * 0.35 * (calm ? 0.3 : 1);
      const t = (Math.sin(lift * Math.PI) + 1) / 2;
      basket.position.set(1.2, 0.35 + t * 2.8, -0.2 - t * 1.0);
      ferns.forEach((f, i) => {
        const curl = 1 - lv.rain;
        f.joints.forEach((j, k) => {
          j.rotation.z = curl * (0.9 + k * 0.12) + (calm ? 0 : Math.sin(time * 1.5 + i + k) * 0.02);
        });
      });
    },
  };
}

export function tarn(radius: number, seed: number): DioramaParts {
  // The tarn sits in a basin it has worn into the turf, with a damp margin.
  const group = plinth(radius, 1.6, seed, (x, z) => {
    const d = Math.hypot(x - 0.2, z + 0.3);
    const t = (a: number, b: number) => {
      const k = Math.min(1, Math.max(0, (d - a) / (b - a)));
      return k * k * (3 - 2 * k);
    };
    return { depth: 0.1 * t(1.72, 1.38), wet: t(1.98, 1.6) };
  });
  group.add(grass(radius, 140, seed, [{ x: 0.2, z: -0.3, r: 1.6 }]));
  const bed = mesh(new THREE.CircleGeometry(1.5, 48), pebbles([3, 3]), "receive");
  bed.rotation.x = -Math.PI / 2;
  bed.position.set(0.2, -0.085, -0.3);
  group.add(bed);
  const pool = water(3.1, 3.1, true, 0.15);
  pool.mesh.position.set(0.2, -0.03, -0.3);
  group.add(pool.mesh);
  const jetty = mesh(new THREE.BoxGeometry(0.5, 0.06, 0.9), wood("planks", 1, [0.5, 0.9]));
  jetty.position.set(-0.6, 0.1, 1.0);
  group.add(jetty);
  // The leaf ferry: a broad leaf hull with a little sail.
  const shape = new THREE.Shape();
  shape.moveTo(0, -0.45);
  shape.quadraticCurveTo(0.34, 0, 0, 0.5);
  shape.quadraticCurveTo(-0.34, 0, 0, -0.45);
  const hull = new THREE.ExtrudeGeometry(shape, {
    depth: 0.06,
    bevelEnabled: true,
    bevelSize: 0.02,
    bevelThickness: 0.02,
  });
  hull.rotateX(-Math.PI / 2);
  const ferry = new THREE.Group();
  ferry.add(mesh(hull, solid("#7aa04a", 0.6)));
  const sail = mesh(new THREE.ConeGeometry(0.2, 0.5, 3), solid("#efe6cf", 0.9));
  sail.scale.z = 0.15;
  sail.position.y = 0.32;
  ferry.add(sail);
  group.add(ferry);
  // Lane posts across the tarn; mist hides them.
  const bulbMat = new THREE.MeshStandardMaterial({
    color: "#ffd9a0",
    emissive: PALETTE.lantern,
    emissiveIntensity: 0,
    transparent: true,
  });
  const lane: THREE.Object3D[] = [];
  for (let i = 0; i < 4; i++) {
    const p = post(0.55, 0.7);
    const bulb = mesh(new THREE.SphereGeometry(0.06, 8, 6), bulbMat, "none");
    bulb.position.y = 0.6;
    const g = new THREE.Group();
    g.add(p, bulb);
    g.position.set(0.8 - i * 0.2, -0.1, 0.3 - i * 0.55);
    lane.push(g);
    group.add(g);
  }
  const r = rng(seed);
  for (let i = 0; i < 8; i++) {
    const s = stone(0.2 + r() * 0.12, seed + i, 0.7);
    const a = r() * Math.PI * 2;
    s.position.set(0.2 + Math.cos(a) * 1.58, -0.03, -0.3 + Math.sin(a) * 1.58);
    group.add(s);
  }
  let sailT = 0;
  return {
    group,
    stand: new THREE.Vector3(-1.2, 0, 1.1),
    fogHeight: 1.0,
    fogSpread: 1.8,
    update(dt, time, calm, lv) {
      pool.update(time, lv.rain);
      pool.mesh.position.y = -0.03 + lv.rain * 0.05;
      const clear = 1 - lv.fog;
      const open = lv.wind * clear;
      bulbMat.opacity = clear;
      bulbMat.emissiveIntensity = open * 2.2;
      for (const g of lane) g.visible = clear > 0.03;
      sailT += dt * open * (calm ? 0.1 : 0.35);
      const t = (Math.sin(sailT * Math.PI - Math.PI / 2) + 1) / 2;
      ferry.position.set(
        -0.3 + t * 1.3,
        -0.01 + (calm ? 0 : Math.sin(time * 1.4) * 0.015),
        0.6 - t * 2.0,
      );
      ferry.rotation.y = 0.6 + (calm ? 0 : Math.sin(time * 0.9) * 0.05);
      sail.scale.x = 0.4 + lv.wind * 0.6;
    },
  };
}
