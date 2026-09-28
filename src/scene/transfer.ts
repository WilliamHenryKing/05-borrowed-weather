// Capture and release: wisps of fog, drops of rain or streaks of wind spiral from the
// place into the jar when taken, and spill back out of it when released.

import * as THREE from "three";
import type { Weather } from "../game/world";
import { noisyPuffTexture } from "./fog";
import { puffTexture, rng } from "./kit";

const COUNT = 36;
const COLOR: Record<Weather, string> = { fog: "#eef2f0", rain: "#8cc4e4", wind: "#f4e6b0" };

interface Wisp {
  sprite: THREE.Sprite;
  from: THREE.Vector3;
  delay: number;
  turns: number;
  radius: number;
  size: THREE.Vector2;
}

export class Transfer {
  readonly group = new THREE.Group();
  private readonly wisps: Wisp[] = [];
  private readonly mats: Record<Weather, THREE.SpriteMaterial>;
  private readonly jar = new THREE.Vector3();
  private t = 1;
  private inward = true;
  private duration = 1.3;
  private readonly r = rng(77);

  constructor() {
    const soft = noisyPuffTexture();
    const bead = puffTexture();
    const make = (k: Weather) =>
      new THREE.SpriteMaterial({
        map: k === "fog" ? soft : bead,
        color: COLOR[k],
        transparent: true,
        opacity: 0,
        depthWrite: false,
      });
    this.mats = { fog: make("fog"), rain: make("rain"), wind: make("wind") };
    for (let i = 0; i < COUNT; i++) {
      const sprite = new THREE.Sprite(this.mats.fog);
      sprite.visible = false;
      sprite.renderOrder = 8;
      this.wisps.push({
        sprite,
        from: new THREE.Vector3(),
        delay: 0,
        turns: 1,
        radius: 0.5,
        size: new THREE.Vector2(),
      });
      this.group.add(sprite);
    }
  }

  /** Start a swirl between the area around `centre` and the jar at `jar`. */
  burst(kind: Weather, centre: THREE.Vector3, jar: THREE.Vector3, inward: boolean, calm: boolean) {
    this.jar.copy(jar);
    this.inward = inward;
    this.t = 0;
    this.duration = calm ? 0.7 : 1.4;
    const r = this.r;
    const n = calm ? 10 : COUNT;
    this.wisps.forEach((w, i) => {
      w.sprite.material = this.mats[kind];
      w.sprite.visible = i < n;
      const a = r() * Math.PI * 2;
      const d = 0.6 + r() * 1.4;
      w.from.set(
        centre.x + Math.cos(a) * d,
        centre.y + 0.1 + r() * 1.2,
        centre.z + Math.sin(a) * d,
      );
      w.delay = r() * 0.35;
      w.turns = calm ? 0 : 1 + r() * 1.2;
      w.radius = 0.2 + r() * 0.4;
      const s = kind === "fog" ? 0.5 + r() * 0.5 : kind === "rain" ? 0.07 : 0.12;
      w.size.set(kind === "wind" ? s * 3 : s, kind === "rain" ? s * 2.4 : s);
    });
  }

  update(dt: number): void {
    if (this.t >= 1) {
      this.group.visible = false;
      return;
    }
    this.group.visible = true;
    this.t = Math.min(1, this.t + dt / this.duration);
    const opacity = Math.sin(this.t * Math.PI) * 0.9;
    for (const m of Object.values(this.mats)) m.opacity = opacity;
    for (const w of this.wisps) {
      if (!w.sprite.visible) continue;
      const local = Math.min(1, Math.max(0, (this.t - w.delay) / (1 - w.delay)));
      const smooth = local * local * (3 - 2 * local);
      const e = this.inward ? smooth : 1 - smooth;
      const p = w.sprite.position.copy(w.from).lerp(this.jar, e);
      const spin = (1 - e) * w.radius;
      const a = e * w.turns * Math.PI * 2 + w.delay * 20;
      p.x += Math.cos(a) * spin;
      p.z += Math.sin(a) * spin;
      const k = 0.3 + (1 - e) * 0.7;
      w.sprite.scale.set(w.size.x * k, w.size.y * k, 1);
    }
  }
}
