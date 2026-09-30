// Visual-test hook (dev and ?e2e builds only): lets a headless browser pin the camera to a
// bookmark, freeze scene time and wait for frames, so captures are repeatable.

import { BOOKMARKS, type BookmarkName } from "./layout";
import type { TrailScene } from "./trail";

export interface VisualTestHook {
  ready: boolean;
  /** True once the deferred assets (2K sky, wood, pebbles, foliage) have arrived. */
  assetsReady: boolean;
  renderer: string;
  /** What the sky measurement produced (sun illuminance and colour, horizon radiance). */
  lighting: { sun: number[]; sunIlluminance: number; sunColour: number[]; horizon: number[] };
  bookmarks: BookmarkName[];
  setBookmark(name: BookmarkName | null): void;
  freeze(on?: boolean): void;
  pause(on?: boolean): void;
  /** Mean milliseconds per rendered frame over the last `frames` frames. */
  frameTime(frames?: number): Promise<number>;
  settle(frames?: number): Promise<void>;
  /** The quality tier and how far the frame-time governor has stepped it down. */
  quality(): Record<string, unknown>;
  /** Take one governor step down, as a slow frame run would (false when nothing is left). */
  degrade(): boolean;
}

declare global {
  interface Window {
    __VISUAL_TEST__?: VisualTestHook;
  }
}

export function visualTestEnabled(): boolean {
  return import.meta.env.DEV || new URLSearchParams(window.location.search).has("e2e");
}

export function installVisualTest(trail: TrailScene): () => void {
  const stage = trail.stageForTests;
  const hook: VisualTestHook = {
    ready: false,
    assetsReady: false,
    renderer: stage.rendererName(),
    lighting: {
      sun: stage.sky.sun.toArray(),
      sunIlluminance: stage.sky.sunIlluminance,
      sunColour: stage.sky.sunColour.toArray(),
      horizon: stage.sky.horizon.toArray(),
    },
    bookmarks: Object.keys(BOOKMARKS) as BookmarkName[],
    setBookmark: (name) => trail.setBookmark(name),
    freeze: (on = true) => stage.freeze(on),
    pause: (on = true) => stage.pause(on),
    frameTime: async (frames = 5) => {
      const t0 = performance.now();
      await stage.settle(frames);
      return (performance.now() - t0) / frames;
    },
    settle: (frames = 3) => stage.settle(frames),
    quality: () => stage.qualityState,
    degrade: () => stage.degrade(),
  };
  window.__VISUAL_TEST__ = hook;
  void stage.settle(1).then(() => {
    hook.ready = true;
  });
  return () => {
    if (window.__VISUAL_TEST__ === hook) delete window.__VISUAL_TEST__;
  };
}
