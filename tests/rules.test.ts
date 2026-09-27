import { describe, expect, test } from "bun:test";
import { explore, finishable, hint, moves, solve, stateKey } from "../src/game/solver";
import { type Action, apply, createGame, type GameState, reachable } from "../src/game/state";
import { WEATHERS } from "../src/game/world";

const run = (actions: Action[], from: GameState = createGame()): GameState =>
  actions.reduce((s, a) => {
    const out = apply(s, a);
    if (!out.ok) throw new Error(`${a.type} failed: ${out.message}`);
    return out.state;
  }, from);

const toTerrace: Action[] = [
  { type: "travel", to: "ford" },
  { type: "take", weather: "fog" },
  { type: "travel", to: "hollow" },
  { type: "release" },
  { type: "travel", to: "terrace" },
];

describe("jar", () => {
  test("starts empty at the Wool Gate", () => {
    const s = createGame();
    expect(s.at).toBe("gate");
    expect(s.jar).toBeNull();
  });

  test("holds one weather at a time", () => {
    const s = run([
      { type: "take", weather: "rain" },
      { type: "travel", to: "ford" },
    ]);
    const out = apply(s, { type: "take", weather: "fog" });
    expect(out.ok).toBe(false);
    expect(out.state).toBe(s);
  });

  test("taking changes the source, releasing changes the destination", () => {
    const s = run([
      { type: "travel", to: "ford" },
      { type: "take", weather: "fog" },
    ]);
    expect(s.weather.ford).toEqual([]);
    expect(s.jar).toBe("fog");
    const t = run([{ type: "travel", to: "hollow" }, { type: "release" }], s);
    expect(t.weather.hollow).toEqual(["fog"]);
    expect(t.jar).toBeNull();
  });

  test("cannot release weather where the same kind already is", () => {
    const s = run([{ type: "take", weather: "rain" }]);
    const soaked = { ...s, weather: { ...s.weather, gate: ["rain" as const] } };
    expect(apply(soaked, { type: "release" }).ok).toBe(false);
  });
});

describe("first proof: fog ford and cairn hollow", () => {
  test("fog hides the stepping stones", () => {
    const s = run([{ type: "travel", to: "ford" }]);
    const out = apply(s, { type: "travel", to: "hollow" });
    expect(out.ok).toBe(false);
    expect(out.message).toContain("Fog");
  });

  test("bottled fog reveals the crossing; released in the hollow it makes a cloud step", () => {
    const s = run(toTerrace.slice(0, 3));
    expect(apply(s, { type: "travel", to: "terrace" }).ok).toBe(false);
    const t = run(toTerrace.slice(3), s);
    expect(t.at).toBe("terrace");
    expect(t.discoveries).toContain("fog-hides");
    expect(t.discoveries).toContain("cloud-step");
  });

  test("walking skips through open diorama paths and records the trail", () => {
    const s = run([...toTerrace, { type: "travel", to: "gate" }]);
    expect(s.at).toBe("gate");
    expect(s.trail.slice(-4)).toEqual(["terrace", "hollow", "ford", "gate"]);
  });
});

describe("the second consequence", () => {
  test("taking the lift's breeze stops the lift", () => {
    const s = run(toTerrace);
    expect(reachable(s.weather, "terrace").has("tarn")).toBe(true);
    const t = run([{ type: "take", weather: "wind" }], s);
    expect(reachable(t.weather, "terrace").has("tarn")).toBe(false);
    expect(t.discoveries).toContain("lift-pause");
  });

  test("tarn mist blocks the ferry even with a breeze", () => {
    const s = run([...toTerrace, { type: "travel", to: "tarn" }]);
    const out = apply(s, { type: "travel", to: "shelter" });
    expect(out.ok).toBe(false);
    expect(out.message).toContain("Mist");
  });
});

describe("fairness", () => {
  const graph = explore(createGame());
  const all = [...graph.states.values()];

  test("the trail can be finished", () => {
    const plan = solve(createGame());
    expect(plan).not.toBeNull();
    const end = run(plan ?? []);
    expect(end.finished).toBe(true);
    expect([...end.restored].sort()).toEqual([...WEATHERS].sort());
  });

  test("it needs real reasoning, not one straight walk", () => {
    const plan = solve(createGame()) ?? [];
    expect(plan.filter((a) => a.type !== "travel").length).toBeGreaterThanOrEqual(10);
  });

  test("there are no dead ends: every reachable state can still finish", () => {
    expect(all.length).toBeGreaterThan(100);
    const good = finishable(graph);
    expect(good.size).toBe(graph.states.size);
  });

  test("every take can be undone by releasing in place", () => {
    for (const s of all) {
      for (const a of moves(s)) {
        if (a.type !== "take") continue;
        const back = run([a, { type: "release" }], s);
        expect(stateKey(back)).toBe(stateKey(s));
      }
    }
  });

  test("a hint is always offered and names the first move", () => {
    for (const s of all.filter((_, i) => i % 2500 === 0))
      expect(hint(s).length).toBeGreaterThan(10);
    expect(hint(createGame())).toContain("Fog Ford");
  });

  test("following the solver finishes the trail with notebook entries", () => {
    let s = createGame();
    for (let i = 0; i < 80 && !s.finished; i++) {
      const next = solve(s)?.[0];
      if (!next) break;
      s = apply(s, next).state;
    }
    expect(s.finished).toBe(true);
    expect(s.trail.at(-1)).toBe("shelter");
    expect(s.discoveries.length).toBeGreaterThan(5);
  });
});
