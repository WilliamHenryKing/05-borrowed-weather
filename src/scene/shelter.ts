// The Lantern Shelter at the summit: a stone hut, three weather instruments and the warm
// payoff. Each instrument wakes when its weather is released here; windows, a garland of
// lanterns and the door light fill with each one, and embers rise when all three are awake.

import * as THREE from "three";
import type { DioramaParts } from "./diorama";
import { mesh, PALETTE, puffTexture, rng, solid } from "./kit";
import { flowers, grass, log, plinth, post, stone } from "./props";

const KINDS = ["fog", "rain", "wind"] as const;

export function shelter(radius: number, seed: number): DioramaParts {
  const group = plinth(radius, 2.4, seed);
  group.add(grass(radius, 160, seed, [{ x: 0, z: -0.6, r: 1.1 }]), flowers(radius, 30, seed + 2));
  // The hut: thick stone walls, a turf roof, a door and two small windows.
  const hut = new THREE.Group();
  const walls = stone(0.75, seed + 4, 0.4);
  walls.scale.set(1.3, 1.25, 1.1);
  walls.position.y = 0.55;
  const door = mesh(new THREE.BoxGeometry(0.34, 0.6, 0.05), solid("#2a1f18", 1), "none");
  door.position.set(0, 0.32, 0.72);
  const roof = mesh(new THREE.ConeGeometry(1.25, 0.8, 4), solid("#5c6e3c", 1));
  roof.rotation.y = Math.PI / 4;
  roof.position.y = 1.45;
  const windowMat = new THREE.MeshStandardMaterial({
    color: "#3a2a1c",
    emissive: PALETTE.lantern,
    emissiveIntensity: 0,
  });
  const panes = [-0.45, 0.45].map((x) => {
    const pane = mesh(new THREE.BoxGeometry(0.2, 0.2, 0.04), windowMat, "none");
    pane.position.set(x, 0.72, 0.66);
    return pane;
  });
  hut.add(walls, door, roof, ...panes);
  hut.position.set(0, 0, -0.6);
  group.add(hut);
  const lanternMat = new THREE.MeshStandardMaterial({
    color: "#ffe2b0",
    emissive: PALETTE.lantern,
    emissiveIntensity: 0.2,
  });
  const lantern = mesh(new THREE.SphereGeometry(0.09, 12, 10), lanternMat, "none");
  lantern.position.set(0.3, 0.95, 0.22);
  const glow = new THREE.PointLight(PALETTE.lantern, 0, 6, 1.4);
  glow.position.copy(lantern.position).add(new THREE.Vector3(0, 0.2, 0.4));
  group.add(lantern, glow);

  // A garland of little lanterns strung from the hut to the vane post: one lamp per
  // instrument lights, and the rest come on together when all three are awake.
  const garland: THREE.MeshStandardMaterial[] = [];
  const from = new THREE.Vector3(0.6, 1.25, 0.05);
  const to = new THREE.Vector3(1.2, 1.15, 0.3);
  for (let i = 0; i < 7; i++) {
    const t = (i + 1) / 8;
    const p = from.clone().lerp(to, t);
    p.y -= Math.sin(t * Math.PI) * 0.18;
    const m = new THREE.MeshStandardMaterial({
      color: "#f3d9a8",
      emissive: i % 2 ? "#ffb45e" : "#ffd27a",
      emissiveIntensity: 0,
    });
    const bulb = mesh(new THREE.SphereGeometry(0.035, 8, 6), m, "none");
    bulb.position.copy(p);
    group.add(bulb);
    garland.push(m);
  }

  // Instruments: wind vane cups, rain gauge and the cloud glass, each with a soft halo.
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
  const coreMat = new THREE.MeshStandardMaterial({
    color: "#ffffff",
    emissive: "#c9d8e0",
    emissiveIntensity: 0,
    transparent: true,
    opacity: 0.1,
  });
  const orbCore = mesh(new THREE.SphereGeometry(0.12, 14, 10), coreMat, "none");
  orbCore.position.copy(orb.position);
  const stand = post(0.46, PALETTE.woodDark);
  stand.position.set(-0.7, 0, 1.0);
  const seat = log(0.9, 0.14, seed + 3);
  seat.position.set(0.9, 0.14, 1.3);
  seat.rotation.y = -0.5;
  group.add(vanePost, vane, gauge, gaugeWater, orb, orbCore, stand, seat);

  const puff = puffTexture();
  const halos = [orb.position, gauge.position, vane.position].map((p, i) => {
    const m = new THREE.SpriteMaterial({
      map: puff,
      color: ["#dfeaf0", "#9fd0ec", "#ffe6a8"][i],
      transparent: true,
      opacity: 0,
      depthWrite: false,
      blending: THREE.AdditiveBlending,
    });
    const s = new THREE.Sprite(m);
    s.position.copy(p);
    s.scale.setScalar(0.9);
    group.add(s);
    return m;
  });

  // Embers drifting up from the lantern once the whole shelter is awake.
  const r = rng(seed);
  const emberMat = new THREE.SpriteMaterial({
    map: puff,
    color: "#ffc774",
    transparent: true,
    opacity: 0,
    depthWrite: false,
    blending: THREE.AdditiveBlending,
  });
  const embers = Array.from({ length: 16 }, () => {
    const s = new THREE.Sprite(emberMat);
    s.scale.setScalar(0.08 + r() * 0.06);
    group.add(s);
    return { s, phase: r(), x: (r() - 0.5) * 1.6, z: (r() - 0.5) * 1.2 };
  });

  const shown = { fog: 0, rain: 0, wind: 0 };
  let spin = 0;
  return {
    group,
    stand: new THREE.Vector3(0.1, 0, 1.2),
    fogHeight: 0.6,
    fogSpread: 1.2,
    update(dt, time, calm, _lv, state) {
      const ease = 1 - Math.exp(-dt * 1.8);
      for (const k of KINDS) shown[k] += ((state.restored.includes(k) ? 1 : 0) - shown[k]) * ease;
      spin += dt * shown.wind * (calm ? 0.6 : 4);
      vane.rotation.y = spin;
      gaugeWater.scale.y = 0.04 + shown.rain * 0.96;
      gaugeWater.position.y = 0.01 + gaugeWater.scale.y * 0.24;
      coreMat.opacity = 0.1 + shown.fog * 0.75;
      coreMat.emissiveIntensity = shown.fog * (0.6 + (calm ? 0 : Math.sin(time * 1.2) * 0.1));
      KINDS.forEach((k, i) => {
        const m = halos[i];
        if (m) m.opacity = shown[k] * (0.45 + (calm ? 0 : Math.sin(time * 1.6 + i) * 0.1));
      });
      const lit = (shown.fog + shown.rain + shown.wind) / 3;
      const done = state.finished ? 1 : 0;
      lanternMat.emissiveIntensity = 0.2 + lit * 3.5;
      windowMat.emissiveIntensity = lit * 1.6;
      glow.intensity = lit * 4 + done * 3;
      garland.forEach((m, i) => {
        const on = i < state.restored.length * 2 || state.finished ? 1 : 0;
        const flicker = calm ? 1 : 0.85 + Math.sin(time * 5 + i * 1.7) * 0.15;
        m.emissiveIntensity += (on * 2.4 * flicker - m.emissiveIntensity) * ease;
      });
      emberMat.opacity += (done * 0.9 - emberMat.opacity) * ease;
      for (const e of embers) {
        const t = (time * (calm ? 0.05 : 0.18) + e.phase) % 1;
        e.s.position.set(e.x + Math.sin(t * 6 + e.phase * 9) * 0.15, 0.6 + t * 2.4, e.z);
        e.s.visible = done > 0;
      }
    },
  };
}
