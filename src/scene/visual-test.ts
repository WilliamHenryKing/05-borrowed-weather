// Visual-test hook (dev and ?e2e builds only): lets a headless browser pin the camera to a
// bookmark, freeze scene time and wait for frames, so captures are repeatable.

import { BOOKMARKS, type BookmarkName } from "./layout";
import type { TrailScene } from "./trail";

export interface VisualTestHook {
  ready: boolean;
  renderer: string;
  bookmarks: BookmarkName[];
  setBookmark(name: BookmarkName | null): void;
  freeze(on?: boolean): void;
  settle(frames?: number): Promise<void>;
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
    renderer: stage.rendererName(),
    bookmarks: Object.keys(BOOKMARKS) as BookmarkName[],
    setBookmark: (name) => trail.setBookmark(name),
    freeze: (on = true) => stage.freeze(on),
    settle: (frames = 3) => stage.settle(frames),
  };
  window.__VISUAL_TEST__ = hook;
  void stage.settle(1).then(() => {
    hook.ready = true;
  });
  return () => {
    if (window.__VISUAL_TEST__ === hook) delete window.__VISUAL_TEST__;
  };
}
