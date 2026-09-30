// Field notebook: discoveries are written down the first time you witness a rule at work.

import type { GameState } from "./state";
import { has } from "./world";

export interface Discovery {
  readonly id: string;
  readonly title: string;
  readonly text: string;
  /** Which small sketch the notebook draws beside the entry. */
  readonly sketch: "jar" | "fog" | "cloud" | "vane" | "fern" | "ferry" | "pause" | "lantern";
  readonly seen: (s: GameState) => boolean;
}

export const DISCOVERIES: readonly Discovery[] = [
  {
    id: "jar",
    title: "One weather at a time",
    text: "The jar holds a single pocket of weather. To carry something else, let it go first.",
    sketch: "jar",
    seen: (s) => s.jar !== null,
  },
  {
    id: "fog-hides",
    title: "Fog hides the way",
    text: "With the fog bottled, stepping stones show across the beck at the ford.",
    sketch: "fog",
    seen: (s) => s.at === "ford" && !has(s.weather, "ford", "fog"),
  },
  {
    id: "cloud-step",
    title: "Fog gathers in hollows",
    text: "Released into the marked hollow, fog settles into a cloud firm enough to stand on.",
    sketch: "cloud",
    seen: (s) => s.at === "hollow" && has(s.weather, "hollow", "fog"),
  },
  {
    id: "lift",
    title: "The vane lift",
    text: "A breeze on the terrace turns the vane, and the basket lift climbs to the tarn.",
    sketch: "vane",
    seen: (s) => s.at === "terrace" && has(s.weather, "terrace", "wind"),
  },
  {
    id: "lift-pause",
    title: "Borrowing has a cost",
    text: "With its breeze in my jar, the lift stops. Whatever I take stops working where it was.",
    sketch: "pause",
    seen: (s) => s.at === "terrace" && s.jar === "wind" && !has(s.weather, "terrace", "wind"),
  },
  {
    id: "ferns",
    title: "Rain wakes the ferns",
    text: "Rain on the terrace uncurls the fern fronds into a stair up the cliff.",
    sketch: "fern",
    seen: (s) => s.at === "terrace" && has(s.weather, "terrace", "rain"),
  },
  {
    id: "ferry",
    title: "The leaf ferry",
    text: "The ferry sails only with a breeze on the tarn and no mist over its lane.",
    sketch: "ferry",
    seen: (s) =>
      s.at === "tarn" && has(s.weather, "tarn", "wind") && !has(s.weather, "tarn", "fog"),
  },
  {
    id: "instruments",
    title: "The lantern shelter",
    text: "Each instrument wakes when its own weather is let out beside it: fog, rain and wind.",
    sketch: "lantern",
    seen: (s) => s.restored.length > 0,
  },
];

/** Ids of every discovery visible in this state. */
export function discover(state: GameState): string[] {
  return DISCOVERIES.filter((d) => d.seen(state)).map((d) => d.id);
}
