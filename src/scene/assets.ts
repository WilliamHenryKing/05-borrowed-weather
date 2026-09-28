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
  grass: { variants: THREE.BufferGeometry[]; material: THREE.MeshStandardMaterial };
  fern: { variants: THREE.BufferGeometry[]; material: THREE.MeshStandardMaterial };
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

export async function loadAssets(): Promise<Assets> {
  const gltf = new GLTFLoader();
  gltf.setMeshoptDecoder(MeshoptDecoder);
  const glb = (name: string) => gltf.loadAsync(`${base}models/${name}.glb`);
  const [
    sky,
    sets,
    rocksA,
    rocksB,
    boulder,
    grassGlb,
    fernGlb,
    grassAlpha,
    grassColour,
    fernAlpha,
  ] = await Promise.all([
    new HDRLoader()
      .setDataType(THREE.HalfFloatType)
      .loadAsync(`${base}env/table_mountain_1_puresky_2k.hdr`),
    Promise.all(SETS.map(pbrSet)),
    glb("rock_moss_set_01"),
    glb("rock_moss_set_02"),
    glb("boulder_01"),
    glb("grass_medium_02"),
    glb("fern_02"),
    texture("models/grass_medium_02_alpha_1k.webp", false, false),
    texture("models/grass_medium_02_diff_bled_1k.webp", true, false),
    texture("models/fern_02_alpha_1k.webp", false, false),
  ]);
  sky.mapping = THREE.EquirectangularReflectionMapping;
  const grass = meshesOf(grassGlb);
  const fern = meshesOf(fernGlb);
  const grassMaterial = (grass[0]?.material ?? new THREE.MeshStandardMaterial()).clone();
  grassMaterial.map = grassColour;
  grassMaterial.alphaMap = grassAlpha;
  const fernMaterial = (fern[0]?.material ?? new THREE.MeshStandardMaterial()).clone();
  fernMaterial.alphaMap = fernAlpha;
  const boulderScan = meshesOf(boulder)[0];
  if (!boulderScan) throw new Error("boulder_01 has no mesh");
  return {
    sky,
    sets: Object.fromEntries(SETS.map((n, i) => [n, sets[i] as PbrSet])) as Record<SetName, PbrSet>,
    rocks: [...meshesOf(rocksA), ...meshesOf(rocksB)],
    boulder: boulderScan,
    grass: { variants: grass.map((g) => g.geometry), material: grassMaterial },
    fern: { variants: fern.map((g) => g.geometry), material: fernMaterial },
  };
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
