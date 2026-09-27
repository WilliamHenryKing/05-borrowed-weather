// Wires the pure game to the three.js trail and the React HUD.

import { useCallback, useEffect, useRef, useState } from "react";
import { cuesFor } from "../audio/cues";
import { ambienceMix } from "../audio/mix";
import { SoundBoard } from "../audio/sound";
import { DISCOVERIES } from "../game/notebook";
import { hint as nextHint } from "../game/solver";
import { type Action, apply, createGame, type GameState } from "../game/state";
import { LOCATIONS, type LocationId, WEATHERS } from "../game/world";
import { worldReady } from "../loader";
import { TrailScene } from "../scene/trail";
import { Hud } from "./Hud";
import { Intro } from "./Intro";
import { Modal } from "./Modal";
import { Notebook } from "./Notebook";
import { Postcard } from "./Postcard";

const reducedMotion = () => window.matchMedia("(prefers-reduced-motion: reduce)").matches;

export function App() {
  const host = useRef<HTMLDivElement>(null);
  const scene = useRef<TrailScene | null>(null);
  const [game, setGame] = useState<GameState>(createGame);
  const gameRef = useRef(game);
  const [message, setMessage] = useState("");
  const [hint, setHint] = useState<string | null>(null);
  const [intro, setIntro] = useState(true);
  const [panel, setPanel] = useState<"none" | "notebook" | "postcard">("none");
  const [sound] = useState(() => new SoundBoard());
  const [muted, setMuted] = useState(sound.muted);
  const lastPanel = useRef(panel);

  const act = useCallback(
    (action: Action) => {
      const before = gameRef.current;
      const out = apply(before, action);
      const noted = out.found
        .map((id) => DISCOVERIES.find((d) => d.id === id)?.title)
        .filter(Boolean)
        .map((t) => ` Noted: “${t}”.`)
        .join("");
      setMessage(out.message + noted);
      for (const c of cuesFor(before, out)) sound.play(c.name, c);
      if (!out.ok) return;
      gameRef.current = out.state;
      setGame(out.state);
      setHint(null);
      setIntro(false);
      if (out.state.finished && !before.finished)
        window.setTimeout(() => setPanel("postcard"), 1400);
    },
    [sound],
  );

  useEffect(() => {
    const el = host.current;
    if (!el) return;
    const trail = new TrailScene(el, reducedMotion(), () => requestAnimationFrame(worldReady));
    trail.sync(gameRef.current, true);
    trail.onPick = (to: LocationId) => act({ type: "travel", to });
    trail.start();
    scene.current = trail;
    const mq = window.matchMedia("(prefers-reduced-motion: reduce)");
    const onMotion = () => trail.setCalm(mq.matches);
    mq.addEventListener("change", onMotion);
    return () => {
      mq.removeEventListener("change", onMotion);
      trail.dispose();
      scene.current = null;
    };
  }, [act]);

  useEffect(() => {
    scene.current?.sync(game);
    sound.setMix(ambienceMix(game));
  }, [game, sound]);

  // Audio starts on the first gesture; nothing is fetched before then.
  useEffect(() => {
    const unlock = () => sound.unlock();
    window.addEventListener("pointerdown", unlock, true);
    window.addEventListener("keydown", unlock, true);
    return () => {
      window.removeEventListener("pointerdown", unlock, true);
      window.removeEventListener("keydown", unlock, true);
    };
  }, [sound]);

  useEffect(() => {
    const was = lastPanel.current;
    lastPanel.current = panel;
    if (was === panel) return;
    if (panel === "notebook") sound.play("book-open");
    else if (panel === "postcard") sound.play("page");
    else if (was === "notebook") sound.play("book-close");
    sound.setDucked(panel !== "none");
  }, [panel, sound]);

  const toggleMute = useCallback(() => {
    const next = !sound.muted;
    sound.setMuted(next);
    setMuted(next);
    if (!next) sound.play("toggle");
  }, [sound]);

  const replay = useCallback(() => {
    const fresh = createGame();
    gameRef.current = fresh;
    setGame(fresh);
    scene.current?.sync(fresh, true);
    setPanel("none");
    setHint(null);
    setMessage("A fresh morning at the Wool Gate.");
  }, []);

  const showHint = useCallback(() => {
    sound.play("hint", { gain: 0.6 });
    setHint(nextHint(gameRef.current));
  }, [sound]);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.metaKey || e.ctrlKey || e.altKey || document.querySelector("dialog[open]")) return;
      const target = e.target as HTMLElement | null;
      if (target?.closest("input, textarea")) return;
      const s = gameRef.current;
      const i = LOCATIONS.indexOf(s.at);
      const k = e.key.toLowerCase();
      const go = (to: LocationId | undefined) => to && act({ type: "travel", to });
      if (k === "arrowleft" || k === "a") go(LOCATIONS[i - 1]);
      else if (k === "arrowright" || k === "d") go(LOCATIONS[i + 1]);
      else if (k === "1" || k === "2" || k === "3") {
        const w = WEATHERS[Number(k) - 1];
        if (w) act({ type: "take", weather: w });
      } else if (k === "r") act({ type: "release" });
      else if (k === "h") showHint();
      else if (k === "n") setPanel("notebook");
      else if (k === "m") toggleMute();
      else return;
      e.preventDefault();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [act, showHint, toggleMute]);

  return (
    <main className="relative h-dvh w-full select-none">
      <div ref={host} className="absolute inset-0" />
      <Hud
        state={game}
        message={message}
        onAction={act}
        onNotebook={() => setPanel("notebook")}
        onHint={showHint}
        hint={hint}
        muted={muted}
        onMute={toggleMute}
      />
      {intro && (
        <Intro
          onBegin={() => {
            sound.unlock();
            sound.play("click");
            setIntro(false);
          }}
        />
      )}
      {game.finished && panel === "none" && (
        <button
          type="button"
          className="btn btn-warm absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2"
          onClick={() => setPanel("postcard")}
        >
          Open your postcard
        </button>
      )}
      <Modal open={panel === "notebook"} label="Field notebook" onClose={() => setPanel("none")}>
        <Notebook state={game} onClose={() => setPanel("none")} />
      </Modal>
      <Modal
        open={panel === "postcard"}
        label="Postcard of your route"
        onClose={() => setPanel("none")}
        className="w-[min(52rem,calc(100vw-2rem))]"
      >
        <Postcard state={game} onReplay={replay} onClose={() => setPanel("none")} />
      </Modal>
    </main>
  );
}
