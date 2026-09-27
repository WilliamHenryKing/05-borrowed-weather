// Pure mapping from game state to the ambience mix: what you hear where you stand.

import type { GameState } from "../game/state";
import type { LocationId } from "../game/world";

export interface AmbienceMix {
  readonly birds: number;
  readonly river: number;
  readonly rain: number;
  readonly wind: number;
  /** Low-pass cutoff in Hz: fog muffles everything around you. */
  readonly cutoff: number;
  /** Music level before mute and ducking. */
  readonly music: number;
}

const RIVER: Record<LocationId, number> = {
  gate: 0.12,
  ford: 0.55,
  hollow: 0.2,
  terrace: 0.05,
  tarn: 0.18,
  shelter: 0,
};

const BIRDS: Record<LocationId, number> = {
  gate: 0.35,
  ford: 0.3,
  hollow: 0.28,
  terrace: 0.22,
  tarn: 0.18,
  shelter: 0.1,
};

export function ambienceMix(state: GameState): AmbienceMix {
  const here = state.weather[state.at];
  const foggy = here.includes("fog");
  return {
    birds: BIRDS[state.at] * (foggy ? 0.5 : 1),
    river: RIVER[state.at],
    rain: here.includes("rain") ? 0.5 : 0,
    wind: here.includes("wind") ? 0.45 : state.at === "shelter" ? 0.12 : 0,
    cutoff: foggy ? 900 : 16000,
    music: state.finished ? 0.4 : 0.26,
  };
}
