import { describe, expect, test } from "bun:test";
import { hint, moves, solve } from "../src/game/solver";
import { type Action, apply, createGame, type GameState } from "../src/game/state";
import { LOCATION_INFO, type WeatherMap } from "../src/game/world";

// Independent bit model of the authored trail. It does not use the game's route
// predicates, transitions, state key, exploration, or finishability helpers.
const sites = ["gate", "ford", "hollow", "terrace", "tarn", "shelter"] as const;
const kinds = ["fog", "rain", "wind"] as const;
interface Model {
  at: number;
  jar: number;
  weather: readonly number[];
  restored: number;
}
interface Edge {
  action: Action;
  state: Model;
}

function key(state: Model): number {
  const weather = state.weather.reduce((bits, cell, i) => bits | (cell << (i * 3)), 0);
  return ((weather * 6 + state.at) * 4 + state.jar + 1) * 8 + state.restored;
}

function cross(lower: number, weather: readonly number[]): boolean {
  switch (lower) {
    case 0:
      return true;
    case 1:
      return !((weather[1] ?? 0) & 1);
    case 2:
      return Boolean((weather[2] ?? 0) & 1);
    case 3:
      return Boolean((weather[3] ?? 0) & 6);
    case 4:
      return Boolean((weather[4] ?? 0) & 4) && !((weather[4] ?? 0) & 1);
    default:
      return false;
  }
}

function edges(state: Model): Edge[] {
  const result: Edge[] = [];
  for (const to of [state.at - 1, state.at + 1]) {
    const id = sites[to];
    if (id && cross(Math.min(to, state.at), state.weather))
      result.push({ action: { type: "travel", to: id }, state: { ...state, at: to } });
  }
  const here = state.weather[state.at] ?? 0;
  if (state.jar < 0) {
    kinds.forEach((weather, jar) => {
      const bit = 1 << jar;
      if (!(here & bit)) return;
      const cells = [...state.weather];
      cells[state.at] = here & ~bit;
      result.push({ action: { type: "take", weather }, state: { ...state, jar, weather: cells } });
    });
  } else if (!(here & (1 << state.jar))) {
    const bit = 1 << state.jar;
    const cells = [...state.weather];
    cells[state.at] = here | bit;
    result.push({
      action: { type: "release" },
      state: {
        ...state,
        jar: -1,
        weather: cells,
        restored: state.at === 5 ? state.restored | bit : state.restored,
      },
    });
  }
  return result;
}

function asGame(state: Model): GameState {
  const weather: WeatherMap = {
    gate: [],
    ford: [],
    hollow: [],
    terrace: [],
    tarn: [],
    shelter: [],
  };
  sites.forEach((site, i) => {
    weather[site] = kinds.filter((_, k) => (state.weather[i] ?? 0) & (1 << k));
  });
  return {
    ...createGame(),
    at: sites[state.at] ?? "gate",
    jar: kinds[state.jar] ?? null,
    weather,
    restored: kinds.filter((_, k) => state.restored & (1 << k)),
    finished: state.restored === 7,
  };
}

function asModel(state: GameState): Model {
  return {
    at: sites.indexOf(state.at),
    jar: state.jar === null ? -1 : kinds.indexOf(state.jar),
    weather: sites.map((site) =>
      kinds.reduce((bits, kind, k) => bits | (state.weather[site].includes(kind) ? 1 << k : 0), 0),
    ),
    restored: kinds.reduce(
      (bits, kind, k) => bits | (state.restored.includes(kind) ? 1 << k : 0),
      0,
    ),
  };
}

function routeStatus(state: Model): readonly (readonly [string, boolean])[] {
  const w = state.weather;
  return [
    ["meadow path", true],
    ["stepping stones", !((w[1] ?? 0) & 1)],
    ["cloud step", Boolean((w[2] ?? 0) & 1)],
    ["basket lift", Boolean((w[3] ?? 0) & 4)],
    ["fern stair", Boolean((w[3] ?? 0) & 2)],
    ["leaf ferry", Boolean((w[4] ?? 0) & 4) && !((w[4] ?? 0) & 1)],
  ];
}

const states: Model[] = [{ at: 0, jar: -1, weather: [2, 1, 0, 4, 5, 0], restored: 0 }];
const indices = new Map<number, number>([[key(states[0] as Model), 0]]);
const parents: number[][] = [[]];
for (let i = 0; i < states.length; i++) {
  for (const edge of edges(states[i] as Model)) {
    const id = key(edge.state);
    let child = indices.get(id);
    if (child === undefined) {
      child = states.length;
      states.push(edge.state);
      indices.set(id, child);
      parents.push([]);
    }
    parents[child]?.push(i);
  }
}
const distances = new Int32Array(states.length).fill(-1);
const queue: number[] = [];
states.forEach((state, i) => {
  if (state.restored !== 7) return;
  distances[i] = 0;
  queue.push(i);
});
for (let i = 0; i < queue.length; i++) {
  const child = queue[i] as number;
  for (const parent of parents[child] ?? []) {
    if (distances[parent] !== -1) continue;
    distances[parent] = (distances[child] ?? 0) + 1;
    queue.push(parent);
  }
}

describe("independent trail model", () => {
  test("all 37,430 reachable configurations conserve weather and can reach the shelter", () => {
    expect(states.length).toBe(37_430);
    expect(queue.length).toBe(states.length);
    expect(distances[0]).toBe(27);
    for (const state of states) {
      const counts = kinds.map(
        (_, kind) =>
          state.weather.reduce((n, cell) => n + Number(Boolean(cell & (1 << kind))), 0) +
          Number(state.jar === kind),
      );
      if (counts.join() !== "2,1,2") throw new Error(`Weather not conserved at ${key(state)}`);
    }
  });

  test("production verbs agree with every independent legal transition", () => {
    for (const state of states) {
      const game = asGame(state);
      const expected = edges(state);
      // Two simultaneously open terrace routes share the same destination.
      const actual = [...new Set(moves(game).map((action) => JSON.stringify(action)))].sort();
      const wanted = expected.map((edge) => JSON.stringify(edge.action)).sort();
      if (actual.join() !== wanted.join()) throw new Error(`Different actions at ${key(state)}`);
      for (const edge of expected) {
        const out = apply(game, edge.action);
        if (!out.ok || key(asModel(out.state)) !== key(edge.state))
          throw new Error(`Different transition at ${key(state)}: ${JSON.stringify(edge.action)}`);
        if (out.state.finished !== (edge.state.restored === 7))
          throw new Error(`Incorrect completion at ${key(edge.state)}`);
        if (edge.action.type === "travel") {
          const back = apply(out.state, { type: "travel", to: game.at });
          if (!back.ok || key(asModel(back.state)) !== key(state))
            throw new Error(`Walk not reversible at ${key(state)}`);
        } else if (edge.action.type === "take") {
          const back = apply(out.state, { type: "release" });
          if (!back.ok || key(asModel(back.state)) !== key(state))
            throw new Error(`Borrow not reversible at ${key(state)}`);
        }
      }
    }
    expect(indices.size).toBe(37_430);
  });

  test("shortest plans and hints stay truthful in varied live configurations", () => {
    for (let i = 0; i < states.length; i += 3000) {
      const game = asGame(states[i] as Model);
      const snapshot = JSON.stringify(game);
      const plan = solve(game);
      expect(plan).not.toBeNull();
      expect(plan?.length).toBe(distances[i]);
      let end = game;
      for (const action of plan ?? []) {
        const out = apply(end, action);
        expect(out.ok).toBe(true);
        end = out.state;
      }
      expect(end.finished).toBe(true);
      const nextWeather = plan?.findIndex((action) => action.type !== "travel") ?? -1;
      const next = plan?.[nextWeather];
      const text = hint(game);
      if (next && plan) {
        const before = plan.slice(0, nextWeather).reduce((s, a) => apply(s, a).state, game);
        const kind = next.type === "take" ? next.weather : before.jar;
        expect(text).toContain(
          next.type === "take" ? `borrow the ${kind}` : `release your ${kind}`,
        );
        expect(text).toContain(
          before.at === game.at ? "Here" : `At ${LOCATION_INFO[before.at].name}`,
        );
        const model = asModel(before);
        const after = edges(model).find(
          (edge) => JSON.stringify(edge.action) === JSON.stringify(next),
        )?.state;
        expect(after).toBeDefined();
        if (!after) throw new Error("Hint action is not independently legal");
        const was = new Map(routeStatus(model));
        for (const [name, open] of routeStatus(after)) {
          expect(text.includes(`opens the ${name}`)).toBe(!was.get(name) && open);
          expect(text.includes(`stops the ${name}`)).toBe(Boolean(was.get(name) && !open));
        }
        ["cloud glass", "rain gauge", "wind vane"].forEach((name, k) => {
          expect(text.includes(`wakes the ${name}`)).toBe(
            !(model.restored & (1 << k)) && Boolean(after.restored & (1 << k)),
          );
        });
      } else expect(text).toBe("The shelter is awake. Open your postcard.");
      expect(JSON.stringify(game)).toBe(snapshot);
    }
  });

  test("restoration stays permanent and replay starts without old route or notebook state", () => {
    const end = (solve(createGame()) ?? []).reduce(
      (state, action) => apply(state, action).state,
      createGame(),
    );
    expect(end.finished).toBe(true);
    const borrowed = apply(end, { type: "take", weather: "wind" });
    expect(borrowed.ok).toBe(true);
    expect(borrowed.state.finished).toBe(true);
    expect(borrowed.state.restored).toEqual(end.restored);
    const fresh = createGame();
    expect(fresh.finished).toBe(false);
    expect(fresh.restored).toEqual([]);
    expect(fresh.trail).toEqual(["gate"]);
    expect(fresh.log).toEqual([]);
    expect(fresh.discoveries).toEqual([]);
    expect(key(asModel(fresh))).toBe(key(states[0] as Model));
    expect(end.jar).toBeNull();
  });
});
