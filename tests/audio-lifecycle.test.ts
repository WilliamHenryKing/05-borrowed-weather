import { afterEach, beforeEach, expect, test } from "bun:test";
import { SoundBoard } from "../src/audio/sound";

class NodeFixture {
  disconnected = 0;
  connect<T extends NodeFixture>(node: T): T {
    return node;
  }
  disconnect(): void {
    this.disconnected++;
  }
}
class GainFixture extends NodeFixture {
  gain = { value: 0, setTargetAtTime: () => {} };
}
class SourceFixture extends NodeFixture {
  buffer: AudioBuffer | null = null;
  loop = false;
  playbackRate = { value: 1 };
  onended: (() => void) | null = null;
  when = -1;
  stopped = 0;
  start(when = 0): void {
    this.when = when;
  }
  stop(): void {
    this.stopped++;
  }
}
const contexts: ContextFixture[] = [];
let decode: (data: ArrayBuffer) => Promise<AudioBuffer>;
class ContextFixture {
  state = "running";
  currentTime = 10;
  destination = new NodeFixture();
  nodes: NodeFixture[] = [];
  sources: SourceFixture[] = [];
  closed = 0;
  resumed = 0;
  suspended = 0;
  constructor() {
    contexts.push(this);
  }
  createGain(): GainFixture {
    const node = new GainFixture();
    this.nodes.push(node);
    return node;
  }
  createBiquadFilter() {
    const node = Object.assign(new NodeFixture(), {
      type: "lowpass",
      frequency: { value: 0, setTargetAtTime: () => {} },
    });
    this.nodes.push(node);
    return node;
  }
  createBufferSource(): SourceFixture {
    const node = new SourceFixture();
    this.sources.push(node);
    return node;
  }
  decodeAudioData(data: ArrayBuffer): Promise<AudioBuffer> {
    return decode(data);
  }
  async suspend() {
    this.state = "suspended";
    this.suspended++;
  }
  async resume() {
    this.state = "running";
    this.resumed++;
  }
  async close() {
    this.state = "closed";
    this.closed++;
  }
}

const saved = new Map<string, PropertyDescriptor | undefined>();
let signal: AbortSignal | undefined;
let visibility: {
  hidden: boolean;
  handlers: Set<EventListener>;
  addEventListener(type: string, callback: EventListener): void;
  removeEventListener(type: string, callback: EventListener): void;
};
const flush = async () => {
  for (let i = 0; i < 40; i++) await Promise.resolve();
};
beforeEach(() => {
  contexts.length = 0;
  signal = undefined;
  decode = async () => ({ duration: 5 }) as AudioBuffer;
  visibility = {
    hidden: false,
    handlers: new Set(),
    addEventListener: (_type, callback) => visibility.handlers.add(callback),
    removeEventListener: (_type, callback) => visibility.handlers.delete(callback),
  };
  for (const [key, value] of Object.entries({
    document: visibility,
    window: { AudioContext: ContextFixture },
    localStorage: { getItem: () => null, setItem: () => {} },
    fetch: async (_url: string, init?: RequestInit) => {
      signal = init?.signal ?? undefined;
      return { ok: true, arrayBuffer: async () => new ArrayBuffer(8) } as Response;
    },
  })) {
    saved.set(key, Object.getOwnPropertyDescriptor(globalThis, key));
    Object.defineProperty(globalThis, key, { configurable: true, value });
  }
});
afterEach(() => {
  for (const [key, descriptor] of saved)
    if (descriptor) Object.defineProperty(globalThis, key, descriptor);
    else Reflect.deleteProperty(globalThis, key);
});

function context(): ContextFixture {
  const ctx = contexts[0];
  if (!ctx) throw new Error("Audio was not unlocked");
  return ctx;
}

test("replacement travel cancels only future one-shots; teardown owns loops, nodes, listener and context", async () => {
  const sound = new SoundBoard();
  sound.unlock();
  await flush();
  const ctx = context();
  expect(ctx.sources.filter((source) => source.loop)).toHaveLength(5);
  sound.play("step-1");
  sound.play("discover", { delay: 2 });
  const current = ctx.sources.at(-2) as SourceFixture;
  const delayed = ctx.sources.at(-1) as SourceFixture;
  sound.cancelPending();
  expect(delayed.stopped).toBe(1);
  expect(delayed.disconnected).toBe(1);
  expect(current.stopped).toBe(0);
  expect(ctx.sources.filter((source) => source.loop).every((source) => source.stopped === 0)).toBe(
    true,
  );
  current.onended?.();
  expect(current.disconnected).toBe(1);
  sound.dispose();
  sound.dispose();
  sound.unlock();
  expect(ctx.closed).toBe(1);
  expect(contexts).toHaveLength(1);
  expect(
    ctx.sources
      .filter((source) => source.loop)
      .every((source) => source.stopped === 1 && source.disconnected === 1),
  ).toBe(true);
  expect(ctx.nodes.every((node) => node.disconnected === 1)).toBe(true);
  expect(visibility.handlers.size).toBe(0);
  expect(signal?.aborted).toBe(true);
});

test("late decoded buffers cannot restart loops or retain data after a disposed unlock", async () => {
  let deliver = (_buffer: AudioBuffer) => {};
  decode = () =>
    new Promise((resolve) => {
      deliver = resolve;
    });
  const sound = new SoundBoard();
  sound.unlock();
  await flush();
  const ctx = context();
  sound.dispose();
  deliver({ duration: 5 } as AudioBuffer);
  await flush();
  sound.play("step-1");
  expect(ctx.sources).toHaveLength(0);
  expect((sound as unknown as { buffers: Map<string, AudioBuffer> }).buffers.size).toBe(0);
  expect(ctx.closed).toBe(1);
  expect(visibility.handlers.size).toBe(0);
});
