// The trail: six dioramas, three weather types and the paths that weather opens or closes.
// Pure data and predicates; no DOM, no three.js.

export const WEATHERS = ["fog", "rain", "wind"] as const;
export type Weather = (typeof WEATHERS)[number];

export const LOCATIONS = ["gate", "ford", "hollow", "terrace", "tarn", "shelter"] as const;
export type LocationId = (typeof LOCATIONS)[number];

export type WeatherMap = Record<LocationId, readonly Weather[]>;

export interface LocationInfo {
  readonly id: LocationId;
  readonly name: string;
  readonly blurb: string;
  /** A log or bench where you can sit and open the notebook. */
  readonly hasSeat: boolean;
}

export const LOCATION_INFO: Record<LocationId, LocationInfo> = {
  gate: {
    id: "gate",
    name: "Wool Gate",
    blurb: "A sheep gate in wet grass. A small shower hangs over the old log.",
    hasSeat: true,
  },
  ford: {
    id: "ford",
    name: "Fog Ford",
    blurb: "A cold beck. Somewhere under the fog are stepping stones.",
    hasSeat: false,
  },
  hollow: {
    id: "hollow",
    name: "Cairn Hollow",
    blurb: "A ring of marker stones around a dip below a mossy ledge.",
    hasSeat: false,
  },
  terrace: {
    id: "terrace",
    name: "Vane Terrace",
    blurb: "A wind vane turns a basket lift. Curled ferns wait along the cliff.",
    hasSeat: true,
  },
  tarn: {
    id: "tarn",
    name: "High Tarn",
    blurb: "Still water under mist. A leaf ferry is moored at the jetty.",
    hasSeat: false,
  },
  shelter: {
    id: "shelter",
    name: "Lantern Shelter",
    blurb: "A tiny hut above the clouds. Its weather instruments are asleep.",
    hasSeat: true,
  },
};

export const INITIAL_WEATHER: WeatherMap = {
  gate: ["rain"],
  ford: ["fog"],
  hollow: [],
  terrace: ["wind"],
  tarn: ["fog", "wind"],
  shelter: [],
};

export type RouteId = "meadow" | "stones" | "cloudstep" | "lift" | "ferns" | "ferry";

export interface Route {
  readonly id: RouteId;
  readonly a: LocationId;
  readonly b: LocationId;
  readonly name: string;
  /** Why the route is open or closed, phrased for the player. */
  readonly open: (w: WeatherMap) => boolean;
  readonly closedReason: (w: WeatherMap) => string;
}

export const has = (w: WeatherMap, at: LocationId, kind: Weather): boolean => w[at].includes(kind);

export const ROUTES: readonly Route[] = [
  {
    id: "meadow",
    a: "gate",
    b: "ford",
    name: "meadow path",
    open: () => true,
    closedReason: () => "",
  },
  {
    id: "stones",
    a: "ford",
    b: "hollow",
    name: "stepping stones",
    open: (w) => !has(w, "ford", "fog"),
    closedReason: () => "Fog hides the stepping stones.",
  },
  {
    id: "cloudstep",
    a: "hollow",
    b: "terrace",
    name: "cloud step",
    open: (w) => has(w, "hollow", "fog"),
    closedReason: () => "The ledge is too high. The marked hollow is empty.",
  },
  {
    id: "lift",
    a: "terrace",
    b: "tarn",
    name: "basket lift",
    open: (w) => has(w, "terrace", "wind"),
    closedReason: () => "The lift is still: no breeze turns its vane.",
  },
  {
    id: "ferns",
    a: "terrace",
    b: "tarn",
    name: "fern stair",
    open: (w) => has(w, "terrace", "rain"),
    closedReason: () => "The fern fronds are curled up and dry.",
  },
  {
    id: "ferry",
    a: "tarn",
    b: "shelter",
    name: "leaf ferry",
    open: (w) => has(w, "tarn", "wind") && !has(w, "tarn", "fog"),
    closedReason: (w) =>
      has(w, "tarn", "fog")
        ? "Mist hides the ferry lane across the tarn."
        : "The leaf sail hangs slack: no breeze on the tarn.",
  },
];

export const indexOf = (id: LocationId): number => LOCATIONS.indexOf(id);

/** Routes touching a location, with the far end. */
export function routesFrom(at: LocationId): { route: Route; to: LocationId }[] {
  return ROUTES.filter((r) => r.a === at || r.b === at).map((route) => ({
    route,
    to: route.a === at ? route.b : route.a,
  }));
}
