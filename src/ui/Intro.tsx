import { useEffect, useRef } from "react";

export function Intro({ onBegin }: { onBegin: () => void }) {
  const button = useRef<HTMLButtonElement>(null);
  useEffect(() => button.current?.focus(), []);
  return (
    <section className="opening" aria-labelledby="intro-title">
      <div className="opening-copy">
        <p className="rise eyebrow">A small trail above the clouds</p>
        <h1 id="intro-title" className="rise">
          Borrowed
          <br />
          <em>weather.</em>
        </h1>
        <p className="rise premise">
          A little fog. A pocket of rain. A borrowed breeze.
          <br />
          Carry the sky in a jar, all the way to the lantern shelter.
        </p>
        <div className="rise">
          <button ref={button} type="button" className="btn btn-warm" onClick={onBegin}>
            Set off
          </button>
          <span className="enter-note">or press Enter</span>
        </div>
      </div>
    </section>
  );
}
