import { describe, expect, test } from "bun:test";
import { cuesFor } from "../src/audio/cues";
import { ambienceMix } from "../src/audio/mix";
import { apply, createGame } from "../src/game/state";

describe("ambience follows the weather where you stand", () => {
  test("rain patters at the gate until you bottle it", () => {
    const s = createGame();
    expect(ambienceMix(s).rain).toBeGreaterThan(0);
    const t = apply(s, { type: "take", weather: "rain" }).state;
    expect(ambienceMix(t).rain).toBe(0);
  });

  test("fog muffles the ford; the river is loudest there", () => {
    const s = apply(createGame(), { type: "travel", to: "ford" }).state;
    const foggy = ambienceMix(s);
    expect(foggy.cutoff).toBeLessThan(2000);
    expect(foggy.river).toBeGreaterThan(ambienceMix(createGame()).river);
    const clear = ambienceMix(apply(s, { type: "take", weather: "fog" }).state);
    expect(clear.cutoff).toBeGreaterThan(10000);
  });
});

describe("sound cues", () => {
  test("a blocked move sounds a soft refusal and nothing else", () => {
    const s = createGame();
    const out = apply(s, { type: "travel", to: "hollow" });
    expect(cuesFor(s, out).map((c) => c.name)).toEqual(["blocked"]);
  });

  test("walking plays footsteps for every leg", () => {
    const s = createGame();
    const out = apply(s, { type: "travel", to: "ford" });
    expect(cuesFor(s, out).filter((c) => c.name.startsWith("step")).length).toBe(2);
  });

  test("taking clinks the jar and a first sighting chimes a discovery", () => {
    const s = createGame();
    const out = apply(s, { type: "take", weather: "rain" });
    const names = cuesFor(s, out).map((c) => c.name);
    expect(names).toContain("take");
    expect(names).toContain("discover");
  });
});
