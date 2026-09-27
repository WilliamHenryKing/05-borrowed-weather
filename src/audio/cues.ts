// Pure mapping from a game outcome to the sound effects it should trigger.

import type { GameState, Outcome } from "../game/state";
import type { Sfx } from "./sound";

export interface Cue {
  readonly name: Sfx;
  readonly delay: number;
  readonly rate?: number;
  readonly gain?: number;
}

const STEPS: readonly Sfx[] = ["step-1", "step-2", "step-3"];
const LEG = 0.55;

export function cuesFor(before: GameState, out: Outcome): Cue[] {
  if (!out.ok) return [{ name: "blocked", delay: 0, gain: 0.6 }];
  const after = out.state;
  const cues: Cue[] = [];
  const legs = after.trail.length - before.trail.length;
  for (let i = 0; i < legs; i++) {
    const name = STEPS[i % STEPS.length] as Sfx;
    cues.push(
      { name, delay: i * LEG, gain: 0.55 },
      { name, delay: i * LEG + LEG / 2, gain: 0.45, rate: 1.08 },
    );
  }
  if (after.jar && !before.jar) cues.push({ name: "take", delay: 0, rate: 1.15 });
  if (!after.jar && before.jar) cues.push({ name: "release", delay: 0, rate: 0.9 });
  if (after.restored.length > before.restored.length)
    cues.push({ name: "restore", delay: 0.3, gain: 0.5 });
  const settle = Math.max(0.35, legs * LEG);
  if (out.found.length > 0) cues.push({ name: "discover", delay: settle, gain: 0.55 });
  if (after.finished && !before.finished) cues.push({ name: "finish", delay: 1.1, gain: 0.8 });
  return cues;
}
