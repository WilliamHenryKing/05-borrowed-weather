import { describe, expect, test } from "bun:test";
import { type Action, apply, createGame, type GameState } from "../src/game/state";
import { guideCopy, guideReplayStep, guideStepAfter } from "../src/ui/guideCopy";

const run = (actions: readonly Action[], from = createGame()): GameState =>
  actions.reduce((state, action) => {
    const out = apply(state, action);
    if (!out.ok) throw new Error(out.message);
    return out.state;
  }, from);

const proof: readonly Action[] = [
  { type: "travel", to: "ford" },
  { type: "take", weather: "fog" },
  { type: "travel", to: "hollow" },
  { type: "release" },
];
const terrace = () => run([...proof, { type: "travel", to: "terrace" }]);

describe("the first fog proof", () => {
  test("only the four demonstrated consequences complete the initial tour", () => {
    let state = createGame();
    let step = 0;
    for (const [index, action] of proof.entries()) {
      const out = apply(state, action);
      expect(out.ok).toBe(true);
      step = guideStepAfter(step, state, action, out.state);
      expect(step).toBe(index === 3 ? -1 : index + 1);
      state = out.state;
    }
    expect(state.weather.ford).toEqual([]);
    expect(state.weather.hollow).toEqual(["fog"]);
  });

  test("taking Gate rain cannot substitute for the first fog action", () => {
    const initial = createGame();
    const rain: Action = { type: "take", weather: "rain" };
    const held = apply(initial, rain).state;
    expect(guideStepAfter(0, initial, rain, held)).toBe(0);
    const atFord = run([{ type: "travel", to: "ford" }], held);
    const fog: Action = { type: "take", weather: "fog" };
    const denied = apply(atFord, fog);
    expect(denied.ok).toBe(false);
    expect(guideStepAfter(1, atFord, fog, denied.state)).toBe(1);
    expect(guideCopy(1, atFord)[1]).toContain("Release");
    expect(guideCopy(2, atFord)[1]).toContain("release it first");
  });

  test("weather borrowed elsewhere and a return walk do not skip the taught crossing", () => {
    const atTerrace = terrace();
    const take: Action = { type: "take", weather: "wind" };
    const held = apply(atTerrace, take).state;
    expect(guideStepAfter(1, atTerrace, take, held)).toBe(1);
    const back: Action = { type: "travel", to: "gate" };
    expect(guideStepAfter(2, held, back, apply(held, back).state)).toBe(2);
  });

  test("a reversible release at Ford does not incorrectly finish the cloud-step guide", () => {
    const held = run(proof.slice(0, 2));
    const release: Action = { type: "release" };
    expect(guideStepAfter(3, held, release, apply(held, release).state)).toBe(3);
    const wrongWeather = run([
      ...proof,
      { type: "travel", to: "gate" },
      { type: "take", weather: "rain" },
      { type: "travel", to: "hollow" },
    ]);
    expect(guideStepAfter(3, wrongWeather, release, apply(wrongWeather, release).state)).toBe(3);
  });

  test("failed actions and a dismissed guide preserve their progress", () => {
    const state = createGame();
    const blocked: Action = { type: "travel", to: "hollow" };
    const out = apply(state, blocked);
    expect(out.ok).toBe(false);
    expect(guideStepAfter(0, state, blocked, out.state)).toBe(0);
    const take: Action = { type: "take", weather: "rain" };
    expect(guideStepAfter(-1, state, take, apply(state, take).state)).toBe(-1);
  });
});

describe("a contextual replay without resetting the trail", () => {
  test("replay starts at the useful verb for the existing jar and location", () => {
    expect(guideReplayStep(createGame())).toBe(1);
    const held = run([{ type: "take", weather: "rain" }]);
    expect(guideReplayStep(held)).toBe(2);
    const emptyGate = run(
      [{ type: "travel", to: "ford" }, { type: "release" }, { type: "travel", to: "gate" }],
      held,
    );
    expect(guideReplayStep(emptyGate)).toBe(0);
    expect(guideCopy(0, emptyGate, true)[1]).toContain("Wool Gate");
  });

  test("later wind borrowing, carrying and release complete practice in their actual places", () => {
    let state = terrace();
    let step = guideReplayStep(state);
    expect(guideCopy(step, state, true)[1]).toContain("Take wind at Vane Terrace");
    for (const action of [
      { type: "take", weather: "wind" },
      { type: "travel", to: "hollow" },
      { type: "release" },
    ] as const) {
      const out = apply(state, action);
      expect(out.ok).toBe(true);
      step = guideStepAfter(step, state, action, out.state, true);
      state = out.state;
    }
    expect(step).toBe(-1);
    expect(state.weather.hollow).toEqual(["fog", "wind"]);
  });

  test("a changed source explains the paused crossing rather than demanding the old Ford task", () => {
    const held = run([{ type: "take", weather: "wind" }], terrace());
    const copy = guideCopy(2, held, true)[1];
    expect(copy).toContain("wind at Vane Terrace");
    expect(copy).toContain("give it back or use another route");
    expect(copy).not.toContain("Fog Ford");
  });

  test("the Tarn practice names both available weather types and the actual release effect", () => {
    const atTarn = run([{ type: "travel", to: "tarn" }], terrace());
    expect(guideCopy(1, atTarn, true)[1]).toContain("Take fog or wind at High Tarn");
    const windAtTarn = run([{ type: "take", weather: "wind" }], atTarn);
    expect(windAtTarn.jar).toBe("wind");
    expect(guideCopy(3, windAtTarn, true)[1]).toContain(
      "Wind fills the leaf sail, but fog still hides its lane.",
    );
  });

  test("finished copy describes the instruments and keeps notebook/postcard access clear", () => {
    const finished: GameState = {
      ...createGame(),
      at: "shelter",
      restored: ["fog", "rain", "wind"],
      finished: true,
    };
    expect(guideCopy(3, finished, true)).toEqual([
      "Above the clouds",
      "All three instruments are awake. Read your notebook, open the postcard or stay a while.",
    ]);
  });
});
