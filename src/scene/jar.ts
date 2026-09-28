// The hiker's glass jar and what swirls inside it: a curl of fog, drops of rain pattering
// inside the glass, or streaks of wind chasing round. It gulps on capture and release.

import gsap from "gsap";
import * as THREE from "three";
import type { Weather } from "../game/world";
import { noisyPuffTexture } from "./fog";
import { mesh, solid } from "./kit";

const H = 0.22;
const R = 0.085;

export class Jar {
  readonly group = new THREE.Group();
  private readonly fog: THREE.Sprite[] = [];
  private readonly fogMat: THREE.SpriteMaterial;
  private readonly drops: THREE.Mesh[] = [];
  private readonly rings: THREE.Mesh[] = [];
  private kind: Weather | null = null;
  private fill = 0;

  constructor() {
    const glass = mesh(
      new THREE.CylinderGeometry(R, R, H, 18, 1, true),
      new THREE.MeshPhysicalMaterial({
        color: "#e8f2f0",
        roughness: 0.08,
        transmission: 0.55,
        transparent: true,
        opacity: 0.35,
        side: THREE.DoubleSide,
        depthWrite: false,
      }),
      "none",
    );
    glass.renderOrder = 6;
    const lid = mesh(
      new THREE.CylinderGeometry(R + 0.008, R + 0.008, 0.04, 18),
      solid("#b58a45", 0.5),
    );
    lid.position.y = H / 2 + 0.02;
    const base = mesh(new THREE.CircleGeometry(R, 18), solid("#cfd9d6", 0.3), "none");
    base.rotation.x = -Math.PI / 2;
    base.position.y = -H / 2 + 0.002;
    this.group.add(glass, lid, base);

    this.fogMat = new THREE.SpriteMaterial({
      map: noisyPuffTexture(),
      color: "#f2f5f3",
      transparent: true,
      opacity: 0,
      depthWrite: false,
    });
    for (let i = 0; i < 5; i++) {
      const s = new THREE.Sprite(this.fogMat);
      s.scale.setScalar(0.12);
      s.renderOrder = 5;
      this.fog.push(s);
      this.group.add(s);
    }
    const dropMat = solid("#7fb8d8", 0.2);
    for (let i = 0; i < 7; i++) {
      const d = mesh(new THREE.SphereGeometry(0.011, 6, 5), dropMat, "none");
      d.scale.y = 2.2;
      this.drops.push(d);
      this.group.add(d);
    }
    const water = mesh(new THREE.CylinderGeometry(R * 0.95, R * 0.95, 0.03, 16), dropMat, "none");
    water.position.y = -H / 2 + 0.016;
    this.drops.push(water);
    this.group.add(water);
    const streak = new THREE.MeshBasicMaterial({
      color: "#f3e7b8",
      transparent: true,
      opacity: 0.85,
    });
    for (let i = 0; i < 3; i++) {
      const ring = mesh(
        new THREE.TorusGeometry(R * (0.45 + i * 0.15), 0.005, 4, 20, Math.PI * 1.2),
        streak,
        "none",
      );
      ring.rotation.x = Math.PI / 2 + (i - 1) * 0.35;
      ring.position.y = (i - 1) * 0.05;
      this.rings.push(ring);
      this.group.add(ring);
    }
    this.show(null);
  }

  private show(kind: Weather | null): void {
    for (const s of this.fog) s.visible = kind === "fog";
    for (const d of this.drops) d.visible = kind === "rain";
    for (const r of this.rings) r.visible = kind === "wind";
  }

  /** Change the contents; `animate` plays the capture or release gulp. */
  set(kind: Weather | null, animate: boolean, calm = false): void {
    if (kind === this.kind) return;
    const capture = kind !== null;
    this.kind = kind ?? this.kind;
    gsap.killTweensOf(this);
    gsap.killTweensOf(this.group.scale);
    if (!animate) {
      this.kind = kind;
      this.fill = kind ? 1 : 0;
      this.show(kind);
      this.group.scale.setScalar(1);
      return;
    }
    this.show(this.kind);
    gsap.to(this, {
      fill: capture ? 1 : 0,
      duration: 0.9,
      ease: capture ? "power2.out" : "power2.in",
      onComplete: () => {
        this.kind = kind;
        this.show(kind);
      },
    });
    if (calm) return;
    gsap.fromTo(
      this.group.scale,
      { x: 1, y: 1, z: 1 },
      { x: 1.35, y: 1.25, z: 1.35, duration: 0.18, yoyo: true, repeat: 1, ease: "sine.out" },
    );
  }

  update(time: number, calm: boolean): void {
    const m = calm ? 0.2 : 1;
    const f = this.fill;
    this.fogMat.opacity = f * 0.9;
    this.fog.forEach((s, i) => {
      const a = time * 1.4 * m + (i / this.fog.length) * Math.PI * 2;
      s.position.set(Math.cos(a) * R * 0.45, -0.05 + i * 0.025 * f, Math.sin(a) * R * 0.45);
      s.scale.setScalar(0.06 + f * 0.08);
    });
    this.drops.forEach((d, i) => {
      if (i === this.drops.length - 1) {
        d.scale.set(1, 0.2 + f, 1);
        return;
      }
      const t = (time * 0.9 * m + i * 0.37) % 1;
      const a = i * 2.4;
      d.position.set(Math.cos(a) * R * 0.5, H / 2 - 0.02 - t * (H - 0.04), Math.sin(a) * R * 0.5);
      d.scale.setScalar(f);
      d.scale.y = 2.2 * f;
    });
    this.rings.forEach((r, i) => {
      r.rotation.z = time * (3 + i) * m * (i % 2 ? -1 : 1);
      r.scale.setScalar(0.3 + f * 0.7);
    });
  }
}
