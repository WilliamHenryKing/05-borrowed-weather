// Game state and the three verbs: travel, take and release. Every verb is reversible:
// taking can be undone by releasing in the same place, and travel never changes weather.

import { discover } from "./notebook";
import {
  INITIAL_WEATHER,
  LOCATION_INFO,
  LOCATIONS,
  type LocationId,
  ROUTES,
  routesFrom,
  WEATHERS,
  type Weather,
  type WeatherMap,
} from "./world";

export interface GameState {
  readonly at: LocationId;
  readonly jar: Weather | null;
  readonly weather: WeatherMap;
  /** Shelter instruments restored so far; restoring is permanent. */
  readonly restored: readonly Weather[];
  /** Every location stepped on, in order, for the postcard. */
  readonly trail: readonly LocationId[];
  /** Every take and release, for the postcard. */
  readonly log: readonly JarEvent[];
  readonly discoveries: readonly string[];
  readonly finished: boolean;
}

export interface JarEvent {
  readonly verb: "take" | "release";
  readonly weather: Weather;
  readonly at: LocationId;
}

export type Action =
  | { readonly type: "travel"; readonly to: LocationId }
  | { readonly type: "take"; readonly weather: Weather }
  | { readonly type: "release" };

export interface Outcome {
  readonly state: GameState;
  readonly ok: boolean;
  readonly message: string;
  /** Discoveries first made by this action. */
  readonly found: readonly string[];
}

export function createGame(): GameState {
  return {
    at: "gate",
    jar: null,
    weather: INITIAL_WEATHER,
    restored: [],
    trail: ["gate"],
    log: [],
    discoveries: [],
    finished: false,
  };
}

/** Locations reachable from `from` over currently open routes, each with its walking path. */
export function reachable(weather: WeatherMap, from: LocationId): Map<LocationId, LocationId[]> {
  const paths = new Map<LocationId, LocationId[]>([[from, []]]);
  const queue: LocationId[] = [from];
  while (queue.length > 0) {
    const here = queue.shift() as LocationId;
    const path = paths.get(here) ?? [];
    for (const { route, to } of routesFrom(here)) {
      if (paths.has(to) || !route.open(weather)) continue;
      paths.set(to, [...path, to]);
      queue.push(to);
    }
  }
  return paths;
}

/** Why the next location along the trail cannot be reached right now, or null if it can. */
export function blockedReason(
  weather: WeatherMap,
  from: LocationId,
  to: LocationId,
): string | null {
  const direct = routesFrom(from).filter((r) => r.to === to);
  if (direct.length === 0) return `${LOCATION_INFO[to].name} is not next to here.`;
  if (direct.some((r) => r.route.open(weather))) return null;
  return direct.map((r) => r.route.closedReason(weather)).join(" ");
}

export function openRoutes(weather: WeatherMap): Set<string> {
  return new Set(ROUTES.filter((r) => r.open(weather)).map((r) => r.id));
}

function withWeather(w: WeatherMap, at: LocationId, next: readonly Weather[]): WeatherMap {
  return { ...w, [at]: WEATHERS.filter((k) => next.includes(k)) };
}

const fail = (state: GameState, message: string): Outcome => ({
  state,
  ok: false,
  message,
  found: [],
});

function settle(
  prev: GameState,
  next: GameState,
  message: string,
  observed = discover(next),
): Outcome {
  const found = [...new Set(observed)].filter((d) => !prev.discoveries.includes(d));
  const finished = WEATHERS.every((k) => next.restored.includes(k));
  return {
    state: { ...next, discoveries: [...prev.discoveries, ...found], finished },
    ok: true,
    message,
    found,
  };
}

export function apply(state: GameState, action: Action): Outcome {
  const here = LOCATION_INFO[state.at].name;
  switch (action.type) {
    case "travel": {
      if (action.to === state.at) return fail(state, `You are already at ${here}.`);
      const path = reachable(state.weather, state.at).get(action.to);
      if (!path) {
        const step = LOCATIONS.indexOf(action.to) > LOCATIONS.indexOf(state.at) ? 1 : -1;
        const next = LOCATIONS[LOCATIONS.indexOf(state.at) + step] as LocationId;
        const reason = blockedReason(state.weather, state.at, next);
        return fail(state, reason ?? `The way to ${LOCATION_INFO[action.to].name} is closed.`);
      }
      return settle(
        state,
        { ...state, at: action.to, trail: [...state.trail, ...path] },
        `You walk to ${LOCATION_INFO[action.to].name}.`,
        path.flatMap((at) => discover({ ...state, at })),
      );
    }
    case "take": {
      const kind = action.weather;
      if (state.jar) return fail(state, `The jar already holds ${state.jar}. Release it first.`);
      if (!state.weather[state.at].includes(kind)) return fail(state, `There is no ${kind} here.`);
      return settle(
        state,
        {
          ...state,
          jar: kind,
          weather: withWeather(
            state.weather,
            state.at,
            state.weather[state.at].filter((k) => k !== kind),
          ),
          log: [...state.log, { verb: "take", weather: kind, at: state.at }],
        },
        `You bottle the ${kind}.`,
      );
    }
    case "release": {
      const kind = state.jar;
      if (!kind) return fail(state, "The jar is empty.");
      if (state.weather[state.at].includes(kind))
        return fail(state, `There is already ${kind} here. It would only spill.`);
      const restoring = state.at === "shelter" && !state.restored.includes(kind);
      return settle(
        state,
        {
          ...state,
          jar: null,
          weather: withWeather(state.weather, state.at, [...state.weather[state.at], kind]),
          restored: restoring ? [...state.restored, kind] : state.restored,
          log: [...state.log, { verb: "release", weather: kind, at: state.at }],
        },
        restoring ? `The ${INSTRUMENT[kind]} wakes.` : `You release the ${kind}.`,
      );
    }
  }
}

export const INSTRUMENT: Record<Weather, string> = {
  fog: "cloud glass",
  rain: "rain gauge",
  wind: "wind vane",
};
