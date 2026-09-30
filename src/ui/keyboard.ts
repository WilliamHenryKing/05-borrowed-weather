import type { Weather } from "../game/world";

export type KeyboardTarget = "text" | "button" | "scroll" | "scroll-button" | "other";
export interface KeyInput {
  key: string;
  target: KeyboardTarget;
  repeat?: boolean;
  defaultPrevented?: boolean;
  ctrlKey?: boolean;
  altKey?: boolean;
  metaKey?: boolean;
}
export type KeyboardCommand =
  | { type: "travel"; direction: -1 | 1 }
  | { type: "take"; weather: Weather }
  | { type: "release" | "hint" | "notebook" | "mute" | "begin" };

const blocked = (input: KeyInput) =>
  input.defaultPrevented ||
  input.ctrlKey ||
  input.altKey ||
  input.metaKey ||
  input.target === "text";

/** Keep held Enter from repeatedly clicking native buttons; held Space still scrolls a page. */
export function suppressRepeatedActivation(input: KeyInput): boolean {
  return (
    !blocked(input) &&
    !!input.repeat &&
    input.target !== "scroll" &&
    (input.key === "Enter" || input.key === " ")
  );
}

export function keyboardCommand(
  input: KeyInput,
  opening: "title" | "glide" | "done",
  panelOpen: boolean,
): KeyboardCommand | null {
  if (blocked(input) || input.repeat) return null;
  const key = input.key.toLowerCase();
  const button = input.target === "button" || input.target === "scroll-button";
  if (opening !== "done")
    return opening === "title" && key === "enter" && !button ? { type: "begin" } : null;
  if (key === "m") return { type: "mute" };
  if (panelOpen) return null;
  if (input.target !== "scroll" && input.target !== "scroll-button") {
    if (key === "arrowleft" || key === "a") return { type: "travel", direction: -1 };
    if (key === "arrowright" || key === "d") return { type: "travel", direction: 1 };
  }
  if (key === "1") return { type: "take", weather: "fog" };
  if (key === "2") return { type: "take", weather: "rain" };
  if (key === "3") return { type: "take", weather: "wind" };
  if (key === "r") return { type: "release" };
  if (key === "h") return { type: "hint" };
  if (key === "n") return { type: "notebook" };
  return null;
}

export function keyboardTarget(target: EventTarget | null): KeyboardTarget {
  if (!(target instanceof HTMLElement)) return "other";
  if (target.isContentEditable || target.closest("input,textarea,select")) return "text";
  if (target.closest("button")) {
    if (target.closest(".trail-actions,.trail-nav,.hud-tools")) return "button";
    return target.closest(".keyboard-scroll") ? "scroll-button" : "button";
  }
  return target.closest(".keyboard-scroll") ? "scroll" : "other";
}
