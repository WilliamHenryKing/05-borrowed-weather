// Sourced CC0 assets (see assets.manifest.json), loaded once before the trail is built so the
// diorama builders can stay synchronous. Colour maps are sRGB, every other map is linear.

import * as THREE from "three";
import { MeshoptDecoder } from "three/addons/libs/meshopt_decoder.module.js";
import { GLTFLoader } from "three/addons/loaders/GLTFLoader.js";
import { HDRLoader } from "three/addons/loaders/HDRLoader.js";
import { SceneResources } from "./resources";

export interface PbrSet {
  colour: THREE.Texture;
  normal: THREE.Texture;
  /** Ambient occlusion, roughness and metalness in R, G and B (Poly Haven "arm"). */
  arm: THREE.Texture;
}

export interface Scan {
  geometry: THREE.BufferGeometry;
  material: THREE.MeshStandardMaterial;
  /** Bounding radius in the horizontal plane, for sizing. */
  radius: number;
  height: number;
}

export interface Assets {
  sky: THREE.DataTexture;
  sets: Record<SetName, PbrSet>;
  rocks: Scan[];
  boulder: Scan;
  /** Foliage arrives after the arrival veil lifts (see loadDeferred); null until then. */
  grass: Foliage | null;
  fern: Foliage | null;
}

export interface Foliage {
  variants: THREE.BufferGeometry[];
  material: THREE.MeshStandardMaterial;
}

const SETS = [
  "cliff_side",
  "mossy_rock",
  "grass_ground",
  "river_small_rocks",
  "weathered_planks",
  "bark_brown_02",
] as const;
export type SetName = (typeof SETS)[number];

const base = import.meta.env.BASE_URL;
const textureLoader = new THREE.TextureLoader();

const owners = new WeakMap<Assets, AssetOwner>();
const sourceOwners = new WeakMap<THREE.Texture["source"], AssetOwner>();
const abortError = () => new DOMException("Asset load cancelled", "AbortError");

class AssetOwner {
  readonly resources = new SceneResources();
  readonly fills: (() => Promise<void>)[] = [];
  readonly copies = new Map<THREE.Texture["source"], THREE.Texture[]>();
  readonly foliageWaiters = new Set<() => void>();
  readonly cancelled: Promise<never>;
  closed = false;
  deferred: Promise<void> | null = null;
  private cancel = () => {};

  constructor(private readonly signal?: AbortSignal) {
    this.cancelled = new Promise<never>((_, reject) => {
      this.cancel = () => reject(abortError());
    });
    // A bundle can be disposed after all loads finish, with no remaining waiter.
    void this.cancelled.catch(() => {});
    signal?.addEventListener("abort", this.dispose, { once: true });
    if (signal?.aborted) this.dispose();
  }

  check(): void {
    if (this.closed) throw abortError();
  }

  async wait<T>(promise: Promise<T>): Promise<T> {
    return Promise.race([promise, this.cancelled]);
  }

  texture<T extends THREE.Texture>(texture: T): T {
    this.resources.own(texture);
    sourceOwners.set(texture.source, this);
    this.check();
    return texture;
  }

  readonly dispose = (): void => {
    if (this.closed) return;
    this.closed = true;
    this.signal?.removeEventListener("abort", this.dispose);
    this.cancel();
    this.fills.length = 0;
    this.foliageWaiters.clear();
    this.copies.clear();
    this.resources.dispose();
  };
}

async function texture(
  owner: AssetOwner,
  url: string,
  colour: boolean,
  flipY = true,
): Promise<THREE.Texture> {
  owner.check();
  const t = owner.texture(await textureLoader.loadAsync(`${base}${url}`));
  t.colorSpace = colour ? THREE.SRGBColorSpace : THREE.NoColorSpace;
  t.wrapS = t.wrapT = THREE.RepeatWrapping;
  t.anisotropy = 8;
  t.flipY = flipY;
  t.needsUpdate = true;
  return t;
}

/** Sets needed for the first frame; the rest stream in behind placeholders. */
const CRITICAL: readonly SetName[] = ["cliff_side", "mossy_rock", "grass_ground"];

/**
 * A 1×1 stand-in whose source is swapped for the real image when it arrives. Clones share
 * the source, so tiled copies made by materials update too.
 */
function placeholder(
  owner: AssetOwner,
  rgb: [number, number, number],
  colour: boolean,
  url: string,
): THREE.Texture {
  const canvas = document.createElement("canvas");
  canvas.width = canvas.height = 1;
  const ctx = canvas.getContext("2d");
  if (ctx) {
    ctx.fillStyle = `rgb(${rgb.join(",")})`;
    ctx.fillRect(0, 0, 1, 1);
  }
  const t = owner.texture(new THREE.Texture(canvas));
  t.colorSpace = colour ? THREE.SRGBColorSpace : THREE.NoColorSpace;
  t.wrapS = t.wrapT = THREE.RepeatWrapping;
  t.anisotropy = 8;
  t.needsUpdate = true;
  owner.fills.push(async () => {
    owner.check();
    const real = owner.texture(await textureLoader.loadAsync(`${base}${url}`));
    (t.source as { data: unknown }).data = real.image;
    t.source.needsUpdate = true;
    // The 1×1 stand-in was allocated as immutable storage: dispose so the GPU texture is
    // re-created at the real size on next use.
    for (const c of [t, ...(owner.copies.get(t.source) ?? [])]) {
      c.dispose();
      c.needsUpdate = true;
    }
    owner.resources.release(real);
  });
  return t;
}

/** A copy of a set texture with its own repeat, kept in step when a placeholder fills in. */
export function tiled(t: THREE.Texture, repeat: [number, number]): THREE.Texture {
  const c = t.clone();
  c.repeat.set(repeat[0], repeat[1]);
  c.needsUpdate = true;
  const owner = sourceOwners.get(t.source);
  if (owner) {
    owner.texture(c);
    const list = owner.copies.get(t.source) ?? [];
    list.push(c);
    owner.copies.set(t.source, list);
  }
  return c;
}

function deferredSet(owner: AssetOwner, name: SetName): PbrSet {
  const path = `textures/${name}/${name}`;
  return {
    colour: placeholder(owner, [120, 108, 92], true, `${path}_diff_1k.webp`),
    normal: placeholder(owner, [128, 128, 255], false, `${path}_nor_gl_1k.webp`),
    arm: placeholder(owner, [255, 210, 0], false, `${path}_arm_1k.webp`),
  };
}

async function pbrSet(owner: AssetOwner, name: SetName): Promise<PbrSet> {
  const path = `textures/${name}/${name}`;
  const [colour, normal, arm] = await Promise.all([
    texture(owner, `${path}_diff_1k.webp`, true),
    texture(owner, `${path}_nor_gl_1k.webp`, false),
    texture(owner, `${path}_arm_1k.webp`, false),
  ]);
  return { colour, normal, arm };
}

/**
 * Every mesh of a scan as its own float geometry, recentred so its base sits on the origin.
 * Meshopt output is quantised, so attributes are converted before the node transform is baked.
 */
function meshesOf(gltf: { scene: THREE.Object3D }, owner: AssetOwner): Scan[] {
  const out: Scan[] = [];
  gltf.scene.updateMatrixWorld(true);
  gltf.scene.traverse((object) => {
    if (!(object instanceof THREE.Mesh)) return;
    const source = object.geometry as THREE.BufferGeometry;
    const geometry = owner.resources.own(new THREE.BufferGeometry());
    for (const name of ["position", "normal", "uv"]) {
      const a = source.getAttribute(name);
      if (!a) continue;
      const data = new Float32Array(a.count * a.itemSize);
      for (let i = 0; i < a.count; i++)
        for (let c = 0; c < a.itemSize; c++) data[i * a.itemSize + c] = a.getComponent(i, c);
      geometry.setAttribute(name, new THREE.Float32BufferAttribute(data, a.itemSize));
    }
    if (source.index) geometry.setIndex(Array.from(source.index.array));
    geometry.applyMatrix4(object.matrixWorld);
    geometry.computeBoundingBox();
    const box = geometry.boundingBox as THREE.Box3;
    const centre = box.getCenter(new THREE.Vector3());
    geometry.translate(-centre.x, -box.min.y, -centre.z);
    const size = box.getSize(new THREE.Vector3());
    out.push({
      geometry,
      material: object.material as THREE.MeshStandardMaterial,
      radius: Math.max(size.x, size.z) / 2,
      height: size.y,
    });
  });
  return out;
}

const gltf = new GLTFLoader();
gltf.setMeshoptDecoder(MeshoptDecoder);
const glb = async (owner: AssetOwner, name: string) => {
  owner.check();
  const loaded = await gltf.loadAsync(`${base}models/${name}.glb`);
  owner.resources.tree(loaded.scene);
  owner.check();
  return loaded;
};
const hdr = async (owner: AssetOwner, size: string) => {
  owner.check();
  return owner.texture(
    await new HDRLoader()
      .setDataType(THREE.HalfFloatType)
      .loadAsync(`${base}env/table_mountain_1_puresky_${size}.hdr`),
  );
};

/** What the first frame needs: the 1K sky, terrain sets and the rock scans. */
export async function loadAssets(signal?: AbortSignal): Promise<Assets> {
  const owner = new AssetOwner(signal);
  try {
    const [sky, critical, rocksA, rocksB, boulder] = await owner.wait(
      Promise.all([
        hdr(owner, "1k"),
        Promise.all(CRITICAL.map((name) => pbrSet(owner, name))),
        glb(owner, "rock_moss_set_01"),
        glb(owner, "rock_moss_set_02"),
        glb(owner, "boulder_01"),
      ]),
    );
    sky.mapping = THREE.EquirectangularReflectionMapping;
    const boulderScan = meshesOf(boulder, owner)[0];
    if (!boulderScan) throw new Error("boulder_01 has no mesh");
    const sets = {} as Record<SetName, PbrSet>;
    for (const name of SETS) {
      const i = CRITICAL.indexOf(name);
      sets[name] = i >= 0 ? (critical[i] as PbrSet) : deferredSet(owner, name);
    }
    const loaded: Assets = {
      sky,
      sets,
      rocks: [...meshesOf(rocksA, owner), ...meshesOf(rocksB, owner)],
      boulder: boulderScan,
      grass: null,
      fern: null,
    };
    owners.set(loaded, owner);
    return loaded;
  } catch (error) {
    owner.dispose();
    throw error;
  }
}

/** Run `build` once foliage has arrived (immediately if it already has). */
export function whenFoliage(build: () => void): () => void {
  const loaded = assets();
  const owner = owners.get(loaded);
  if (loaded.grass) build();
  else owner?.foliageWaiters.add(build);
  return () => owner?.foliageWaiters.delete(build);
}

/**
 * Everything the first frame can do without, loaded after the veil lifts: the 2K sky for the
 * background, the wood and pebble sets, and the grass and fern scans.
 */
export async function loadDeferred(
  onSky: (sky: THREE.DataTexture) => void,
  loaded = assets(),
  signal?: AbortSignal,
): Promise<void> {
  const owner = owners.get(loaded);
  if (!owner) throw new Error("Deferred assets require their loaded bundle");
  const cancel = () => owner.dispose();
  signal?.addEventListener("abort", cancel, { once: true });
  if (signal?.aborted) cancel();
  owner.check();
  if (!owner.deferred)
    owner.deferred = owner.wait(
      (async () => {
        const fills = Promise.all(owner.fills.splice(0).map((f) => f()));
        // The fills run concurrently with foliage; attach a rejection handler immediately.
        void fills.catch(() => {});
        const [grassGlb, fernGlb, grassAlpha, grassColour, fernAlpha] = await Promise.all([
          glb(owner, "grass_medium_02"),
          glb(owner, "fern_02"),
          texture(owner, "models/grass_medium_02_alpha_1k.webp", false, false),
          texture(owner, "models/grass_medium_02_diff_bled_1k.webp", true, false),
          texture(owner, "models/fern_02_alpha_1k.webp", false, false),
        ]);
        owner.check();
        const grass = meshesOf(grassGlb, owner);
        const fern = meshesOf(fernGlb, owner);
        const grassMaterial = (grass[0]?.material ?? new THREE.MeshStandardMaterial()).clone();
        grassMaterial.map = grassColour;
        grassMaterial.alphaMap = grassAlpha;
        const fernMaterial = (fern[0]?.material ?? new THREE.MeshStandardMaterial()).clone();
        fernMaterial.alphaMap = fernAlpha;
        owner.resources.material(grassMaterial);
        owner.resources.material(fernMaterial);
        loaded.grass = { variants: grass.map((g) => g.geometry), material: grassMaterial };
        loaded.fern = { variants: fern.map((g) => g.geometry), material: fernMaterial };
        for (const build of owner.foliageWaiters) build();
        owner.foliageWaiters.clear();
        await fills;
        const sky = await hdr(owner, "2k");
        sky.mapping = THREE.EquirectangularReflectionMapping;
        onSky(sky);
      })(),
    );
  try {
    await owner.deferred;
  } finally {
    signal?.removeEventListener("abort", cancel);
  }
}

let current: Assets | null = null;

/** The loaded assets; builders call this after loadAssets() has resolved. */
export function assets(): Assets {
  if (!current) throw new Error("Assets used before loadAssets() resolved");
  return current;
}

export function setAssets(a: Assets): void {
  owners.get(a)?.check();
  current = a;
}

/** Scene resources share the bundle's lifetime, so shared maps are released only once. */
export function assetResources(loaded: Assets): SceneResources {
  return owners.get(loaded)?.resources ?? new SceneResources();
}

export function disposeAssets(loaded: Assets): void {
  if (current === loaded) current = null;
  owners.get(loaded)?.dispose();
}
