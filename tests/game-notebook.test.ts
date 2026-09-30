import { describe, expect, test } from "bun:test";
import { type Action, apply, createGame, type GameState } from "../src/game/state";
import { has, ROUTES } from "../src/game/world";

function run(actions: readonly Action[], start = createGame()): GameState {
  return actions.reduce((state, action) => {
    const out = apply(state, action);
    if (!out.ok) throw new Error(out.message);
    return out.state;
  }, start);
}

const clearLowerTrail: readonly Action[] = [
  { type: "travel", to: "ford" },
  { type: "take", weather: "fog" },
  { type: "travel", to: "hollow" },
  { type: "release" },
];

describe("witnessed notebook rules", () => {
  test("another place's wind does not claim the terrace lift has stopped", () => {
    const state = run([
      ...clearLowerTrail,
      { type: "travel", to: "tarn" },
      { type: "take", weather: "wind" },
      { type: "travel", to: "terrace" },
    ]);
    expect(state.jar).toBe("wind");
    expect(has(state.weather, "terrace", "wind")).toBe(true);
    expect(ROUTES.find((route) => route.id === "lift")?.open(state.weather)).toBe(true);
    expect(state.discoveries).not.toContain("lift-pause");
  });

  test("taking the terrace breeze records its cost even when a fern stair remains", () => {
    const state = run([
      ...clearLowerTrail,
      { type: "travel", to: "gate" },
      { type: "take", weather: "rain" },
      { type: "travel", to: "terrace" },
      { type: "release" },
      { type: "take", weather: "wind" },
    ]);
    expect(ROUTES.find((route) => route.id === "lift")?.open(state.weather)).toBe(false);
    expect(ROUTES.find((route) => route.id === "ferns")?.open(state.weather)).toBe(true);
    expect(state.discoveries).toContain("lift-pause");
  });

  test("a direct walk records the same discoveries as walking through each stop", () => {
    const start = run([
      ...clearLowerTrail,
      { type: "travel", to: "gate" },
      { type: "take", weather: "rain" },
    ]);
    const direct = apply(start, { type: "travel", to: "tarn" });
    const adjacent = run(
      [
        { type: "travel", to: "ford" },
        { type: "travel", to: "hollow" },
        { type: "travel", to: "terrace" },
        { type: "travel", to: "tarn" },
      ],
      start,
    );
    expect(direct.ok).toBe(true);
    expect(direct.state.trail).toEqual(adjacent.trail);
    expect(direct.state.discoveries).toEqual(adjacent.discoveries);
    expect(direct.found).toEqual(["lift"]);
    expect(new Set(direct.state.discoveries).size).toBe(direct.state.discoveries.length);
  });
});
