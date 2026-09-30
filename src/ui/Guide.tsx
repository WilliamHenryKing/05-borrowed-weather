import { useLayoutEffect, useRef } from "react";
import type { GameState } from "../game/state";
import { guideCopy } from "./guideCopy";

export function Guide({
  step,
  onSkip,
  state,
  practice = false,
}: {
  step: number;
  onSkip: () => void;
  state?: GameState;
  practice?: boolean;
}) {
  const [title, text] = guideCopy(step, state, practice);
  const reading = useRef<HTMLElement>(null);
  const previous = useRef("");
  useLayoutEffect(() => {
    const content = `${step}:${title}:${text}`;
    if (previous.current === content) return;
    previous.current = content;
    if (reading.current) reading.current.scrollTop = 0;
  }, [step, title, text]);
  return (
    <aside
      ref={reading}
      className="panel trail-guide keyboard-scroll"
      aria-label="Trail guide"
      aria-live="polite"
      // biome-ignore lint/a11y/noNoninteractiveTabindex: Bounded trail instructions need a keyboard stop for native scrolling.
      tabIndex={0}
    >
      <p className="eyebrow">
        {step + 1}/4 · {title}
      </p>
      <p>{text}</p>
      <div className="guide-foot">
        <span aria-hidden="true">{[0, 1, 2, 3].map((i) => (i === step ? "● " : "○ "))}</span>
        <button type="button" onClick={onSkip}>
          Skip the guide
        </button>
      </div>
    </aside>
  );
}
