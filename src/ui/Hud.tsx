// Heads-up display: where you are, what the paths are doing, the jar and its verbs.

import { type Action, type GameState, reachable } from "../game/state";
import { LOCATION_INFO, LOCATIONS, type LocationId, routesFrom, type Weather } from "../game/world";
import { Jar, WeatherGlyph } from "./Glyphs";

interface HudProps {
  state: GameState;
  message: string;
  onAction: (a: Action) => void;
  onNotebook: () => void;
  onHint: () => void;
  hint: string | null;
}

const KEY: Record<Weather, string> = { fog: "1", rain: "2", wind: "3" };

export function Hud({ state, message, onAction, onNotebook, onHint, hint }: HudProps) {
  const info = LOCATION_INFO[state.at];
  const idx = LOCATIONS.indexOf(state.at);
  const canReach = reachable(state.weather, state.at);
  const here = state.weather[state.at];
  const prev = LOCATIONS[idx - 1];
  const next = LOCATIONS[idx + 1];
  const canRelease = state.jar !== null && !here.includes(state.jar);
  const travel = (to: LocationId | undefined) => to && onAction({ type: "travel", to });

  return (
    <div className="pointer-events-none absolute inset-0 flex flex-col justify-between p-3 sm:p-5">
      <header className="flex items-start justify-between gap-3">
        <section
          className="panel pointer-events-auto max-w-md rounded-2xl p-3 sm:p-4"
          aria-labelledby="place"
        >
          <p className="text-[11px] font-semibold tracking-[0.2em] text-moss-300 uppercase">
            Trail · {idx + 1} of {LOCATIONS.length}
          </p>
          <h1 id="place" className="font-serif text-xl leading-tight sm:text-2xl">
            {info.name}
          </h1>
          <p className="mt-1 hidden text-sm text-paper/85 sm:block">{info.blurb}</p>
          <ul className="mt-2 space-y-1 text-[13px]" aria-label="Paths from here">
            {routesFrom(state.at).map(({ route, to }) => {
              const open = route.open(state.weather);
              return (
                <li key={route.id} className={open ? "text-paper" : "text-paper/60"}>
                  <span aria-hidden="true" className={open ? "text-lantern" : ""}>
                    {open ? "● " : "○ "}
                  </span>
                  {LOCATIONS.indexOf(to) > idx ? "Up" : "Back"} by the {route.name}:{" "}
                  {open ? "open" : route.closedReason(state.weather)}
                </li>
              );
            })}
          </ul>
        </section>
        <div className="pointer-events-auto flex flex-col items-end gap-2 sm:flex-row">
          <button type="button" className="btn" onClick={onNotebook} aria-keyshortcuts="N">
            {info.hasSeat ? "Sit & read notebook" : "Notebook"}
            <span className="rounded-full bg-paper/15 px-1.5 text-xs">
              {state.discoveries.length}
            </span>
          </button>
          <button type="button" className="btn" onClick={onHint} aria-keyshortcuts="H">
            Hint
          </button>
        </div>
      </header>

      <div className="flex flex-col items-center gap-2">
        {hint && (
          <p
            className="panel pointer-events-auto max-w-lg rounded-xl px-4 py-2 text-center text-sm"
            role="note"
          >
            <span className="font-semibold text-lantern">Hint · </span>
            {hint}
          </p>
        )}
        <p
          className="panel max-w-lg rounded-full px-4 py-1.5 text-center text-sm empty:hidden"
          aria-live="polite"
        >
          {message}
        </p>
        <nav aria-label="Trail" className="pointer-events-auto flex gap-1.5">
          {LOCATIONS.map((id) => {
            const open = canReach.has(id);
            return (
              <button
                key={id}
                type="button"
                onClick={() => onAction({ type: "travel", to: id })}
                aria-label={`${LOCATION_INFO[id].name}${id === state.at ? " (you are here)" : open ? "" : " (not reachable yet)"}`}
                aria-current={id === state.at ? "location" : undefined}
                className={`h-3 w-7 rounded-full border border-paper/60 transition ${
                  id === state.at ? "bg-lantern" : open ? "bg-paper/70" : "bg-moss-950/40"
                }`}
              />
            );
          })}
        </nav>
        <section
          className="panel pointer-events-auto flex w-full max-w-2xl flex-wrap items-center justify-center gap-2 rounded-3xl p-2 sm:flex-nowrap sm:rounded-full"
          aria-label="Jar and trail actions"
        >
          <button
            type="button"
            className="btn"
            disabled={!prev}
            onClick={() => travel(prev)}
            aria-label={prev ? `Walk back to ${LOCATION_INFO[prev].name}` : "No way back"}
            aria-keyshortcuts="ArrowLeft"
          >
            ←<span className="hidden md:inline">Back</span>
          </button>
          <div className="flex items-center gap-2 px-1">
            <Jar holding={state.jar} />
            <span className="sr-only">Jar holds {state.jar ?? "nothing"}.</span>
          </div>
          {here.length === 0 && !state.jar && (
            <span className="px-2 text-sm text-paper/70">Still air here</span>
          )}
          {here.map((k) => (
            <button
              key={k}
              type="button"
              className="btn"
              disabled={state.jar !== null}
              onClick={() => onAction({ type: "take", weather: k })}
              aria-keyshortcuts={KEY[k]}
              title={state.jar ? "Release the jar first" : `Take the ${k} (${KEY[k]})`}
            >
              <WeatherGlyph kind={k} />
              Take {k}
            </button>
          ))}
          {state.jar && (
            <button
              type="button"
              className="btn btn-warm"
              disabled={!canRelease}
              onClick={() => onAction({ type: "release" })}
              aria-keyshortcuts="R"
              title={canRelease ? "Release (R)" : `There is already ${state.jar} here`}
            >
              <WeatherGlyph kind={state.jar} />
              Release {state.jar}
            </button>
          )}
          <button
            type="button"
            className="btn"
            disabled={!next}
            onClick={() => travel(next)}
            aria-label={next ? `Walk on to ${LOCATION_INFO[next].name}` : "End of the trail"}
            aria-keyshortcuts="ArrowRight"
          >
            <span className="hidden md:inline">On</span>→
          </button>
        </section>
      </div>
    </div>
  );
}
