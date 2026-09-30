// Wires the pure game to the three.js trail and the React HUD.

import { useCallback, useEffect, useRef, useState } from "react";
import { cuesFor } from "../audio/cues";
import { ambienceMix } from "../audio/mix";
import { SoundBoard } from "../audio/sound";
import { DISCOVERIES } from "../game/notebook";
import { hint as nextHint } from "../game/solver";
import { type Action, apply, createGame, type GameState } from "../game/state";
import { LOCATIONS, type LocationId } from "../game/world";
import { worldReady } from "../loader";
import { disposeAssets, loadAssets, loadDeferred, setAssets } from "../scene/assets";
import { wantsTitle } from "../scene/opening";
import { detectQuality } from "../scene/render/pipeline";
import { TrailScene } from "../scene/trail";
import { installVisualTest, visualTestEnabled } from "../scene/visual-test";
import { focusTrailControl } from "./focus";
import { Guide } from "./Guide";
import { guideReplayStep, guideStepAfter } from "./guideCopy";
import { Hud } from "./Hud";
import { Intro } from "./Intro";
import { keyboardCommand, keyboardTarget, suppressRepeatedActivation } from "./keyboard";
import { Modal } from "./Modal";
import { Notebook } from "./Notebook";
import { Postcard } from "./Postcard";
import { SoundButton } from "./SoundButton";

const reducedMotion = () => window.matchMedia("(prefers-reduced-motion: reduce)").matches;
type Panel = "none" | "notebook" | "postcard";

function storedMute() {
  try {
    return localStorage.getItem("borrowed-weather:muted") === "1";
  } catch {
    return false;
  }
}

export function App() {
  const host = useRef<HTMLDivElement>(null);
  const scene = useRef<TrailScene | null>(null);
  const [game, setGame] = useState<GameState>(createGame);
  const gameRef = useRef(game);
  const [message, setMessage] = useState("");
  const [loadError, setLoadError] = useState(false);
  const [hint, setHint] = useState<string | null>(null);
  const [opening, setOpening] = useState<"title" | "glide" | "done">(() =>
    wantsTitle() ? "title" : "done",
  );
  const openingRef = useRef(opening);
  const [guide, setGuide] = useState(() => {
    try {
      return localStorage.getItem("borrowed-weather:guide") ? -1 : 0;
    } catch {
      return 0;
    }
  });
  const guideRef = useRef(guide);
  const [practice, setPractice] = useState(false);
  const practiceRef = useRef(false);
  const guideTo = useCallback((step: number) => {
    guideRef.current = step;
    setGuide(step);
    if (step < 0) {
      try {
        localStorage.setItem("borrowed-weather:guide", "seen");
      } catch {
        /* Optional storage. */
      }
    }
  }, []);
  const [panel, setPanelState] = useState<Panel>("none");
  const panelRef = useRef<Panel>("none");
  const finishTimer = useRef<number | undefined>(undefined);
  const focusFrame = useRef(0);
  const sound = useRef<SoundBoard | null>(null);
  const [muted, setMuted] = useState(storedMute);
  const lastPanel = useRef(panel);
  const clearFinish = useCallback(() => {
    window.clearTimeout(finishTimer.current);
    finishTimer.current = undefined;
  }, []);
  const setPanel = useCallback(
    (next: Panel) => {
      clearFinish();
      panelRef.current = next;
      scene.current?.setInputEnabled(next === "none" && openingRef.current === "done");
      setPanelState(next);
    },
    [clearFinish],
  );
  const focusPlay = useCallback(() => {
    cancelAnimationFrame(focusFrame.current);
    focusFrame.current = requestAnimationFrame(() => {
      if (panelRef.current !== "none" || openingRef.current !== "done") return;
      focusTrailControl();
    });
  }, []);

  const act = useCallback(
    (action: Action) => {
      if (!scene.current || openingRef.current !== "done" || panelRef.current !== "none") return;
      const before = gameRef.current;
      const out = apply(before, action);
      const noted = out.found
        .map((id) => DISCOVERIES.find((d) => d.id === id)?.title)
        .filter(Boolean)
        .map((t) => ` Noted: “${t}”.`)
        .join("");
      setMessage(out.message + noted);
      if (out.ok && action.type === "travel") sound.current?.cancelPending();
      for (const c of cuesFor(before, out)) sound.current?.play(c.name, c);
      if (!out.ok) return;
      gameRef.current = out.state;
      setGame(out.state);
      setHint(null);
      const step = guideRef.current;
      const nextStep = guideStepAfter(step, before, action, out.state, practiceRef.current);
      if (nextStep !== step) guideTo(nextStep);
      if (out.state.finished && !before.finished) {
        clearFinish();
        finishTimer.current = window.setTimeout(() => {
          finishTimer.current = undefined;
          if (gameRef.current.finished && panelRef.current === "none") setPanel("postcard");
        }, 1400);
      }
    },
    [guideTo, clearFinish, setPanel],
  );

  // Create imperative audio per mounted effect, including React's development remount.
  useEffect(() => {
    const audio = new SoundBoard();
    sound.current = audio;
    setMuted(audio.muted);
    audio.setMix(ambienceMix(gameRef.current));
    audio.setDucked(panelRef.current !== "none");
    const unlock = () => audio.unlock();
    window.addEventListener("pointerdown", unlock, true);
    window.addEventListener("keydown", unlock, true);
    return () => {
      window.removeEventListener("pointerdown", unlock, true);
      window.removeEventListener("keydown", unlock, true);
      clearFinish();
      cancelAnimationFrame(focusFrame.current);
      audio.dispose();
      if (sound.current === audio) sound.current = null;
    };
  }, [clearFinish]);

  useEffect(() => {
    const el = host.current;
    if (!el) return;
    let trail: TrailScene | null = null;
    let removeHook = () => {};
    let cancelled = false;
    let readyFrame = 0;
    const controller = new AbortController();
    const mq = window.matchMedia("(prefers-reduced-motion: reduce)");
    const onMotion = () => trail?.setCalm(mq.matches);
    mq.addEventListener("change", onMotion);
    // Sourced assets load behind the arrival veil; the scene is built once they are ready.
    void loadAssets(controller.signal)
      .then((loaded) => {
        if (cancelled) {
          disposeAssets(loaded);
          return;
        }
        setAssets(loaded);
        const capture = visualTestEnabled();
        trail = new TrailScene(
          el,
          reducedMotion(),
          () => {
            readyFrame = requestAnimationFrame(() => {
              if (!cancelled) worldReady();
            });
          },
          loaded,
          detectQuality(),
          !capture,
        );
        trail.sync(gameRef.current, true);
        trail.opening.onDone = () => {
          if (cancelled) return;
          openingRef.current = "done";
          trail?.setInputEnabled(panelRef.current === "none");
          setOpening("done");
          focusPlay();
        };
        trail.onPick = (to: LocationId) => act({ type: "travel", to });
        trail.setInputEnabled(openingRef.current === "done" && panelRef.current === "none");
        void trail.start().catch((error: unknown) => {
          if (cancelled) return;
          console.error("The trail could not start", error);
          setLoadError(true);
          worldReady();
        });
        scene.current = trail;
        if (capture) removeHook = installVisualTest(trail);
        // Non-critical assets (2K sky, wood, pebbles, foliage) stream in behind the first frame.
        void loadDeferred(
          (sky) => {
            if (!cancelled) trail?.setBackground(sky);
          },
          loaded,
          controller.signal,
        )
          .then(() => {
            if (!cancelled && window.__VISUAL_TEST__) window.__VISUAL_TEST__.assetsReady = true;
          })
          .catch((error: unknown) => {
            if (cancelled || (error instanceof DOMException && error.name === "AbortError")) return;
            console.warn("Some scenery could not load; the trail remains playable", error);
          });
      })
      .catch((error: unknown) => {
        if (cancelled || (error instanceof DOMException && error.name === "AbortError")) return;
        console.error("The trail could not load", error);
        setLoadError(true);
        worldReady();
      });
    return () => {
      cancelled = true;
      controller.abort();
      cancelAnimationFrame(readyFrame);
      mq.removeEventListener("change", onMotion);
      removeHook();
      trail?.dispose();
      scene.current = null;
    };
  }, [act, focusPlay]);

  useEffect(() => {
    scene.current?.sync(game);
    sound.current?.setMix(ambienceMix(game));
  }, [game]);

  useEffect(() => {
    const was = lastPanel.current;
    lastPanel.current = panel;
    if (was === panel) return;
    if (panel === "notebook") sound.current?.play("book-open");
    else if (panel === "postcard") sound.current?.play("page");
    else if (was === "notebook") sound.current?.play("book-close");
    sound.current?.setDucked(panel !== "none");
  }, [panel]);

  const toggleMute = useCallback(() => {
    const audio = sound.current;
    if (!audio) return;
    const next = !audio.muted;
    audio.setMuted(next);
    setMuted(next);
    if (!next) audio.play("toggle");
  }, []);

  const replay = useCallback(() => {
    clearFinish();
    sound.current?.cancelPending();
    const fresh = createGame();
    gameRef.current = fresh;
    setGame(fresh);
    scene.current?.sync(fresh, true);
    setPanel("none");
    setHint(null);
    setMessage("A fresh morning at the Wool Gate.");
    if (guideRef.current >= 0) {
      practiceRef.current = false;
      setPractice(false);
      guideTo(0);
    }
    focusPlay();
  }, [clearFinish, setPanel, focusPlay, guideTo]);

  const replayGuide = useCallback(() => {
    practiceRef.current = true;
    setPractice(true);
    guideTo(guideReplayStep(gameRef.current));
  }, [guideTo]);

  const showHint = useCallback(() => {
    if (openingRef.current !== "done" || panelRef.current !== "none") return;
    sound.current?.play("hint", { gain: 0.6 });
    setHint(nextHint(gameRef.current));
  }, []);

  const begin = useCallback(() => {
    if (openingRef.current !== "title" || !scene.current) return;
    const veil = document.getElementById("arrival");
    if (veil && !veil.classList.contains("is-done")) return;
    sound.current?.unlock();
    sound.current?.play("click");
    openingRef.current = "glide";
    setOpening("glide");
    scene.current.opening.begin(reducedMotion());
  }, []);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const input = {
        key: e.key,
        repeat: e.repeat,
        defaultPrevented: e.defaultPrevented,
        ctrlKey: e.ctrlKey,
        altKey: e.altKey,
        metaKey: e.metaKey,
        target: keyboardTarget(e.target),
      };
      if (suppressRepeatedActivation(input)) {
        e.preventDefault();
        return;
      }
      const command = keyboardCommand(input, openingRef.current, panelRef.current !== "none");
      if (!command) return;
      e.preventDefault();
      switch (command.type) {
        case "travel": {
          const to = LOCATIONS[LOCATIONS.indexOf(gameRef.current.at) + command.direction];
          if (to) act({ type: "travel", to });
          break;
        }
        case "take":
          act(command);
          break;
        case "release":
          act({ type: "release" });
          break;
        case "hint":
          showHint();
          break;
        case "notebook":
          setPanel("notebook");
          break;
        case "mute":
          toggleMute();
          break;
        case "begin":
          begin();
          break;
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [act, showHint, toggleMute, begin, setPanel]);

  return (
    <main className="relative h-dvh w-full select-none">
      <div ref={host} className="absolute inset-0" inert={opening !== "done" || panel !== "none"} />
      {loadError && (
        <section
          className="panel absolute inset-x-4 top-1/2 z-50 m-auto max-w-sm rounded-2xl p-5"
          role="alert"
        >
          <p>The trail could not start. Reload to try again.</p>
          <button type="button" className="btn mt-3" onClick={() => location.reload()}>
            Reload
          </button>
        </section>
      )}
      {opening === "done" && (
        <Hud
          state={game}
          message={message}
          onAction={act}
          onNotebook={() => setPanel("notebook")}
          onHint={showHint}
          hint={hint}
          muted={muted}
          onMute={toggleMute}
          onGuide={replayGuide}
          guide={
            guide >= 0 && panel === "none" ? (
              <Guide
                step={guide}
                state={game}
                practice={practice}
                onSkip={() => {
                  guideTo(-1);
                  focusPlay();
                }}
              />
            ) : null
          }
        />
      )}
      {opening === "title" && <Intro onBegin={begin} />}
      {game.finished && panel === "none" && (
        <button
          type="button"
          className="btn btn-warm absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2"
          onClick={() => setPanel("postcard")}
        >
          Open your postcard
        </button>
      )}
      <Modal
        open={panel === "notebook"}
        label="Field notebook"
        onClose={() => setPanel("none")}
        onRestoreFocus={focusPlay}
        sound={<SoundButton muted={muted} onMute={toggleMute} />}
      >
        <Notebook state={game} onClose={() => setPanel("none")} />
      </Modal>
      <Modal
        open={panel === "postcard"}
        label="Postcard of your route"
        onClose={() => setPanel("none")}
        onRestoreFocus={focusPlay}
        sound={<SoundButton muted={muted} onMute={toggleMute} />}
        className="w-[min(52rem,calc(100vw-2rem))]"
      >
        <Postcard state={game} onReplay={replay} onClose={() => setPanel("none")} />
      </Modal>
    </main>
  );
}
