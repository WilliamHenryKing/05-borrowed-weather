import gsap from "gsap";
import type * as THREE from "three";

/** The hiker and camera are one replaceable trip; replay and calm settle both together. */
export class TravelMotion {
  private timeline: gsap.core.Timeline | null = null;

  constructor(
    private readonly walker: THREE.Vector3,
    private readonly focus: THREE.Vector3,
  ) {}

  move(path: THREE.Vector3[], target: THREE.Vector3, instant: boolean): void {
    this.cancel();
    const end = path.at(-1);
    if (!end) return;
    if (instant) {
      this.walker.copy(end);
      this.focus.copy(target);
      return;
    }
    const timeline = gsap.timeline({
      onComplete: () => {
        if (this.timeline === timeline) this.timeline = null;
      },
    });
    this.timeline = timeline;
    const leg = 0.55;
    for (const point of path.slice(1)) {
      timeline.to(this.walker, { x: point.x, z: point.z, duration: leg, ease: "sine.inOut" });
      timeline.to(this.walker, { y: point.y + 0.5, duration: leg / 2, ease: "sine.out" }, "<");
      timeline.to(this.walker, { y: point.y, duration: leg / 2, ease: "sine.in" }, `<${leg / 2}`);
    }
    timeline.to(
      this.focus,
      {
        x: target.x,
        y: target.y,
        z: target.z,
        duration: Math.max(0.9, timeline.duration()),
        ease: "power2.inOut",
      },
      0,
    );
  }

  finish(): void {
    this.timeline?.totalProgress(1);
    this.cancel();
  }

  cancel(): void {
    this.timeline?.kill();
    this.timeline = null;
  }

  get active(): boolean {
    return this.timeline !== null;
  }
}
