// Breadth-first search over puzzle states. Used by tests to prove the trail is fair
// and in play to give a hint that is always a step along a shortest route home.

import { type Action, apply, type GameState, INSTRUMENT, openRoutes } from "./state";
import { LOCATION_INFO, ROUTES, routesFrom, WEATHERS } from "./world";

export function stateKey(s: GameState): string {
  const w = Object.values(s.weather)
    .map((k) => k.map((x) => x[0]).join(""))
    .join("|");
  return `${s.at}/${s.jar ?? "-"}/${w}/${[...s.restored].sort().join("")}`;
}

/** Actions that succeed from this state; travel only to direct neighbours. */
export function moves(s: GameState): Action[] {
  const out: Action[] = [];
  for (const { route, to } of routesFrom(s.at)) {
    if (route.open(s.weather)) out.push({ type: "travel", to });
  }
  if (s.jar === null) {
    for (const kind of s.weather[s.at]) out.push({ type: "take", weather: kind });
  } else if (!s.weather[s.at].includes(s.jar)) {
    out.push({ type: "release" });
  }
  return out;
}

/** Shortest list of actions from `start` to a finished trail, or null if impossible. */
export function solve(start: GameState): Action[] | null {
  if (start.finished) return [];
  const prev = new Map<string, { from: string; action: Action } | null>();
  prev.set(stateKey(start), null);
  let frontier: GameState[] = [start];
  while (frontier.length > 0) {
    const next: GameState[] = [];
    for (const s of frontier) {
      for (const action of moves(s)) {
        const t = apply(s, action).state;
        const key = stateKey(t);
        if (prev.has(key)) continue;
        prev.set(key, { from: stateKey(s), action });
        if (t.finished) return unwind(prev, key);
        next.push(t);
      }
    }
    frontier = next;
  }
  return null;
}

function unwind(prev: Map<string, { from: string; action: Action } | null>, key: string): Action[] {
  const path: Action[] = [];
  let step = prev.get(key);
  while (step) {
    path.unshift(step.action);
    step = prev.get(step.from);
  }
  return path;
}

export interface StateGraph {
  readonly states: Map<string, GameState>;
  /** For each state key, the keys of states that lead into it. */
  readonly parents: Map<string, string[]>;
}

/** Every state reachable from `start`, with the edges between them. */
export function explore(start: GameState): StateGraph {
  const states = new Map<string, GameState>([[stateKey(start), start]]);
  const parents = new Map<string, string[]>();
  const queue: GameState[] = [start];
  for (let i = 0; i < queue.length; i++) {
    const s = queue[i] as GameState;
    const from = stateKey(s);
    for (const action of moves(s)) {
      const t = apply(s, action).state;
      const key = stateKey(t);
      const list = parents.get(key);
      if (list) list.push(from);
      else parents.set(key, [from]);
      if (!states.has(key)) {
        states.set(key, t);
        queue.push(t);
      }
    }
  }
  return { states, parents };
}

/** Keys of reachable states from which the trail can still be finished. */
export function finishable(graph: StateGraph): Set<string> {
  const good = new Set<string>();
  const queue: string[] = [];
  for (const [key, s] of graph.states) {
    if (s.finished) {
      good.add(key);
      queue.push(key);
    }
  }
  for (let i = 0; i < queue.length; i++) {
    for (const p of graph.parents.get(queue[i] as string) ?? []) {
      if (good.has(p)) continue;
      good.add(p);
      queue.push(p);
    }
  }
  return good;
}

/** A gentle, specific nudge: the next take or release worth doing, and what it changes. */
export function hint(s: GameState): string {
  if (s.finished) return "The shelter is awake. Open your postcard.";
  const plan = solve(s);
  if (!plan) return "Try undoing your last release by bottling it again.";
  const idx = plan.findIndex((a) => a.type !== "travel");
  const action = plan[idx];
  if (!action) return "Keep walking up the trail.";
  const before = idx > 0 ? replay(s, plan.slice(0, idx)) : s;
  const place = LOCATION_INFO[before.at].name;
  const where = before.at === s.at ? "Here" : `At ${place}`;
  const after = apply(before, action).state;
  const effect = describeChange(before, after);
  const kind = action.type === "take" ? action.weather : before.jar;
  const verb = action.type === "take" ? `borrow the ${kind}` : `release your ${kind}`;
  return `${where}, ${verb}${effect ? ` — ${effect}` : ""}.`;
}

function replay(s: GameState, actions: Action[]): GameState {
  return actions.reduce((acc, a) => apply(acc, a).state, s);
}

/** What a take or release opens, closes or restores, in plain words. */
export function describeChange(before: GameState, after: GameState): string {
  const was = openRoutes(before.weather);
  const now = openRoutes(after.weather);
  const parts: string[] = [];
  for (const r of ROUTES) {
    if (!was.has(r.id) && now.has(r.id)) parts.push(`it opens the ${r.name}`);
    if (was.has(r.id) && !now.has(r.id)) parts.push(`it stops the ${r.name}`);
  }
  for (const k of WEATHERS) {
    if (!before.restored.includes(k) && after.restored.includes(k))
      parts.push(`it wakes the ${INSTRUMENT[k]}`);
  }
  if (parts.length === 0 && after.jar) parts.push("you will need it elsewhere");
  if (parts.length === 0) parts.push("it frees the jar for something else");
  return parts.join(", and ");
}
