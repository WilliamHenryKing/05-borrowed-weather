// The field notebook: every rule you have witnessed, written in pencil, with a sketch.

import { DISCOVERIES } from "../game/notebook";
import type { GameState } from "../game/state";
import { LOCATION_INFO } from "../game/world";
import { Sketch } from "./Glyphs";

export function Notebook({ state, onClose }: { state: GameState; onClose: () => void }) {
  const seated = LOCATION_INFO[state.at].hasSeat;
  return (
    <div className="paper p-5 sm:p-7">
      <div className="flex items-baseline justify-between gap-4">
        <h2 className="text-2xl italic">Field notebook</h2>
        <p className="font-sans text-xs tracking-widest text-ink/60 uppercase">
          {state.discoveries.length} / {DISCOVERIES.length} noted
        </p>
      </div>
      <p className="mt-1 text-sm text-ink/75">
        {seated
          ? `You sit on the log at ${LOCATION_INFO[state.at].name}, wring out your cuffs and read back.`
          : "You lean on your stick and thumb the damp pages."}
      </p>
      <ol className="mt-4 space-y-3">
        {DISCOVERIES.map((d) => {
          const known = state.discoveries.includes(d.id);
          return (
            <li key={d.id} className="flex gap-3 border-b border-ink/10 pb-3 last:border-0">
              <span className={`shrink-0 ${known ? "text-ink" : "text-ink/20"}`}>
                <Sketch kind={d.sketch} />
              </span>
              <div>
                <h3 className={`font-semibold ${known ? "" : "text-ink/35"}`}>
                  {known ? d.title : "Not yet seen"}
                </h3>
                <p className="text-sm leading-snug text-ink/80">
                  {known ? d.text : "A blank line, waiting for weather."}
                </p>
              </div>
            </li>
          );
        })}
      </ol>
      <div className="mt-5 flex justify-end">
        <button type="button" className="btn btn-warm" onClick={onClose}>
          Back to the trail
        </button>
      </div>
    </div>
  );
}
