import { describe, expect, test } from "bun:test";
import {
  type KeyboardTarget,
  type KeyInput,
  keyboardCommand,
  suppressRepeatedActivation,
} from "../src/ui/keyboard";

const command = (key: string, target: KeyboardTarget = "other", extra: Partial<KeyInput> = {}) =>
  keyboardCommand({ key, target, ...extra }, "done", false);

describe("one intentional keyboard action", () => {
  test("Enter begins the title once without duplicating the focused button", () => {
    expect(keyboardCommand({ key: "Enter", target: "other" }, "title", false)).toEqual({
      type: "begin",
    });
    for (const target of ["button", "scroll-button"] as const)
      expect(keyboardCommand({ key: "Enter", target }, "title", false)).toBeNull();
    expect(
      keyboardCommand({ key: "Enter", target: "other", repeat: true }, "title", false),
    ).toBeNull();
    expect(keyboardCommand({ key: "Enter", target: "other" }, "glide", false)).toBeNull();
  });

  test("native button Enter and Space never add a second global play action", () => {
    for (const key of ["Enter", " "])
      for (const target of ["other", "button", "scroll", "scroll-button"] as const)
        expect(command(key, target)).toBeNull();
  });

  test("a held shortcut does not move several stops or toggle a panel repeatedly", () => {
    for (const key of ["ArrowLeft", "ArrowRight", "a", "d", "1", "2", "3", "r", "h", "n", "m"])
      expect(command(key, "button", { repeat: true })).toBeNull();
  });

  test("HUD buttons preserve arrow travel after focus restoration", () => {
    expect(command("ArrowRight", "button")).toEqual({ type: "travel", direction: 1 });
    expect(command("D", "button")).toEqual({ type: "travel", direction: 1 });
    expect(command("ArrowLeft", "button")).toEqual({ type: "travel", direction: -1 });
    expect(command("A", "button")).toEqual({ type: "travel", direction: -1 });
  });

  test("reading surfaces and their buttons retain native directional scrolling", () => {
    for (const target of ["scroll", "scroll-button"] as const)
      for (const key of ["ArrowLeft", "ArrowRight", "a", "d", "ArrowUp", "ArrowDown", " "])
        expect(command(key, target)).toBeNull();
  });

  test("dialogs allow Sound but block all trail mutations and other panels", () => {
    expect(keyboardCommand({ key: "M", target: "button" }, "done", true)).toEqual({ type: "mute" });
    for (const key of ["ArrowRight", "a", "1", "2", "3", "r", "h", "n", "Enter", " "])
      expect(keyboardCommand({ key, target: "button" }, "done", true)).toBeNull();
  });

  test("text editing, browser modifiers and already handled events never invoke shortcuts", () => {
    for (const key of ["d", "r", "n", "m", "1", "Enter"])
      for (const extra of [
        { target: "text" as const },
        { ctrlKey: true },
        { altKey: true },
        { metaKey: true },
        { defaultPrevented: true },
      ])
        expect(command(key, "other", extra)).toBeNull();
  });

  test("the weather numbers and release shortcut match the visible jar buttons", () => {
    expect(command("1")).toEqual({ type: "take", weather: "fog" });
    expect(command("2")).toEqual({ type: "take", weather: "rain" });
    expect(command("3")).toEqual({ type: "take", weather: "wind" });
    expect(command("R")).toEqual({ type: "release" });
  });

  test("held activation is suppressed on buttons while native Space scrolling survives", () => {
    for (const target of ["button", "scroll-button"] as const)
      for (const key of ["Enter", " "])
        expect(suppressRepeatedActivation({ key, target, repeat: true })).toBe(true);
    expect(suppressRepeatedActivation({ key: " ", target: "scroll", repeat: true })).toBe(false);
    expect(suppressRepeatedActivation({ key: "Enter", target: "text", repeat: true })).toBe(false);
    expect(suppressRepeatedActivation({ key: " ", target: "button" })).toBe(false);
    expect(
      suppressRepeatedActivation({ key: "Enter", target: "button", repeat: true, ctrlKey: true }),
    ).toBe(false);
  });
});
