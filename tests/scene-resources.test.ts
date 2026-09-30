import { afterEach, beforeEach, expect, test } from "bun:test";
import * as THREE from "three";
import { GTAOPass } from "three/addons/postprocessing/GTAOPass.js";
import { UnrealBloomPass } from "three/addons/postprocessing/UnrealBloomPass.js";
import { Pipeline } from "../src/scene/render/pipeline";
import { SceneResources } from "../src/scene/resources";
import { Stage } from "../src/scene/stage";

test("shared mesh/line/sprite resources, instance buffers and shader maps dispose once, including late arrivals", () => {
  const resources = new SceneResources();
  const texture = new THREE.Texture();
  const geometry = new THREE.PlaneGeometry();
  const material = new THREE.ShaderMaterial({
    uniforms: { map: { value: texture }, maps: { value: [texture] } },
  });
  const spriteMaterial = new THREE.SpriteMaterial({ map: texture });
  const instances = new THREE.InstancedMesh(geometry, material, 2);
  const scene = new THREE.Group();
  scene.add(
    new THREE.Mesh(geometry, material),
    new THREE.Line(geometry, material),
    instances,
    new THREE.Sprite(spriteMaterial),
  );
  const released = { geometry: 0, material: 0, texture: 0, instances: 0, sprite: 0 };
  geometry.addEventListener("dispose", () => released.geometry++);
  material.addEventListener("dispose", () => released.material++);
  texture.addEventListener("dispose", () => released.texture++);
  instances.addEventListener("dispose", () => released.instances++);
  spriteMaterial.addEventListener("dispose", () => released.sprite++);
  resources.tree(scene);
  resources.tree(scene);
  resources.dispose();
  resources.dispose();
  resources.tree(scene);
  expect(released).toEqual({ geometry: 1, material: 1, texture: 1, instances: 1, sprite: 1 });
  const late = new THREE.Texture();
  let lateReleased = 0;
  late.addEventListener("dispose", () => lateReleased++);
  resources.own(late);
  resources.own(late);
  expect(lateReleased).toBe(1);
});

test("all post-processing passes and the pinned pass disposer omissions are released", () => {
  const counts = { ao: 0, aoMaterial: 0, blend: 0, bloom: 0, highPass: 0, other: 0, composer: 0 };
  const ao = Object.assign(Object.create(GTAOPass.prototype), {
    gtaoMaterial: { dispose: () => counts.aoMaterial++ },
    blendMaterial: { dispose: () => counts.blend++ },
    dispose: () => counts.ao++,
  });
  const bloom = Object.assign(Object.create(UnrealBloomPass.prototype), {
    materialHighPassFilter: { dispose: () => counts.highPass++ },
    dispose: () => counts.bloom++,
  });
  const pipeline = Object.assign(Object.create(Pipeline.prototype) as Pipeline, {
    composer: {
      passes: [ao, bloom, { dispose: () => counts.other++ }],
      dispose: () => counts.composer++,
    },
  });
  pipeline.dispose();
  expect(counts).toEqual({
    ao: 1,
    aoMaterial: 1,
    blend: 1,
    bloom: 1,
    highPass: 1,
    other: 1,
    composer: 1,
  });
});

const saved = new Map<string, PropertyDescriptor | undefined>();
let rafs: Map<number, FrameRequestCallback>;
beforeEach(() => {
  rafs = new Map();
  let id = 0;
  for (const [key, value] of Object.entries({
    window: { removeEventListener: () => {} },
    requestAnimationFrame: (callback: FrameRequestCallback) => {
      rafs.set(++id, callback);
      return id;
    },
    cancelAnimationFrame: (key: number) => rafs.delete(key),
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

function stageFixture() {
  let finishCompile = () => {};
  const compiling = new Promise<void>((resolve) => {
    finishCompile = resolve;
  });
  let cancelCompile = () => {};
  const cancelled = new Promise<void>((resolve) => {
    cancelCompile = resolve;
  });
  const calls = { render: 0, disposed: 0, ready: 0 };
  const renderer = {
    compileAsync: () => compiling,
    getRenderTarget: () => null,
    setRenderTarget: () => {},
    dispose: () => calls.disposed++,
    domElement: { remove: () => {} },
  };
  const stage = Object.assign(Object.create(Stage.prototype) as object, {
    renderer,
    scene: new THREE.Scene(),
    camera: new THREE.PerspectiveCamera(),
    key: new THREE.DirectionalLight(),
    sky: { dispose: () => {} },
    pipeline: { composer: { readBuffer: {} }, render: () => calls.render++, dispose: () => {} },
    resources: new SceneResources(),
    clock: { start: () => {}, elapsedTime: 0, getDelta: () => 1 / 60 },
    disposed: false,
    running: false,
    paused: false,
    raf: 0,
    frame: 0,
    pendingSize: null,
    frozenAt: null,
    adaptive: false,
    aoHidden: [],
    waiters: [],
    cancelled,
    cancelCompile,
    onFrame: () => {},
    onFirstFrame: () => calls.ready++,
    onDegrade: () => {},
  }) as unknown as Stage;
  return { stage, calls, finishCompile };
}

test("teardown settles pending precompile/frame waiters and prevents late GPU draws", async () => {
  const { stage, calls, finishCompile } = stageFixture();
  const startup = stage.precompile();
  const settle = stage.settle(3);
  stage.dispose();
  expect(await startup).toBe(false);
  await settle;
  finishCompile();
  await Promise.resolve();
  stage.start();
  stage.dispose();
  expect(calls).toEqual({ render: 0, disposed: 1, ready: 0 });
  expect(rafs.size).toBe(0);
});

test("late foliage compile never makes disposed objects visible", async () => {
  const { stage, finishCompile } = stageFixture();
  const object = new THREE.Group();
  const revealing = stage.reveal([object]);
  expect(object.visible).toBe(false);
  stage.dispose();
  await revealing;
  finishCompile();
  await Promise.resolve();
  expect(object.visible).toBe(false);
});

test("start is idempotent and the scheduled loop is owned even while paused", () => {
  const { stage, calls } = stageFixture();
  stage.start();
  stage.start();
  expect(rafs.size).toBe(1);
  const [id, callback] = Array.from(rafs)[0] as [number, FrameRequestCallback];
  rafs.delete(id);
  stage.pause(true);
  callback(1);
  expect(rafs.size).toBe(1);
  expect(calls.render).toBe(0);
  stage.dispose();
  expect(rafs.size).toBe(0);
});
