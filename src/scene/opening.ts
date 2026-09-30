import * as THREE from "three";
import type { Pose } from "./layout";

export function wantsTitle() {
  const q = new URLSearchParams(location.search);
  return q.has("intro") || (!import.meta.env.DEV && !q.has("e2e"));
}
const ease = (t: number) => {
  const x = Math.min(1, Math.max(0, t));
  return x * x * (3 - 2 * x);
};

/** Follow the islands down from the shelter to the hiker at Wool Gate. */
export class Opening {
  phase: "title" | "glide" | "done" = wantsTitle() ? "title" : "done";
  private time = 0;
  private last: Pose | null = null;
  private from: Pose | null = null;
  onDone = () => {};
  begin(calm: boolean) {
    if (this.phase !== "title") return;
    this.phase = calm ? "done" : "glide";
    this.time = 0;
    this.from = this.last;
    if (calm) this.onDone();
  }
  finish() {
    if (this.phase !== "glide") return;
    this.phase = "done";
    this.onDone();
  }
  update(dt: number, camera: THREE.PerspectiveCamera, home: Pose, calm: boolean): Pose {
    const veil = document.getElementById("arrival");
    if (!veil || veil.classList.contains("is-done")) this.time += dt;
    const portrait = camera.aspect < 0.75;
    let weight = 1;
    let pose = home;
    if (this.phase === "title") {
      const t = calm ? 1 : ease(this.time / 10);
      pose = {
        position: new THREE.Vector3(15, 10, -7).lerp(new THREE.Vector3(6.5, 4.8, 9.5), t),
        target: new THREE.Vector3(2.8, 4, -10).lerp(new THREE.Vector3(1.5, 1.5, -2.2), t),
      };
      if (!calm) pose.position.x += Math.sin(this.time * 0.14) * 0.2;
      this.last = pose;
    } else if (this.phase === "glide") {
      const t = calm ? 1 : ease(this.time / 2.8);
      const from = this.from ?? home;
      pose = {
        position: from.position.clone().lerp(home.position, t),
        target: from.target.clone().lerp(home.target, t),
      };
      pose.position.y += Math.sin(Math.PI * t) * 0.6;
      weight = 1 - t;
      if (t === 1) {
        this.phase = "done";
        this.onDone();
      }
    } else weight = 0;
    const w = innerWidth,
      h = innerHeight;
    camera.setViewOffset(
      w,
      h,
      (portrait ? 0 : -0.16 * w * weight) + (home.shiftX ?? 0) * (1 - weight),
      portrait ? 0.18 * h * weight : 0,
      w,
      h,
    );
    camera.updateProjectionMatrix();
    return pose;
  }
}
