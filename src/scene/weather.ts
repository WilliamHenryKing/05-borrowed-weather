// Weather effects for one diorama: a fog bank, a small rain shower and a gusting breeze.
// Each fades in and out towards a target so taking and releasing reads as a soft change.

import * as THREE from "three";
import type { Weather } from "../game/world";
import { FogVolume, noisyPuffTexture } from "./fog";
import { PALETTE, rng } from "./kit";

const RAIN_DROPS = 220;
const WIND_STREAKS = 22;
const WIND_SEGS = 5;

export interface CellOptions {
  radius: number;
  /** Fog height above the plinth, and how spread out the bank is. */
  fogHeight: number;
  fogSpread: number;
  seed: number;
}

export class WeatherCell {
  readonly group = new THREE.Group();
  readonly level: Record<Weather, number> = { fog: 0, rain: 0, wind: 0 };
  private target: Record<Weather, number> = { fog: 0, rain: 0, wind: 0 };
  private readonly fog: FogVolume;
  private readonly cloudMat: THREE.SpriteMaterial;
  private readonly rain: THREE.LineSegments;
  private readonly rainPos: Float32Array;
  private readonly rainSpeed: Float32Array;
  private readonly wind: THREE.LineSegments;
  private readonly windPos: Float32Array;
  private readonly streaks: { y: number; z: number; offset: number; speed: number; amp: number }[] =
    [];

  constructor(private readonly opts: CellOptions) {
    const r = rng(opts.seed);
    this.fog = new FogVolume({
      radius: opts.fogSpread,
      height: opts.fogHeight,
      layers: 8,
      density: 0.85,
      billboards: 9,
      seed: opts.seed,
    });
    this.group.add(this.fog.group);

    // A small grey raincloud hovering over the shower.
    this.cloudMat = new THREE.SpriteMaterial({
      map: noisyPuffTexture(),
      color: "#8d9a9e",
      transparent: true,
      opacity: 0,
      depthWrite: false,
    });
    for (let i = 0; i < 9; i++) {
      const s = new THREE.Sprite(this.cloudMat);
      s.position.set((r() - 0.5) * 1.6, 3.1 + r() * 0.3, (r() - 0.5) * 1.1);
      s.scale.set(1.3 + r(), 0.8 + r() * 0.4, 1);
      this.group.add(s);
    }

    this.rainPos = new Float32Array(RAIN_DROPS * 6);
    this.rainSpeed = new Float32Array(RAIN_DROPS);
    for (let i = 0; i < RAIN_DROPS; i++) {
      const x = (r() - 0.5) * 2.2;
      const z = (r() - 0.5) * 1.6;
      const y = r() * 3;
      this.rainPos.set([x, y, z, x - 0.02, y - 0.16, z], i * 6);
      this.rainSpeed[i] = 3.2 + r() * 1.6;
    }
    const rainGeo = new THREE.BufferGeometry();
    rainGeo.setAttribute("position", new THREE.BufferAttribute(this.rainPos, 3));
    this.rain = new THREE.LineSegments(
      rainGeo,
      new THREE.LineBasicMaterial({
        color: PALETTE.rain,
        transparent: true,
        opacity: 0,
        depthWrite: false,
      }),
    );
    this.rain.frustumCulled = false;
    this.group.add(this.rain);

    this.windPos = new Float32Array(WIND_STREAKS * WIND_SEGS * 6);
    for (let i = 0; i < WIND_STREAKS; i++) {
      this.streaks.push({
        y: 0.3 + r() * 1.9,
        z: (r() - 0.5) * opts.radius * 1.4,
        offset: r() * 10,
        speed: 1.4 + r() * 1.2,
        amp: 0.05 + r() * 0.12,
      });
    }
    const windGeo = new THREE.BufferGeometry();
    windGeo.setAttribute("position", new THREE.BufferAttribute(this.windPos, 3));
    this.wind = new THREE.LineSegments(
      windGeo,
      new THREE.LineBasicMaterial({
        color: PALETTE.wind,
        transparent: true,
        opacity: 0,
        depthWrite: false,
      }),
    );
    this.wind.frustumCulled = false;
    this.group.add(this.wind);
  }

  set(present: readonly Weather[], instant = false): void {
    for (const k of ["fog", "rain", "wind"] as const) {
      this.target[k] = present.includes(k) ? 1 : 0;
      if (instant) this.level[k] = this.target[k];
    }
  }

  update(dt: number, time: number, calm: boolean): void {
    const ease = calm ? 1 : 1 - Math.exp(-dt * 2.2);
    for (const k of ["fog", "rain", "wind"] as const)
      this.level[k] += (this.target[k] - this.level[k]) * ease;
    const motion = calm ? 0 : 1;

    this.fog.setLevel(this.level.fog);
    this.fog.update(time, motion);

    const rain = this.level.rain;
    this.cloudMat.opacity = rain * 0.85;
    const rainMat = this.rain.material as THREE.LineBasicMaterial;
    rainMat.opacity = rain * 0.7;
    this.rain.visible = rain > 0.01;
    if (this.rain.visible) {
      for (let i = 0; i < RAIN_DROPS; i++) {
        const o = i * 6;
        let y = (this.rainPos[o + 1] ?? 0) - (this.rainSpeed[i] ?? 3) * dt * motion;
        if (y < 0.05) y += 3;
        this.rainPos[o + 1] = y;
        this.rainPos[o + 4] = y - 0.16;
      }
      positions(this.rain).needsUpdate = true;
    }

    const wind = this.level.wind;
    const windMat = this.wind.material as THREE.LineBasicMaterial;
    windMat.opacity = wind * 0.55;
    this.wind.visible = wind > 0.01;
    if (this.wind.visible) {
      const span = this.opts.radius * 2.4;
      let o = 0;
      for (const s of this.streaks) {
        const head = ((time * s.speed * motion + s.offset) % 1) * span - span / 2;
        for (let j = 0; j < WIND_SEGS; j++) {
          for (const step of [j, j + 1]) {
            const x = head - step * 0.14;
            this.windPos[o++] = x;
            this.windPos[o++] = s.y + Math.sin(x * 2.4 + s.offset) * s.amp;
            this.windPos[o++] = s.z;
          }
        }
      }
      positions(this.wind).needsUpdate = true;
    }
  }
}

function positions(lines: THREE.LineSegments): THREE.BufferAttribute {
  return lines.geometry.getAttribute("position") as THREE.BufferAttribute;
}
