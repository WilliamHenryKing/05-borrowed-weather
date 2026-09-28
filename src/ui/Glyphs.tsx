// Small hand-drawn SVG glyphs: weather marks, the jar and notebook sketches.

import { useId } from "react";
import type { Discovery } from "../game/notebook";
import type { Weather } from "../game/world";

const STROKE = {
  fill: "none",
  stroke: "currentColor",
  strokeWidth: 1.6,
  strokeLinecap: "round",
  strokeLinejoin: "round",
} as const;

export function WeatherGlyph({ kind, size = 18 }: { kind: Weather; size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" aria-hidden="true" {...STROKE}>
      {kind === "fog" && (
        <>
          <path d="M3 9h13M6 13h15M3 17h12" />
          <path d="M18 9h2" />
        </>
      )}
      {kind === "rain" && (
        <>
          <path d="M6 12a4 4 0 0 1 3-6.5A5 5 0 0 1 18.5 8 3.5 3.5 0 0 1 18 15H7a3 3 0 0 1-1-3z" />
          <path d="M8 18l-1 3M12 18l-1 3M16 18l-1 3" />
        </>
      )}
      {kind === "wind" && <path d="M3 9h11a3 3 0 1 0-3-3M3 14h15a3 3 0 1 1-3 3M3 19h7" />}
    </svg>
  );
}

export function SoundGlyph({ muted }: { muted: boolean }) {
  return (
    <svg width={18} height={18} viewBox="0 0 24 24" aria-hidden="true" {...STROKE}>
      <path d="M4 9h4l5-4v14l-5-4H4z" />
      {muted ? (
        <path d="M17 9l5 6M22 9l-5 6" />
      ) : (
        <path d="M16.5 8.5a5 5 0 0 1 0 7M19 6a8.5 8.5 0 0 1 0 12" />
      )}
    </svg>
  );
}

const JAR_FILL: Record<Weather, string> = { fog: "#dfe6e4", rain: "#8fc0dc", wind: "#e8dca0" };

/** The jar, with a swatch of whatever weather it holds and a little condensation. */
const BODY = "M13 10h20v4c5 2 7 6 7 11v21c0 4-3 7-7 7H13c-4 0-7-3-7-7V25c0-5 2-9 7-11z";

/** The jar, showing what swirls inside it; it gulps whenever its contents change. */
export function Jar({ holding }: { holding: Weather | null }) {
  const clip = useId();
  return (
    <svg
      key={holding ?? "empty"}
      className="jar-gulp"
      width="46"
      height="56"
      viewBox="0 0 46 56"
      aria-hidden="true"
    >
      <defs>
        <clipPath id={clip}>
          <path d={BODY} />
        </clipPath>
      </defs>
      <rect x="11" y="3" width="24" height="7" rx="2" fill="#b58a45" />
      <path d={BODY} fill="rgb(230 242 240 / 0.18)" />
      <g clipPath={`url(#${clip})`}>
        {holding === "fog" && (
          <g className="jar-swirl" fill={JAR_FILL.fog}>
            <ellipse cx="17" cy="36" rx="9" ry="5" opacity="0.8" />
            <ellipse cx="29" cy="32" rx="10" ry="6" opacity="0.7" />
            <ellipse cx="23" cy="44" rx="12" ry="5" opacity="0.9" />
            <ellipse cx="24" cy="26" rx="7" ry="3.5" opacity="0.55" />
          </g>
        )}
        {holding === "rain" && (
          <g fill={JAR_FILL.rain}>
            <rect x="6" y="45" width="34" height="9" opacity="0.9" />
            {[12, 18, 24, 30, 35].map((x, i) => (
              <path
                key={x}
                className="jar-drop"
                style={{ animationDelay: `${i * 0.23}s` }}
                d={`M${x} 18q2 3 0 5q-2-2 0-5z`}
              />
            ))}
          </g>
        )}
        {holding === "wind" && (
          <g fill="none" stroke={JAR_FILL.wind} strokeWidth="2" strokeLinecap="round">
            {["M6 26q9-5 17 0t17 0", "M6 36q9 5 17 0t17 0", "M6 46q9-5 17 0t17 0"].map((d, i) => (
              <path
                key={d}
                className="jar-streak"
                style={{ animationDelay: `${i * 0.3}s` }}
                d={d}
              />
            ))}
          </g>
        )}
      </g>
      <path d={BODY} fill="none" stroke="#e8f0ee" strokeWidth="1.6" />
      <g fill="#ffffff" opacity="0.7">
        <circle cx="12" cy="22" r="1" />
        <circle cx="35" cy="28" r="0.8" />
        <circle cx="31" cy="44" r="1.1" />
        <circle cx="14" cy="47" r="0.7" />
      </g>
    </svg>
  );
}

export function Sketch({ kind }: { kind: Discovery["sketch"] }) {
  return (
    <svg
      width="56"
      height="44"
      viewBox="0 0 56 44"
      aria-hidden="true"
      {...STROKE}
      strokeWidth={1.3}
    >
      {kind === "jar" && (
        <>
          <rect x="20" y="4" width="16" height="5" rx="1" />
          <path d="M21 9h14v3c4 1 5 4 5 8v15c0 3-2 5-5 5H21c-3 0-5-2-5-5V20c0-4 1-7 5-8z" />
          <path d="M20 28h16" strokeDasharray="2 3" />
        </>
      )}
      {kind === "fog" && (
        <>
          <path d="M4 32q12-6 24 0t24 0" />
          <ellipse cx="16" cy="30" rx="5" ry="2" />
          <ellipse cx="30" cy="31" rx="5" ry="2" />
          <ellipse cx="43" cy="30" rx="5" ry="2" />
          <path d="M6 14h20M10 19h26" strokeDasharray="3 3" />
        </>
      )}
      {kind === "cloud" && (
        <>
          <path d="M6 36q22 10 44 0" />
          <path d="M14 30a6 6 0 0 1 8-8 8 8 0 0 1 14 2 5 5 0 0 1 4 8z" />
          <path d="M40 10v14M36 14l4-4 4 4" />
        </>
      )}
      {kind === "vane" && (
        <>
          <path d="M18 40V10" />
          <path d="M18 10l10-6M18 10l-10 6M18 10l6 10M18 10l-6-10" />
          <path d="M22 40l24-30" strokeDasharray="2 2" />
          <rect x="36" y="18" width="7" height="6" />
        </>
      )}
      {kind === "pause" && (
        <>
          <path d="M14 40V10M14 10l8-5M14 10l-8 5" />
          <rect x="30" y="16" width="14" height="18" rx="4" />
          <path d="M33 25h8" />
          <path d="M22 26h6" strokeDasharray="1 2" />
        </>
      )}
      {kind === "fern" && (
        <>
          <path d="M6 40q6-14 20-16" />
          <circle cx="12" cy="18" r="4" />
          <path d="M26 24q10-2 22 0M34 18h14M30 30h16" />
        </>
      )}
      {kind === "ferry" && (
        <>
          <path d="M8 30q20 10 40 0q-20-6-40 0z" />
          <path d="M28 30V10l10 14z" />
          <path d="M4 38q6-2 12 0t12 0t12 0t12 0" />
        </>
      )}
      {kind === "lantern" && (
        <>
          <path d="M8 40V22l12-10 12 10v18z" />
          <rect x="16" y="30" width="7" height="10" />
          <path d="M40 16v6M37 22h6v8h-6zM36 30h8" />
        </>
      )}
    </svg>
  );
}
