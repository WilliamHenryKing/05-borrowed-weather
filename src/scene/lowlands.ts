// The lower trail: Wool Gate, Fog Ford and Cairn Hollow.

import * as THREE from "three";
import { assets, type Scan } from "./assets";
import type { DioramaParts } from "./diorama";
import { FogVolume } from "./fog";
import { mesh, rng, solid } from "./kit";
import { boulder, flowers, grass, log, pebbles, plinth, post, sheep, stone, wood } from "./props";
import { water } from "./water";

export function gate(radius: number, seed: number): DioramaParts {
  const group = plinth(radius, 1.6, seed);
  group.add(grass(radius, 260, seed, [{ x: 0, z: 0.6, r: 0.7 }]));
  // Sheep gate between two dry-stone wall stubs.
  const gateGroup = new THREE.Group();
  for (const x of [-0.7, 0.7]) {
    const p = post(1.05, 0.75);
    p.position.x = x;
    gateGroup.add(p);
  }
  for (const y of [0.3, 0.6, 0.9]) {
    const rail = mesh(new THREE.BoxGeometry(1.3, 0.07, 0.06), wood("planks", 1, [1, 0.1]));
    rail.position.y = y;
    gateGroup.add(rail);
  }
  const brace = mesh(new THREE.BoxGeometry(1.45, 0.07, 0.05), wood("planks", 1, [1, 0.1]));
  brace.position.y = 0.6;
  brace.rotation.z = 0.42;
  gateGroup.add(brace);
  gateGroup.position.set(0.4, 0, -1.1);
  gateGroup.rotation.y = -0.2;
  group.add(gateGroup);
  const r = rng(seed);
  for (const side of [-1, 1]) {
    for (let i = 0; i < 9; i++) {
      const s = stone(0.18 + r() * 0.08, seed + i * 7 + side, 0.5);
      s.position.set(
        0.4 + side * (0.95 + (i % 3) * 0.32),
        0.1 + Math.floor(i / 3) * 0.2,
        -1.1 - side * 0.12,
      );
      s.rotation.y = r() * 3;
      group.add(s);
    }
  }
  const seat = log(1.5, 0.2, seed + 11);
  seat.position.set(-0.7, 0.18, 0.9);
  seat.rotation.y = 0.35;
  group.add(seat, flowers(radius, 70, seed + 4));
  // The flock that the gate is for, grazing on the near side.
  const flock = [
    [-1.2, -0.3, 0.6],
    [-0.4, -0.2, 2.2],
    [1.3, -0.55, -2.4],
  ].map(([x, z, ry], i) => {
    const s = sheep(seed + i * 13);
    s.position.set(x ?? 0, 0, z ?? 0);
    s.rotation.y = ry ?? 0;
    group.add(s);
    return s;
  });
  // A puddle fed by the shower: it shrinks when the rain is bottled.
  const puddle = water(1.2, 0.8, true, 0);
  puddle.mesh.position.set(0.9, 0.04, 1.2);
  group.add(puddle.mesh);
  // A signpost pointing up the trail.
  const sign = post(1.2);
  sign.position.set(1.5, 0, 0.6);
  const board = mesh(new THREE.BoxGeometry(0.62, 0.16, 0.05), wood("planks", 1.1, [0.5, 0.15]));
  board.position.set(1.72, 1.02, 0.6);
  board.rotation.z = 0.08;
  group.add(sign, board);
  return {
    group,
    stand: new THREE.Vector3(0.3, 0, 0.3),
    fogHeight: 1.2,
    fogSpread: radius * 0.8,
    update(_dt, time, calm, lv) {
      puddle.update(time, lv.rain);
      const wet = 0.35 + lv.rain * 0.65;
      puddle.mesh.scale.set(wet, 1, wet);
      flock.forEach((s, i) => {
        s.rotation.z = calm ? 0 : Math.max(0, Math.sin(time * 0.9 + i * 2.1)) * 0.12;
      });
    },
  };
}

export function ford(radius: number, seed: number): DioramaParts {
  const group = plinth(radius, 1.4, seed);
  group.add(
    grass(radius, 200, seed, [
      { x: 0, z: 0, r: 0.75 },
      { x: 1.2, z: 0, r: 0.7 },
      { x: -1.2, z: 0, r: 0.7 },
    ]),
  );
  // The beck: a band of dark, glossy water crossing the plinth.
  const bed = mesh(new THREE.BoxGeometry(1.0, 0.04, radius * 2 - 0.25), pebbles([1, 4]), "receive");
  bed.position.y = 0.01;
  const beck = water(1.0, radius * 2 - 0.25, false, 1);
  group.add(bed, beck.mesh);
  const r = rng(seed + 5);
  for (let i = 0; i < 12; i++) {
    const bank = stone(0.16 + r() * 0.1, seed + 30 + i, 0.8);
    const side = i % 2 === 0 ? -1 : 1;
    bank.position.set(side * (0.55 + r() * 0.15), 0.02, (r() - 0.5) * radius * 1.8);
    group.add(bank);
  }
  // Stepping stones, only visible with the fog bottled.
  // Flat-topped scanned rocks, pressed into the beck bed.
  const scans = assets().rocks;
  const first = scans[0] as Scan;
  const stoneMat = first.material.clone();
  stoneMat.transparent = true;
  const stones: THREE.Mesh[] = [];
  for (let i = 0; i < 4; i++) {
    const scan = scans[(i * 3 + 1) % scans.length] as Scan;
    const s = mesh(scan.geometry, stoneMat);
    const k = 0.2 / scan.radius;
    s.scale.set(k, k * 0.45, k);
    s.rotation.y = i * 1.9;
    s.position.set(-0.75 + i * 0.5, 0.06, 0.25 + Math.sin(i * 1.7) * 0.18);
    stones.push(s);
    group.add(s);
  }
  return {
    group,
    stand: new THREE.Vector3(-1.4, 0, 0.5),
    fogHeight: 1.3,
    fogSpread: 1.9,
    update(_dt, time, calm, lv) {
      beck.update(time, lv.rain);
      beck.mesh.position.y = 0.05 + lv.rain * 0.07;
      const shown = 1 - lv.fog;
      stoneMat.opacity = shown;
      stones.forEach((s, i) => {
        s.visible = shown > 0.02;
        s.position.y = -0.1 + shown * 0.16 + (calm ? 0 : Math.sin(time * 1.3 + i) * 0.006);
      });
    },
  };
}

export function hollow(radius: number, seed: number): DioramaParts {
  const group = plinth(radius, 1.8, seed);
  group.add(grass(radius, 220, seed, [{ x: 0, z: 0.1, r: 1.0 }]));
  // The ledge behind the hollow, too tall to climb.
  const ledge = boulder(1.05, seed + 2, 0.55);
  ledge.scale.set(1.35, 1.5, 0.9);
  ledge.position.set(0.1, 0, -1.5);
  group.add(ledge);
  // The dip itself and the ring of marker cairns with pale spiral marks.
  const dip = mesh(new THREE.CircleGeometry(0.65, 28), solid("#2f3a24", 1), "receive");
  dip.rotation.x = -Math.PI / 2;
  dip.position.set(0, 0.03, 0.1);
  group.add(dip);
  const r = rng(seed);
  for (let i = 0; i < 7; i++) {
    const a = (i / 7) * Math.PI * 2;
    const cairn = new THREE.Group();
    for (let k = 0; k < 3; k++) {
      const s = stone(0.13 - k * 0.03, seed + i * 5 + k, 0.35);
      s.position.y = 0.06 + k * 0.12;
      s.rotation.y = r() * 3;
      cairn.add(s);
    }
    const mark = mesh(new THREE.TorusGeometry(0.05, 0.012, 4, 12), solid("#e9e4cf", 0.6), "none");
    mark.position.set(0, 0.12, 0.12);
    cairn.add(mark);
    cairn.position.set(Math.cos(a) * 0.95, 0, 0.1 + Math.sin(a) * 0.95);
    cairn.lookAt(0, 0, 0.1);
    group.add(cairn);
  }
  // The cloud step: released fog gathers in the hollow as a thick, brighter cushion.
  const cloud = new FogVolume({
    radius: 0.95,
    height: 0.8,
    layers: 8,
    density: 1.15,
    billboards: 8,
    seed: seed + 9,
    tint: "#f6f8f6",
  });
  cloud.group.position.set(0, 0.05, -0.2);
  group.add(cloud.group);
  return {
    group,
    stand: new THREE.Vector3(1.1, 0, 1.0),
    fogHeight: 0.5,
    fogSpread: 0.5,
    update(_dt, time, calm, lv) {
      cloud.setLevel(lv.fog);
      cloud.update(time, calm ? 0.2 : 1);
      cloud.group.position.y = 0.05 + (calm ? 0 : Math.sin(time * 0.8) * 0.03);
    },
  };
}
