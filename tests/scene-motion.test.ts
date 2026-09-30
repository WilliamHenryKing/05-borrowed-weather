import { afterEach, beforeEach, describe, expect, test } from "bun:test";
import gsap from "gsap";
import * as THREE from "three";
import { TapGesture } from "../src/scene/input";
import { Jar } from "../src/scene/jar";
import { followPose } from "../src/scene/layout";
import { TravelMotion } from "../src/scene/motion";
import { Opening } from "../src/scene/opening";
import { SceneResources } from "../src/scene/resources";
import { Transfer } from "../src/scene/transfer";

const saved = new Map<string, PropertyDescriptor | undefined>();
beforeEach(() => {
  for (const [key, value] of Object.entries({
    document: { createElement: () => ({ getContext: () => null }), getElementById: () => null },
    location: { search: "?e2e" },
    innerWidth: 568,
    innerHeight: 320,
  })) {
    saved.set(key, Object.getOwnPropertyDescriptor(globalThis, key));
    Object.defineProperty(globalThis, key, { configurable: true, value });
  }
  gsap.ticker.sleep();
});
afterEach(() => {
  gsap.globalTimeline.clear();
  gsap.ticker.sleep();
  for (const [key, descriptor] of saved)
    if (descriptor) Object.defineProperty(globalThis, key, descriptor);
    else Reflect.deleteProperty(globalThis, key);
});

describe("owned trips", () => {
  test("a replacement trip and replay remove every old walker and camera tween", () => {
    const walker = new THREE.Vector3();
    const focus = new THREE.Vector3();
    const motion = new TravelMotion(walker, focus);
    motion.move([walker.clone(), new THREE.Vector3(5, 1, -3)], new THREE.Vector3(5, 2, -3), false);
    expect(motion.active).toBe(true);
    motion.move([walker.clone(), new THREE.Vector3(0, 2, -7)], new THREE.Vector3(0, 3, -7), false);
    motion.finish();
    expect(walker.toArray()).toEqual([0, 2, -7]);
    expect(focus.toArray()).toEqual([0, 3, -7]);
    expect(motion.active).toBe(false);
    motion.move(
      [walker.clone(), new THREE.Vector3(10, 4, -11)],
      new THREE.Vector3(10, 5, -11),
      false,
    );
    motion.move([new THREE.Vector3()], new THREE.Vector3(0, 0.7, 0), true);
    expect(walker.toArray()).toEqual([0, 0, 0]);
    expect(focus.toArray()).toEqual([0, 0.7, 0]);
    expect(gsap.getTweensOf([walker, focus])).toHaveLength(0);
  });

  test("finishing a multi-leg trip settles both endpoints; disposal cancels without moving", () => {
    const walker = new THREE.Vector3();
    const focus = new THREE.Vector3();
    const motion = new TravelMotion(walker, focus);
    motion.move(
      [walker.clone(), new THREE.Vector3(5, 1, -3), new THREE.Vector3(1, 2, -7)],
      new THREE.Vector3(1, 3, -7),
      false,
    );
    motion.finish();
    expect(walker.toArray()).toEqual([1, 2, -7]);
    expect(focus.toArray()).toEqual([1, 3, -7]);
    motion.move(
      [walker.clone(), new THREE.Vector3(8, 4, -12)],
      new THREE.Vector3(8, 5, -12),
      false,
    );
    motion.cancel();
    expect(walker.toArray()).toEqual([1, 2, -7]);
    expect(motion.active).toBe(false);
    expect(gsap.getTweensOf([walker, focus])).toHaveLength(0);
  });
});

describe("jar and weather transfer", () => {
  test("re-capturing the same weather during release cannot be erased by the old release", () => {
    const jar = new Jar();
    jar.set("fog", false);
    jar.set(null, true);
    const release = gsap.getTweensOf(jar)[0];
    jar.set("fog", true);
    expect(gsap.getTweensOf(jar)).not.toContain(release);
    jar.finish();
    jar.update(0, true);
    const fog = jar.group.children.filter((object) => object instanceof THREE.Sprite);
    expect(fog.filter((object) => object.visible)).toHaveLength(5);
    expect((fog[0] as THREE.Sprite).material.opacity).toBeCloseTo(0.9);
    jar.set(null, false);
    expect(fog.some((object) => object.visible)).toBe(false);
    expect(jar.group.scale.toArray()).toEqual([1, 1, 1]);
    expect(gsap.getTweensOf([jar, jar.group.scale])).toHaveLength(0);
    const resources = new SceneResources();
    resources.tree(jar.group);
    resources.dispose();
  });

  test("calm and replay hide an active transfer instead of leaving an old swirl", () => {
    const transfer = new Transfer();
    transfer.burst("rain", new THREE.Vector3(), new THREE.Vector3(1, 1, 1), true, false);
    transfer.update(0.2);
    expect(transfer.group.visible).toBe(true);
    transfer.finish();
    transfer.update(0);
    expect(transfer.group.visible).toBe(false);
    expect(transfer.materials.every((material) => material.opacity === 0)).toBe(true);
    transfer.burst("fog", new THREE.Vector3(), new THREE.Vector3(1, 1, 1), false, true);
    transfer.update(0.3);
    expect(transfer.group.visible).toBe(false);
    const resources = new SceneResources();
    resources.tree(transfer.group);
    for (const material of transfer.materials) resources.material(material);
    resources.dispose();
  });
});

test("a tap never survives a second finger, pointer mismatch, drag out and back, or cancellation", () => {
  const tap = new TapGesture();
  tap.press(1, 20, 20);
  tap.press(2, 20, 20);
  expect(tap.release(2, 20, 20)).toBe(false);
  expect(tap.release(1, 20, 20)).toBe(false);
  tap.press(3, 20, 20);
  expect(tap.release(8, 20, 20)).toBe(false);
  tap.move(3, 40, 20);
  tap.move(3, 20, 20);
  expect(tap.release(3, 20, 20)).toBe(false);
  tap.press(4, 20, 20);
  tap.cancel(4);
  expect(tap.release(4, 20, 20)).toBe(false);
  tap.press(5, 20, 20);
  tap.reset();
  expect(tap.release(5, 20, 20)).toBe(false);
  tap.press(6, 20, 20);
  expect(tap.release(6, 23, 23)).toBe(true);
});

test("a live calm change ends opening exactly once and preserves the landscape play offset", () => {
  const opening = new Opening();
  opening.phase = "title";
  const camera = new THREE.PerspectiveCamera(40, 568 / 320);
  const home = {
    ...followPose(new THREE.Vector3(), camera.aspect, 0, 261.28 / 320),
    shiftX: 153.36,
  };
  let done = 0;
  opening.onDone = () => done++;
  opening.update(1, camera, home, false);
  opening.begin(false);
  const pose = opening.update(0.1, camera, home, true);
  expect(String(opening.phase)).toBe("done");
  expect(pose.position.distanceTo(home.position)).toBeLessThan(1e-9);
  expect(camera.view?.offsetX).toBeCloseTo(153.36);
  opening.finish();
  opening.update(1, camera, home, true);
  expect(done).toBe(1);
  // View offsets use the same full-viewport projection as raycasting.
  camera.position.copy(pose.position);
  camera.lookAt(pose.target);
  camera.updateMatrixWorld();
  const projected = pose.target.clone().project(camera);
  expect(((projected.x + 1) * 568) / 2).toBeCloseTo(261.28 / 2);
});
