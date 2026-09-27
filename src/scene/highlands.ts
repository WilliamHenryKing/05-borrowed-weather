// The upper trail: Vane Terrace, High Tarn and the Lantern Shelter.

import * as THREE from "three";
import type { DioramaParts } from "./diorama";
import { mesh, PALETTE, rng, solid } from "./kit";
import { grass, log, plinth, post, stone } from "./props";

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
  const cliff = stone(1.1, seed + 3, 0.6);
  cliff.scale.set(1.4, 2.4, 0.7);
  cliff.position.set(-0.9, 1.1, -1.5);
  group.add(cliff);
  // Wind vane: a tall mast with four cloth sails that drive the basket lift.
  const mast = post(2.4, PALETTE.woodDark);
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
  const basket = mesh(new THREE.CylinderGeometry(0.2, 0.16, 0.22, 10), solid("#9b6f3e", 0.9));
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
  const group = plinth(radius, 1.6, seed);
  group.add(grass(radius, 140, seed, [{ x: 0.2, z: -0.3, r: 1.6 }]));
  const water = mesh(
    new THREE.CircleGeometry(1.55, 40),
    new THREE.MeshStandardMaterial({ color: "#35606a", roughness: 0.08, metalness: 0.2 }),
    "receive",
  );
  water.rotation.x = -Math.PI / 2;
  water.position.set(0.2, 0.03, -0.3);
  group.add(water);
  const jetty = mesh(new THREE.BoxGeometry(0.5, 0.06, 0.9), solid(PALETTE.wood, 0.9));
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
    const p = post(0.55, PALETTE.woodDark);
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
    s.position.set(0.2 + Math.cos(a) * 1.6, 0.02, -0.3 + Math.sin(a) * 1.6);
    group.add(s);
  }
  let sailT = 0;
  return {
    group,
    stand: new THREE.Vector3(-1.2, 0, 1.1),
    fogHeight: 0.9,
    fogSpread: 1.3,
    update(dt, time, calm, lv) {
      const clear = 1 - lv.fog;
      const open = lv.wind * clear;
      bulbMat.opacity = clear;
      bulbMat.emissiveIntensity = open * 2.2;
      for (const g of lane) g.visible = clear > 0.03;
      sailT += dt * open * (calm ? 0.1 : 0.35);
      const t = (Math.sin(sailT * Math.PI - Math.PI / 2) + 1) / 2;
      ferry.position.set(
        -0.3 + t * 1.3,
        0.06 + (calm ? 0 : Math.sin(time * 1.4) * 0.015),
        0.6 - t * 2.0,
      );
      ferry.rotation.y = 0.6 + (calm ? 0 : Math.sin(time * 0.9) * 0.05);
      sail.scale.x = 0.4 + lv.wind * 0.6;
    },
  };
}

export function shelter(radius: number, seed: number): DioramaParts {
  const group = plinth(radius, 2.4, seed);
  group.add(grass(radius, 160, seed, [{ x: 0, z: -0.6, r: 1.1 }]));
  // The hut: thick stone walls, a turf roof and a lantern by the door.
  const hut = new THREE.Group();
  const walls = stone(0.75, seed + 4, 0.4);
  walls.scale.set(1.3, 1.25, 1.1);
  walls.position.y = 0.55;
  const door = mesh(new THREE.BoxGeometry(0.34, 0.6, 0.05), solid("#2a1f18", 1), "none");
  door.position.set(0, 0.32, 0.72);
  const roof = mesh(new THREE.ConeGeometry(1.25, 0.8, 4), solid("#5c6e3c", 1));
  roof.rotation.y = Math.PI / 4;
  roof.position.y = 1.45;
  hut.add(walls, door, roof);
  hut.position.set(0, 0, -0.6);
  group.add(hut);
  const lanternMat = new THREE.MeshStandardMaterial({
    color: "#ffe2b0",
    emissive: PALETTE.lantern,
    emissiveIntensity: 0.2,
  });
  const lantern = mesh(new THREE.SphereGeometry(0.09, 12, 10), lanternMat, "none");
  lantern.position.set(0.3, 0.95, 0.22);
  const glow = new THREE.PointLight(PALETTE.lantern, 0, 4, 1.6);
  glow.position.copy(lantern.position);
  group.add(lantern, glow);
  // Instruments: wind vane cups, rain gauge and the cloud glass.
  const vane = new THREE.Group();
  const cupMat = solid("#b58a45", 0.4);
  for (let i = 0; i < 3; i++) {
    const arm = mesh(new THREE.BoxGeometry(0.28, 0.02, 0.02), cupMat, "none");
    arm.position.x = 0.14;
    const cup = mesh(new THREE.SphereGeometry(0.05, 8, 6, 0, Math.PI), cupMat, "none");
    cup.position.x = 0.28;
    const a = new THREE.Group();
    a.add(arm, cup);
    a.rotation.y = (i * Math.PI * 2) / 3;
    vane.add(a);
  }
  const vanePost = post(1.2, PALETTE.woodDark);
  vanePost.position.set(1.2, 0, 0.3);
  vane.position.set(1.2, 1.22, 0.3);
  const glassMat = new THREE.MeshPhysicalMaterial({
    color: "#dff0f0",
    roughness: 0.1,
    transmission: 0.5,
    transparent: true,
    opacity: 0.5,
  });
  const gauge = mesh(new THREE.CylinderGeometry(0.08, 0.08, 0.5, 14, 1, true), glassMat, "none");
  gauge.position.set(-1.1, 0.25, 0.5);
  const gaugeWater = mesh(
    new THREE.CylinderGeometry(0.07, 0.07, 0.48, 14),
    solid("#5f9fc0", 0.2),
    "none",
  );
  gaugeWater.position.set(-1.1, 0.01, 0.5);
  const orb = mesh(new THREE.SphereGeometry(0.16, 18, 14), glassMat, "none");
  orb.position.set(-0.7, 0.62, 1.0);
  const orbCore = mesh(
    new THREE.SphereGeometry(0.12, 14, 10),
    new THREE.MeshStandardMaterial({
      color: "#ffffff",
      emissive: "#c9d8e0",
      emissiveIntensity: 0,
      transparent: true,
      opacity: 0.1,
    }),
    "none",
  );
  orbCore.position.copy(orb.position);
  const stand = post(0.46, PALETTE.woodDark);
  stand.position.set(-0.7, 0, 1.0);
  const seat = log(0.9, 0.14, seed + 3);
  seat.position.set(0.9, 0.14, 1.3);
  seat.rotation.y = -0.5;
  group.add(vanePost, vane, gauge, gaugeWater, orb, orbCore, stand, seat);
  const shown = { fog: 0, rain: 0, wind: 0 };
  let spin = 0;
  return {
    group,
    stand: new THREE.Vector3(0.1, 0, 1.2),
    fogHeight: 0.6,
    fogSpread: 1.2,
    update(dt, time, calm, _lv, state) {
      const ease = 1 - Math.exp(-dt * 1.8);
      for (const k of ["fog", "rain", "wind"] as const)
        shown[k] += ((state.restored.includes(k) ? 1 : 0) - shown[k]) * ease;
      spin += dt * shown.wind * (calm ? 0.6 : 4);
      vane.rotation.y = spin;
      gaugeWater.scale.y = 0.04 + shown.rain * 0.96;
      gaugeWater.position.y = 0.01 + gaugeWater.scale.y * 0.24;
      const core = orbCore.material as THREE.MeshStandardMaterial;
      core.opacity = 0.1 + shown.fog * 0.75;
      core.emissiveIntensity = shown.fog * (0.6 + (calm ? 0 : Math.sin(time * 1.2) * 0.1));
      const lit = (shown.fog + shown.rain + shown.wind) / 3;
      lanternMat.emissiveIntensity = 0.2 + lit * 3;
      glow.intensity = lit * 3.5;
    },
  };
}
