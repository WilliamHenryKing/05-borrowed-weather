// First-time hint, shown in place over the first diorama until you act or dismiss it.

import { useEffect, useRef } from "react";

export function Intro({ onBegin }: { onBegin: () => void }) {
  const button = useRef<HTMLButtonElement>(null);
  useEffect(() => button.current?.focus(), []);
  return (
    <section
      className="panel pointer-events-auto absolute top-1/2 left-1/2 w-[min(26rem,calc(100vw-2rem))] -translate-x-1/2 -translate-y-1/2 rounded-2xl p-5"
      aria-labelledby="intro-title"
    >
      <h2 id="intro-title" className="font-serif text-2xl">
        A jar full of weather
      </h2>
      <p className="mt-2 text-sm leading-relaxed text-paper/90">
        Your jar holds one kind of weather at a time. <strong>Take</strong> it and that place
        changes. <strong>Release</strong> it and somewhere else does. Every step can be undone.
      </p>
      <p className="mt-2 text-sm leading-relaxed text-paper/90">
        Reach the lantern shelter above the clouds and wake its instruments. The fog at the ford is
        a good place to start.
      </p>
      <p className="mt-3 text-xs leading-relaxed text-moss-300">
        Tap a diorama or use ← → to walk · 1 fog · 2 rain · 3 wind · R release · H hint · N notebook
      </p>
      <button type="button" className="btn btn-warm mt-4 w-full" onClick={onBegin} ref={button}>
        Set off
      </button>
    </section>
  );
}
