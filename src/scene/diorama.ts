// Shared shape of a trail diorama: a plinth, its props, a weather cell and live parts.

import type * as THREE from "three";
import type { GameState } from "../game/state";
import type { Weather } from "../game/world";

export type Levels = Readonly<Record<Weather, number>>;

export interface DioramaParts {
  readonly group: THREE.Group;
  /** Where the hiker stands, in the diorama's local space. */
  readonly stand: THREE.Vector3;
  readonly fogHeight: number;
  readonly fogSpread: number;
  /** Called every frame with the fading weather levels at this location. */
  update(
    dt: number,
    time: number,
    calm: boolean,
    levels: Levels,
    state: GameState,
    instant?: boolean,
  ): void;
}
