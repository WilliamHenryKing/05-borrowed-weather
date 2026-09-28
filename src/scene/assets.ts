// Sourced CC0 assets (see assets.manifest.json), loaded once before the trail is built so the
// diorama builders can stay synchronous. Colour maps are sRGB, every other map is linear.

import * as THREE from "three";
import { MeshoptDecoder } from "three/addons/libs/meshopt_decoder.module.js";
import { GLTFLoader } from "three/addons/loaders/GLTFLoader.js";
import { HDRLoader } from "three/addons/loaders/HDRLoader.js";

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

async function texture(url: string, colour: boolean, flipY = true): Promise<THREE.Texture> {
  const t = await textureLoader.loadAsync(`${base}${url}`);
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
function placeholder(rgb: [number, number, number], colour: boolean, url: string): THREE.Texture {
  const canvas = document.createElement("canvas");
  canvas.width = canvas.height = 1;
  const ctx = canvas.getContext("2d");
  if (ctx) {
    ctx.fillStyle = `rgb(${rgb.join(",")})`;
    ctx.fillRect(0, 0, 1, 1);
  }
  const t = new THREE.Texture(canvas);
  t.colorSpace = colour ? THREE.SRGBColorSpace : THREE.NoColorSpace;
  t.wrapS = t.wrapT = THREE.RepeatWrapping;
  t.anisotropy = 8;
  t.needsUpdate = true;
  deferredFills.push(async () => {
    const real = await textureLoader.loadAsync(`${base}${url}`);
    (t.source as { data: unknown }).data = real.image;
    t.source.needsUpdate = true;
    // The 1×1 stand-in was allocated as immutable storage: dispose so the GPU texture is
    // re-created at the real size on next use.
    for (const c of [t, ...(copies.get(t.source) ?? [])]) {
      c.dispose();
      c.needsUpdate = true;
    }
  });
  return t;
}

const deferredFills: (() => Promise<void>)[] = [];
/** Tiled copies share their original's source but re-upload only when their own version bumps. */
const copies = new Map<object, THREE.Texture[]>();

/** A copy of a set texture with its own repeat, kept in step when a placeholder fills in. */
export function tiled(t: THREE.Texture, repeat: [number, number]): THREE.Texture {
  const c = t.clone();
  c.repeat.set(repeat[0], repeat[1]);
  c.needsUpdate = true;
  const list = copies.get(t.source) ?? [];
  list.push(c);
  copies.set(t.source, list);
  return c;
}

function deferredSet(name: SetName): PbrSet {
  const path = `textures/${name}/${name}`;
  return {
    colour: placeholder([120, 108, 92], true, `${path}_diff_1k.webp`),
    normal: placeholder([128, 128, 255], false, `${path}_nor_gl_1k.webp`),
    arm: placeholder([255, 210, 0], false, `${path}_arm_1k.webp`),
  };
}

async function pbrSet(name: SetName): Promise<PbrSet> {
  const path = `textures/${name}/${name}`;
  const [colour, normal, arm] = await Promise.all([
    texture(`${path}_diff_1k.webp`, true),
    texture(`${path}_nor_gl_1k.webp`, false),
    texture(`${path}_arm_1k.webp`, false),
  ]);
  return { colour, normal, arm };
}

/**
 * Every mesh of a scan as its own float geometry, recentred so its base sits on the origin.
 * Meshopt output is quantised, so attributes are converted before the node transform is baked.
 */
function meshesOf(gltf: { scene: THREE.Object3D }): Scan[] {
  const out: Scan[] = [];
  gltf.scene.updateMatrixWorld(true);
  gltf.scene.traverse((object) => {
    if (!(object instanceof THREE.Mesh)) return;
    const source = object.geometry as THREE.BufferGeometry;
    const geometry = new THREE.BufferGeometry();
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
const glb = (name: string) => gltf.loadAsync(`${base}models/${name}.glb`);
const hdr = (size: string) =>
  new HDRLoader()
    .setDataType(THREE.HalfFloatType)
    .loadAsync(`${base}env/table_mountain_1_puresky_${size}.hdr`);

/** What the first frame needs: the 1K sky, terrain sets and the rock scans. */
export async function loadAssets(): Promise<Assets> {
  const [sky, critical, rocksA, rocksB, boulder] = await Promise.all([
    hdr("1k"),
    Promise.all(CRITICAL.map(pbrSet)),
    glb("rock_moss_set_01"),
    glb("rock_moss_set_02"),
    glb("boulder_01"),
  ]);
  sky.mapping = THREE.EquirectangularReflectionMapping;
  const boulderScan = meshesOf(boulder)[0];
  if (!boulderScan) throw new Error("boulder_01 has no mesh");
  const sets = {} as Record<SetName, PbrSet>;
  for (const name of SETS) {
    const i = CRITICAL.indexOf(name);
    sets[name] = i >= 0 ? (critical[i] as PbrSet) : deferredSet(name);
  }
  return {
    sky,
    sets,
    rocks: [...meshesOf(rocksA), ...meshesOf(rocksB)],
    boulder: boulderScan,
    grass: null,
    fern: null,
  };
}

const foliageWaiters: (() => void)[] = [];

/** Run `build` once foliage has arrived (immediately if it already has). */
export function whenFoliage(build: () => void): void {
  if (current?.grass) build();
  else foliageWaiters.push(build);
}

/**
 * Everything the first frame can do without, loaded after the veil lifts: the 2K sky for the
 * background, the wood and pebble sets, and the grass and fern scans.
 */
export async function loadDeferred(onSky: (sky: THREE.DataTexture) => void): Promise<void> {
  const fills = Promise.all(deferredFills.splice(0).map((f) => f()));
  const [grassGlb, fernGlb, grassAlpha, grassColour, fernAlpha] = await Promise.all([
    glb("grass_medium_02"),
    glb("fern_02"),
    texture("models/grass_medium_02_alpha_1k.webp", false, false),
    texture("models/grass_medium_02_diff_bled_1k.webp", true, false),
    texture("models/fern_02_alpha_1k.webp", false, false),
  ]);
  const grass = meshesOf(grassGlb);
  const fern = meshesOf(fernGlb);
  const grassMaterial = (grass[0]?.material ?? new THREE.MeshStandardMaterial()).clone();
  grassMaterial.map = grassColour;
  grassMaterial.alphaMap = grassAlpha;
  const fernMaterial = (fern[0]?.material ?? new THREE.MeshStandardMaterial()).clone();
  fernMaterial.alphaMap = fernAlpha;
  if (current) {
    current.grass = { variants: grass.map((g) => g.geometry), material: grassMaterial };
    current.fern = { variants: fern.map((g) => g.geometry), material: fernMaterial };
  }
  for (const build of foliageWaiters.splice(0)) build();
  await fills;
  const sky = await hdr("2k");
  sky.mapping = THREE.EquirectangularReflectionMapping;
  onSky(sky);
}

let current: Assets | null = null;

/** The loaded assets; builders call this after loadAssets() has resolved. */
export function assets(): Assets {
  if (!current) throw new Error("Assets used before loadAssets() resolved");
  return current;
}

export function setAssets(a: Assets): void {
  current = a;
}
