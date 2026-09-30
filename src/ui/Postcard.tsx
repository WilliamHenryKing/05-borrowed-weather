// The ending: the notebook becomes a postcard of the route you actually took.

import type { GameState } from "../game/state";
import { LOCATION_INFO, LOCATIONS, type LocationId, type Weather } from "../game/world";
import { WeatherGlyph } from "./Glyphs";

const MAP: Record<LocationId, [number, number]> = {
  gate: [40, 210],
  ford: [150, 180],
  hollow: [70, 140],
  terrace: [180, 105],
  tarn: [90, 70],
  shelter: [200, 32],
};

/** Pair each take with the release that followed it: "fog: Fog Ford → Cairn Hollow". */
function carries(
  state: GameState,
): { kind: Weather; from: LocationId; to: LocationId; n: number }[] {
  const out: { kind: Weather; from: LocationId; to: LocationId; n: number }[] = [];
  for (let i = 0; i < state.log.length; i++) {
    const take = state.log[i];
    const drop = state.log[i + 1];
    if (take?.verb === "take" && drop?.verb === "release" && drop.at !== take.at) {
      out.push({ kind: take.weather, from: take.at, to: drop.at, n: i });
    }
  }
  return out;
}

export function Postcard({
  state,
  onReplay,
  onClose,
}: {
  state: GameState;
  onReplay: () => void;
  onClose: () => void;
}) {
  const walked = state.trail.length - 1;
  const takes = state.log.filter((e) => e.verb === "take").length;
  const points = state.trail.map((id, i) => {
    const [x, y] = MAP[id];
    const wobble = Math.sin(i * 2.3) * 5;
    return `${x + wobble},${y + Math.cos(i * 1.7) * 4}`;
  });
  const lines = carries(state);
  return (
    <div className="paper postcard grid gap-0 sm:grid-cols-[1.1fr_1fr]">
      <div className="postcard-map relative bg-[#dfe6dc] p-3">
        <svg
          viewBox="0 0 250 240"
          className="h-auto w-full"
          role="img"
          aria-label="Map of the route you walked"
        >
          <defs>
            <linearGradient id="pc-sky" x1="0" x2="0" y1="0" y2="1">
              <stop offset="0" stopColor="#f6e2c0" />
              <stop offset="1" stopColor="#b9c9c2" />
            </linearGradient>
          </defs>
          <rect width="250" height="240" fill="url(#pc-sky)" />
          <path d="M0 240L60 120 110 150 170 50 250 90V240z" fill="#8a9a7a" opacity="0.5" />
          <path
            d="M0 96q60-14 125 0t125 0"
            fill="none"
            stroke="#fff"
            strokeWidth="10"
            opacity="0.6"
          />
          <polyline
            points={points.join(" ")}
            fill="none"
            stroke="#a0482f"
            strokeWidth="1.4"
            strokeDasharray="3 3"
            opacity="0.75"
          />
          {LOCATIONS.map((id) => {
            const [x, y] = MAP[id];
            return (
              <g key={id}>
                <circle
                  cx={x}
                  cy={y}
                  r={id === "shelter" ? 7 : 5}
                  fill={id === "shelter" ? "#ffb45e" : "#3b2e22"}
                />
                <text
                  x={id === "shelter" ? x - 11 : x + 9}
                  y={y + 4}
                  textAnchor={id === "shelter" ? "end" : "start"}
                  fontSize="9"
                  fill="#3b2e22"
                  fontFamily="Georgia, serif"
                >
                  {LOCATION_INFO[id].name}
                </text>
              </g>
            );
          })}
        </svg>
        <p className="absolute right-4 bottom-3 rotate-[-4deg] rounded border-2 border-[#a0482f] px-2 py-0.5 font-sans text-[10px] font-bold tracking-widest text-[#a0482f] uppercase">
          Above the clouds
        </p>
      </div>
      <div className="p-5 sm:p-6">
        <h2 className="text-2xl italic">Greetings from the Lantern Shelter</h2>
        <p className="mt-2 text-sm leading-relaxed">
          The cloud glass, the rain gauge and the wind vane are all awake again, and the lantern is
          lit. I walked {walked} stretches of trail and borrowed weather {takes} times.
        </p>
        <ul className="mt-3 space-y-1 text-sm">
          {lines.slice(0, 7).map((l) => (
            <li key={l.n} className="flex items-center gap-2">
              <WeatherGlyph kind={l.kind} size={16} />
              {LOCATION_INFO[l.from].name} → {LOCATION_INFO[l.to].name}
            </li>
          ))}
        </ul>
        <div className="mt-3 flex gap-2 text-ink" aria-hidden="true">
          {(["fog", "rain", "wind"] as const).map((k) => (
            <span key={k} className="rounded-full border border-ink/40 p-1.5">
              <WeatherGlyph kind={k} />
            </span>
          ))}
        </div>
        <div className="mt-5 flex flex-wrap justify-end gap-2">
          <button type="button" className="btn" onClick={onClose}>
            Stay a while
          </button>
          <button type="button" className="btn btn-warm" onClick={onReplay}>
            Walk it again
          </button>
        </div>
      </div>
    </div>
  );
}
