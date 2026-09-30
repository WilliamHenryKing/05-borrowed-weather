import { afterEach, beforeEach, expect, mock, spyOn, test } from "bun:test";
import * as THREE from "three";
import { GLTFLoader } from "three/addons/loaders/GLTFLoader.js";
import { HDRLoader } from "three/addons/loaders/HDRLoader.js";
import {
  disposeAssets,
  loadAssets,
  loadDeferred,
  setAssets,
  tiled,
  whenFoliage,
} from "../src/scene/assets";

type LoadedModel = Awaited<ReturnType<GLTFLoader["loadAsync"]>>;
const savedDocument = Object.getOwnPropertyDescriptor(globalThis, "document");
const bundles: Awaited<ReturnType<typeof loadAssets>>[] = [];

function model(): LoadedModel {
  const scene = new THREE.Group();
  const material = new THREE.MeshStandardMaterial({ map: new THREE.Texture() });
  scene.add(new THREE.Mesh(new THREE.BoxGeometry(1, 2, 1), material));
  return { scene } as LoadedModel;
}

beforeEach(() => {
  Object.defineProperty(globalThis, "document", {
    configurable: true,
    value: {
      createElement: () => ({ width: 1, height: 1, getContext: () => null }),
    },
  });
  spyOn(THREE.TextureLoader.prototype, "loadAsync").mockImplementation(
    async (url) => new THREE.Texture({ src: url, width: 4, height: 4 } as HTMLImageElement),
  );
  spyOn(HDRLoader.prototype, "loadAsync").mockImplementation(
    async () =>
      new THREE.DataTexture(new Uint16Array(16), 2, 2, THREE.RGBAFormat, THREE.HalfFloatType),
  );
  spyOn(GLTFLoader.prototype, "loadAsync").mockImplementation(async () => model());
});
afterEach(() => {
  for (const bundle of bundles.splice(0)) disposeAssets(bundle);
  mock.restore();
  if (savedDocument) Object.defineProperty(globalThis, "document", savedDocument);
  else Reflect.deleteProperty(globalThis, "document");
});

test("cancelled critical startup settles promptly and disposes assets arriving later", async () => {
  let deliverSky = (_texture: THREE.DataTexture) => {};
  spyOn(HDRLoader.prototype, "loadAsync").mockImplementation(
    () =>
      new Promise<THREE.DataTexture>((resolve) => {
        deliverSky = resolve;
      }),
  );
  const controller = new AbortController();
  const startup = loadAssets(controller.signal);
  controller.abort();
  await expect(startup).rejects.toMatchObject({ name: "AbortError" });
  const sky = new THREE.DataTexture();
  let disposed = 0;
  sky.addEventListener("dispose", () => disposed++);
  deliverSky(sky);
  await Promise.resolve();
  await Promise.resolve();
  expect(disposed).toBe(1);
});

test("a cancelled deferred generation cannot populate the next mount or invoke its foliage callbacks", async () => {
  const first = await loadAssets();
  bundles.push(first);
  setAssets(first);
  let oldFoliage = 0;
  whenFoliage(() => oldFoliage++);
  const placeholder = first.sets.weathered_planks.colour;
  const originalImage = placeholder.image;
  const copy = tiled(placeholder, [2, 3]);
  let copyDisposed = 0;
  copy.addEventListener("dispose", () => copyDisposed++);
  let lateModel = (_loaded: LoadedModel) => {};
  let grassLoads = 0;
  spyOn(GLTFLoader.prototype, "loadAsync").mockImplementation(async (url) => {
    if (url.includes("grass_medium") && grassLoads++ === 0)
      return new Promise<LoadedModel>((resolve) => {
        lateModel = resolve;
      });
    return model();
  });
  let oldSky = 0;
  const deferred = loadDeferred(() => oldSky++, first);
  disposeAssets(first);
  await expect(deferred).rejects.toMatchObject({ name: "AbortError" });
  expect(copyDisposed).toBe(1);
  expect(placeholder.image).toBe(originalImage);
  const second = await loadAssets();
  bundles.push(second);
  setAssets(second);
  let newFoliage = 0;
  let newSky = 0;
  whenFoliage(() => newFoliage++);
  await loadDeferred(() => newSky++, second);
  const late = model();
  let lateGeometryDisposed = 0;
  (late.scene.children[0] as THREE.Mesh).geometry.addEventListener(
    "dispose",
    () => lateGeometryDisposed++,
  );
  lateModel(late);
  await Promise.resolve();
  await Promise.resolve();
  await Promise.resolve();
  expect(lateGeometryDisposed).toBe(1);
  expect(oldFoliage).toBe(0);
  expect(oldSky).toBe(0);
  expect(newFoliage).toBe(1);
  expect(newSky).toBe(1);
  expect(second.grass?.variants).toHaveLength(1);
  expect(first.grass).toBeNull();
});

test("optional foliage failure preserves the critical sky and terrain until final disposal", async () => {
  const loaded = await loadAssets();
  bundles.push(loaded);
  setAssets(loaded);
  const counts = { sky: 0, terrain: 0 };
  loaded.sky.addEventListener("dispose", () => counts.sky++);
  loaded.sets.cliff_side.colour.addEventListener("dispose", () => counts.terrain++);
  spyOn(GLTFLoader.prototype, "loadAsync").mockRejectedValue(
    new Error("optional foliage unavailable"),
  );
  await expect(loadDeferred(() => {}, loaded)).rejects.toThrow("optional foliage unavailable");
  expect(counts).toEqual({ sky: 0, terrain: 0 });
  disposeAssets(loaded);
  disposeAssets(loaded);
  expect(counts).toEqual({ sky: 1, terrain: 1 });
});
