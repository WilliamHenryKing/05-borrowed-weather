// Depth behind the trail: hazy islands floating in the distance, slow clouds, and the cloud
// sea that the Lantern Shelter rises out of.

import * as THREE from "three";
import { noisyPuffTexture } from "./fog";
import { rng } from "./kit";
import { plinth } from "./props";

interface Drifter {
  sprite: THREE.Sprite;
  speed: number;
  span: number;
  x0: number;
  min: number;
}

export class Backdrop {
  readonly group = new THREE.Group();
  private readonly drifters: Drifter[] = [];

  /** `centre` is the middle of the trail; `summit` the shelter the cloud sea surrounds. */
  constructor(centre: THREE.Vector3, summit: THREE.Vector3) {
    const r = rng(41);
    // Distant islands built like the near ones, softened by aerial perspective.
    for (let i = 0; i < 16; i++) {
      const a = -Math.PI * 0.95 + r() * Math.PI * 0.9;
      const d = 38 + r() * 22;
      const radius = 1.6 + r() * 2.8;
      const depth = radius * (0.9 + r() * 0.6);
      const island = plinth(radius, depth, 200 + i * 7);
      island.position.set(
        centre.x + Math.cos(a) * d,
        centre.y - 9 + r() * 9,
        centre.z + Math.sin(a) * d,
      );
      island.rotation.y = r() * Math.PI;
      this.group.add(island);
    }
    const puff = noisyPuffTexture();
    // Slow high clouds.
    const cloudMat = new THREE.SpriteMaterial({
      map: puff,
      color: "#f4efe4",
      transparent: true,
      opacity: 0.75,
      depthWrite: false,
      fog: false,
    });
    for (let i = 0; i < 12; i++) {
      const s = new THREE.Sprite(cloudMat);
      const k = 8 + r() * 10;
      s.scale.set(k * 2, k * 0.7, 1);
      const x0 = centre.x - 40 + r() * 80;
      s.position.set(x0, centre.y + 6 + r() * 14, centre.z - 45 - r() * 20);
      this.drifters.push({ sprite: s, speed: 0.15 + r() * 0.25, span: 90, x0, min: centre.x - 45 });
      this.group.add(s);
    }
    // The cloud sea around the summit, below the shelter.
    const seaMat = new THREE.SpriteMaterial({
      map: puff,
      color: "#eef0ea",
      transparent: true,
      opacity: 0.9,
      depthWrite: false,
    });
    for (let i = 0; i < 46; i++) {
      const a = -0.2 + r() * Math.PI * 1.35;
      const d = 3.6 + r() * 9;
      const s = new THREE.Sprite(seaMat);
      s.position.set(
        summit.x + Math.cos(a) * d,
        summit.y - 2.5 + r() * 1.1,
        summit.z - Math.sin(a) * d,
      );
      const k = 3 + r() * 4;
      s.scale.set(k * 1.6, k * 0.6, 1);
      this.drifters.push({
        sprite: s,
        speed: 0.05 + r() * 0.05,
        span: 0,
        x0: s.position.x,
        min: 0,
      });
      this.group.add(s);
    }
  }

  update(time: number, calm: boolean): void {
    const m = calm ? 0.2 : 1;
    for (const d of this.drifters) {
      if (d.span > 0) {
        d.sprite.position.x = d.min + ((d.x0 - d.min + time * d.speed * m) % d.span);
      } else {
        d.sprite.position.x = d.x0 + Math.sin(time * d.speed * m) * 0.6;
      }
    }
  }
}
