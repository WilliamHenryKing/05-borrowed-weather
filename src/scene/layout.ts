// Where each diorama sits on the slope, and the camera bookmarks used for visual captures.

import * as THREE from "three";
import type { LocationId } from "../game/world";

export const LAYOUT: Record<LocationId, [number, number, number]> = {
  gate: [0, 0, 0],
  ford: [5.4, 1.1, -3.4],
  hollow: [0.6, 2.4, -7.6],
  terrace: [5.8, 3.9, -11.4],
  tarn: [0.6, 5.7, -15.4],
  shelter: [5.6, 7.9, -19.4],
};
export const RADIUS = 2.3;

export interface Pose {
  position: THREE.Vector3;
  target: THREE.Vector3;
  /** Full-viewport pixels reserved by a HUD, shared by rendering and pointer projection. */
  shiftX?: number;
}

const at = (id: LocationId, x: number, y: number, z: number) =>
  new THREE.Vector3(...LAYOUT[id]).add(new THREE.Vector3(x, y, z));

/** The gameplay camera: above and in front of the focused diorama. */
export function followPose(
  focus: THREE.Vector3,
  aspect: number,
  sway = 0,
  playAspect = aspect,
): Pose {
  const tall = aspect < 0.75;
  const fit = tall ? 1 : Math.max(1, 1.2 / Math.max(0.1, playAspect));
  return {
    position: focus
      .clone()
      .add(
        new THREE.Vector3((1.2 + sway) * fit, (tall ? 5.4 : 3.4) * fit, (tall ? 10.5 : 7.4) * fit),
      ),
    target: focus.clone().add(new THREE.Vector3(0, tall ? -0.4 : 0, 0)),
  };
}

export const BOOKMARKS = {
  /** The whole trail from the side: six islands climbing into the haze. */
  establishing: () => ({ position: at("hollow", 19, 9, 10), target: at("terrace", -3, 0.5, 1) }),
  /** The gameplay view of Fog Ford: the beck, the fog bank and the hiker. */
  hero: (aspect: number) => followPose(at("ford", 0, 0.7, 0), aspect),
  /** Arm's length from the hiker and the jar at Wool Gate. */
  closeup: () => ({ position: at("gate", 1.15, 0.85, 1.55), target: at("gate", 0.3, 0.45, 0.3) }),
  /** Low across the beck: water, stones and turf at a grazing angle. */
  grazing: () => ({ position: at("ford", -2.3, 0.32, 1.9), target: at("ford", 0.6, 0.05, -0.8) }),
  /** The hero shot framed for a phone held upright (capture at 390 × 844). */
  "phone-hero": (aspect: number) => followPose(at("ford", 0, 0.7, 0), aspect),
} satisfies Record<string, (aspect: number) => Pose>;

export type BookmarkName = keyof typeof BOOKMARKS;
