import type { Action, GameState } from "../game/state";
import { LOCATION_INFO, type LocationId, type Weather } from "../game/world";

/** Only successful verbs qualify; the original tour teaches the actual fog crossing. */
export function guideStepAfter(
  step: number,
  before: GameState,
  action: Action,
  after: GameState,
  practice = false,
): number {
  if (step < 0 || before === after) return step;
  if (practice) {
    if (step === 0 && action.type === "travel") return 1;
    if (step === 1 && action.type === "take") return 2;
    if (step === 2 && action.type === "travel" && before.jar && after.jar === before.jar) return 3;
    if (step === 3 && action.type === "release") return -1;
    return step;
  }
  if (step === 0 && action.type === "travel" && after.at === "ford") return 1;
  if (step === 1 && action.type === "take" && before.at === "ford" && action.weather === "fog")
    return 2;
  if (step === 2 && action.type === "travel" && before.jar === "fog" && after.at === "hollow")
    return 3;
  if (step === 3 && action.type === "release" && before.at === "hollow" && before.jar === "fog")
    return -1;
  return step;
}

export function guideReplayStep(state: GameState): number {
  return state.jar ? 2 : state.weather[state.at].length ? 1 : 0;
}

function releaseEffect(at: LocationId, kind: Weather, state: GameState): string {
  if (at === "shelter") {
    const instrument = { fog: "cloud glass", rain: "rain gauge", wind: "wind vane" }[kind];
    return state.restored.includes(kind)
      ? `The ${instrument} is already awake.`
      : `It wakes the ${instrument}.`;
  }
  if (kind === "fog" && at === "ford") return "Fog hides the stepping stones again.";
  if (kind === "fog" && at === "hollow") return "Fog gathers into the cloud step.";
  if (kind === "fog" && at === "tarn") return "Fog hides the ferry lane.";
  if (kind === "rain" && at === "terrace") return "Rain uncurls the fern stair.";
  if (kind === "wind" && at === "terrace") return "Wind runs the basket lift.";
  if (kind === "wind" && at === "tarn")
    return state.weather.tarn.includes("fog")
      ? "Wind fills the leaf sail, but fog still hides its lane."
      : "Wind fills the leaf sail.";
  return `The ${kind} settles into this diorama.`;
}

export function guideCopy(step: number, state?: GameState, practice = false): [string, string] {
  if (!state)
    return [
      "Follow the weather",
      "Walk to Fog Ford, bottle its fog, carry it to Cairn Hollow and release it to make a cloud step.",
    ];
  const place = LOCATION_INFO[state.at].name;
  if (state.finished)
    return [
      "Above the clouds",
      "All three instruments are awake. Read your notebook, open the postcard or stay a while.",
    ];
  if (step === 0) {
    if (practice)
      return [
        "Follow the open trail",
        `You are at ${place}. Walk along an open path to a place with weather; the path list explains what each crossing needs.`,
      ];
    const jar = state.jar ? `Your jar holds ${state.jar}; release it before borrowing fog. ` : "";
    return [
      "Follow the meadow",
      `${jar}Walk to Fog Ford: tap On, a trail dot, or use the right arrow. Nothing is on a timer.`,
    ];
  }
  if (step === 1) {
    if (state.jar)
      return [
        "One pocket at a time",
        `The jar holds ${state.jar}. Release it where that weather is not already present before taking another kind.`,
      ];
    if (!practice && state.at !== "ford")
      return [
        "Find the fog bank",
        `You are at ${place}. Return to Fog Ford and take its fog to reveal the stepping stones.`,
      ];
    if (!practice)
      return [
        "Borrow a little sky",
        "Take fog at Fog Ford to reveal its stepping stones. Taking weather changes the place you borrowed it from.",
      ];
    const here = state.weather[state.at];
    return here.length
      ? [
          "Borrow a little sky",
          `Take ${here.join(" or ")} at ${place}. Watch what changes at the source; the jar holds just one kind.`,
        ]
      : [
          "Find a pocket of weather",
          `There is no weather to bottle at ${place}. Follow an open path to another diorama; Hint can suggest the next move.`,
        ];
  }
  if (step === 2) {
    if (!practice && state.jar !== "fog")
      return [
        "Find the borrowed fog",
        `${state.jar ? `Your jar holds ${state.jar}; release it first. ` : "The jar is empty. "}Retrieve a pocket of fog and carry it to Cairn Hollow to make the cloud step.`,
      ];
    if (!state.jar)
      return [
        "Borrow before carrying",
        "The jar is empty. Take a pocket of weather, then walk along an open path to another diorama.",
      ];
    if (!practice && state.jar === "fog")
      return [
        "Carry what changed",
        "Carry the fog to Cairn Hollow, just above the ford. Taking it revealed the stones; releasing it in the hollow will make a cloud step.",
      ];
    return [
      "Carry what changed",
      `You hold ${state.jar} at ${place}. Carry it along an open path. If borrowing stopped a crossing, give it back or use another route; Hint can help.`,
    ];
  }
  if (!state.jar)
    return [
      "One pocket at a time",
      "The jar is empty. Borrow weather before you release it; Hint can suggest a useful pocket.",
    ];
  if (!practice && (state.at !== "hollow" || state.jar !== "fog"))
    return [
      "Fog for the marked hollow",
      `You hold ${state.jar} at ${place}. Bring fog to Cairn Hollow and release it there to make the cloud step.`,
    ];
  if (state.weather[state.at].includes(state.jar))
    return [
      "Give it somewhere new",
      `There is already ${state.jar} at ${place}. Carry it to a different diorama before releasing it.`,
    ];
  return [
    "Give it somewhere to go",
    `Release ${state.jar} at ${place} (R). ${releaseEffect(state.at, state.jar, state)} Every borrow can be undone.`,
  ];
}
