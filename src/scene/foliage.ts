// Grass, ferns and wildflowers that move in the wind. Grass and ferns are instanced CC0 scans
// (Poly Haven, via ODD TIDE) with alpha-to-coverage cut-outs; wildflowers are procedural stems
// and heads. Every instance gets 15–25 % scale, a free rotation and a slight tone shift. The
// foliage shading follows ODD TIDE's: wind bends each plant by height above its own origin.

import * as THREE from "three";
import { assetResources, assets, type Foliage, whenFoliage } from "./assets";
import { rng } from "./kit";
import type { SceneResources } from "./resources";

const wind = { time: { value: 0 }, strength: { value: 1 } };

/** Advance the shared wind (seconds); `strength` 0 stills every plant (reduced motion). */
export function setWind(time: number, strength: number): void {
  wind.time.value = time;
  wind.strength.value = strength;
}

let reveal: ((objects: THREE.Object3D[]) => unknown) | null = null;
/** How streamed foliage joins the scene (the stage compiles its shaders before showing it). */
export function setFoliageReveal(fn: (objects: THREE.Object3D[]) => unknown): () => void {
  reveal = fn;
  return () => {
    if (reveal === fn) reveal = null;
  };
}

let density = 1;
/** Scale every field's instance count (the low quality tier plants fewer). */
export function setFoliageDensity(d: number): void {
  density = d;
}

function prepare(
  material: THREE.MeshStandardMaterial,
  stiffness: number,
): THREE.MeshStandardMaterial {
  material.side = THREE.DoubleSide;
  material.alphaTest = 0.45;
  material.alphaToCoverage = true;
  material.transparent = false;
  material.defines = { ...material.defines, FOLIAGE_STIFFNESS: stiffness.toFixed(3) };
  material.onBeforeCompile = (shader) => {
    shader.uniforms.windTime = wind.time;
    shader.uniforms.windStrength = wind.strength;
    shader.vertexShader = shader.vertexShader
      .replace(
        "#include <common>",
        `#include <common>
        uniform float windTime;
        uniform float windStrength;`,
      )
      .replace(
        "#include <begin_vertex>",
        `#include <begin_vertex>
        #ifdef USE_INSTANCING
          vec3 plantBase = (modelMatrix * instanceMatrix * vec4(0.0, 0.0, 0.0, 1.0)).xyz;
        #else
          vec3 plantBase = (modelMatrix * vec4(0.0, 0.0, 0.0, 1.0)).xyz;
        #endif
        float windPhase = plantBase.x * 1.7 + plantBase.z * 1.3;
        float windBend = max(position.y, 0.0);
        windBend *= windBend * FOLIAGE_STIFFNESS;
        float gust = sin(windTime * 1.6 + windPhase) * 0.6 + sin(windTime * 3.1 + windPhase * 1.7) * 0.25;
        transformed.x += (0.25 + gust) * windBend * windStrength;
        transformed.z += (0.1 + gust * 0.5) * windBend * windStrength * 0.6;`,
      );
  };
  material.customProgramCacheKey = () => `foliage-${stiffness}-${material.alphaMap ? "a" : "o"}`;
  return material;
}

let grassMat: THREE.MeshStandardMaterial | null = null;
let fernMat: THREE.MeshStandardMaterial | null = null;
let stemMat: THREE.MeshStandardMaterial | null = null;
let headMat: THREE.MeshStandardMaterial | null = null;

export function clearFoliage(resources: SceneResources): void {
  for (const material of [grassMat, fernMat, stemMat, headMat])
    if (material) resources.material(material);
  grassMat = fernMat = stemMat = headMat = null;
}

/** Scan materials; only call once foliage has arrived (inside whenFoliage). */
function scanMaterials(grass: Foliage, fern: Foliage) {
  if (!grassMat || !fernMat) {
    grassMat = prepare(grass.material.clone(), 1.2);
    // The scanned blades are lit flat and read paler than living grass; pull toward damp olive.
    grassMat.color.setRGB(0.34, 0.46, 0.2);
    fernMat = prepare(fern.material.clone(), 0.3);
    fernMat.color.setRGB(0.8, 0.85, 0.72);
  }
  return { grass: grassMat, fern: fernMat };
}

function flowerMaterials() {
  if (!stemMat || !headMat) {
    stemMat = prepare(new THREE.MeshStandardMaterial({ color: "#56703a", roughness: 0.8 }), 6);
    headMat = prepare(new THREE.MeshStandardMaterial({ color: "#ffffff", roughness: 0.6 }), 6);
  }
  return { stem: stemMat, head: headMat };
}

/** Build into `group` once the foliage scans have streamed in. */
function whenScans(
  group: THREE.Group,
  build: (grass: Foliage, fern: Foliage) => void,
): THREE.Group {
  const loaded = assets();
  const show = reveal;
  const remove = whenFoliage(() => {
    const { grass, fern } = loaded;
    if (!grass || !fern) return;
    const before = group.children.length;
    build(grass, fern);
    void Promise.resolve(show?.(group.children.slice(before))).catch((error) =>
      console.warn("Foliage shader preparation failed", error),
    );
  });
  assetResources(loaded).own({ dispose: remove });
  return group;
}

type Clear = { x: number; z: number; r: number }[];

/** Points in a disc, avoiding cleared circles; each with rotation, scale and tone jitter. */
function scatter(radius: number, count: number, seed: number, clear: Clear) {
  const r = rng(seed);
  const out: { x: number; z: number; yaw: number; scale: number; tone: number }[] = [];
  for (let tries = 0; out.length < count && tries < count * 8; tries++) {
    const a = r() * Math.PI * 2;
    const d = Math.sqrt(r()) * radius * 0.9;
    const x = Math.cos(a) * d;
    const z = Math.sin(a) * d;
    if (clear.some((k) => (x - k.x) ** 2 + (z - k.z) ** 2 < k.r * k.r)) continue;
    out.push({ x, z, yaw: r() * Math.PI * 2, scale: 0.8 + r() * 0.4, tone: 0.92 + r() * 0.16 });
  }
  return out;
}

function instance(
  geometry: THREE.BufferGeometry,
  material: THREE.Material,
  points: ReturnType<typeof scatter>,
  size: number,
  hue: (tone: number, i: number) => THREE.Color,
): THREE.InstancedMesh {
  const mesh = new THREE.InstancedMesh(geometry, material, Math.max(1, points.length));
  const m = new THREE.Matrix4();
  const q = new THREE.Quaternion();
  const up = new THREE.Vector3(0, 1, 0);
  points.forEach((p, i) => {
    q.setFromAxisAngle(up, p.yaw);
    const s = p.scale * size;
    m.compose(
      new THREE.Vector3(p.x, -0.01, p.z),
      q,
      new THREE.Vector3(s, s * (0.85 + (p.tone - 1) * 1.5), s),
    );
    mesh.setMatrixAt(i, m);
    mesh.setColorAt(i, hue(p.tone, i));
  });
  mesh.count = points.length;
  mesh.castShadow = true;
  mesh.receiveShadow = true;
  return mesh;
}

/** A turf of scanned grass clumps across a diorama top. */
export function grassField(
  radius: number,
  count: number,
  seed: number,
  clear: Clear = [],
): THREE.Group {
  const group = new THREE.Group();
  const points = scatter(radius, Math.round(count * 1.6 * density), seed, clear);
  return whenScans(group, (grass, fern) => {
    const mats = scanMaterials(grass, fern);
    // The three lightest clump variants (about 550–1,300 triangles each) carry the turf.
    const light = [...grass.variants]
      .sort((a, b) => (a.index?.count ?? 0) - (b.index?.count ?? 0))
      .slice(0, 3);
    const variants = light.length || 1;
    light.forEach((geometry, v) => {
      const bucket = points.filter((_, i) => i % variants === v);
      if (bucket.length === 0) return;
      group.add(
        instance(
          geometry,
          mats.grass,
          bucket,
          1.25,
          (t) => new THREE.Color(t, t * (1 + (t - 1) * 0.6), t * 0.95),
        ),
      );
    });
  });
}

/** A few scanned ferns, tucked against rocks and cliffs. */
export function ferns(spots: { x: number; z: number; s: number }[], seed: number): THREE.Group {
  const r = rng(seed);
  const group = new THREE.Group();
  const points = spots.map((p) => ({
    x: p.x,
    z: p.z,
    yaw: r() * Math.PI * 2,
    scale: p.s * (0.8 + r() * 0.4),
    tone: 0.9 + r() * 0.2,
  }));
  return whenScans(group, (grass, fern) => {
    const mats = scanMaterials(grass, fern);
    const variants = fern.variants.length || 1;
    fern.variants.forEach((geometry, v) => {
      const bucket = points.filter((_, i) => i % variants === v);
      if (bucket.length)
        group.add(instance(geometry, mats.fern, bucket, 0.5, (t) => new THREE.Color(t, t, t)));
    });
  });
}

const FLOWER_COLOURS = ["#f2d04b", "#f4efe2", "#b77bb8", "#e9a1b0", "#9fb4e8"].map(
  (c) => new THREE.Color(c),
);

/** Wildflowers: thin stems with five-petal heads in yellow, white, heather, pink and harebell. */
export function flowers(radius: number, count: number, seed: number): THREE.Group {
  const mats = flowerMaterials();
  const stem = new THREE.CylinderGeometry(0.004, 0.006, 0.16, 4, 3);
  stem.translate(0, 0.08, 0);
  const petal = new THREE.CircleGeometry(0.018, 6);
  const parts: THREE.BufferGeometry[] = [];
  for (let i = 0; i < 5; i++) {
    const p = petal.clone();
    p.rotateX(-Math.PI / 2 + 0.35);
    p.translate(0, 0, 0.016);
    p.rotateY((i / 5) * Math.PI * 2);
    parts.push(p);
  }
  const head = mergeParts(parts);
  head.translate(0, 0.16, 0);
  const points = scatter(radius, Math.round(count * density), seed + 5, []);
  const group = new THREE.Group();
  group.add(instance(stem, mats.stem, points, 1, (t) => new THREE.Color(t, t, t)));
  group.add(
    instance(head, mats.head, points, 1, (t, i) =>
      (FLOWER_COLOURS[i % FLOWER_COLOURS.length] as THREE.Color).clone().multiplyScalar(t),
    ),
  );
  return group;
}

function mergeParts(parts: THREE.BufferGeometry[]): THREE.BufferGeometry {
  const positions: number[] = [];
  const normals: number[] = [];
  for (const g of parts) {
    const n = g.index ? g.toNonIndexed() : g;
    positions.push(...(n.getAttribute("position").array as Float32Array));
    normals.push(...(n.getAttribute("normal").array as Float32Array));
  }
  const out = new THREE.BufferGeometry();
  out.setAttribute("position", new THREE.Float32BufferAttribute(positions, 3));
  out.setAttribute("normal", new THREE.Float32BufferAttribute(normals, 3));
  return out;
}
