// One lighting model from one sky: the CC0 HDRI is the visible background and, through PMREM,
// the image-based light on every surface. The sun is measured out of the HDRI (direction and
// illuminance), removed from the copy used for IBL so it is not counted twice, and given to the
// directional key light instead. Its horizon radiance tints the aerial perspective.

import * as THREE from "three";

export interface SkyLight {
  /** Unit vector towards the sun, after the sky has been rotated into place. */
  sun: THREE.Vector3;
  /** Sun illuminance in the HDRI's radiometric units (what the key light's intensity takes). */
  sunIlluminance: number;
  sunColour: THREE.Color;
  /** Mean radiance of the band just above the horizon (linear), for haze. */
  horizon: THREE.Color;
  environment: THREE.Texture;
  dispose(): void;
}

const half = THREE.DataUtils.fromHalfFloat;

/** Direction for a texel of a three.js equirectangular map (row 0 is the image top). */
function texelDirection(x: number, y: number, w: number, h: number): THREE.Vector3 {
  const u = (x + 0.5) / w;
  const v = 1 - (y + 0.5) / h;
  const lat = (v - 0.5) * Math.PI;
  const lon = (u - 0.5) * Math.PI * 2;
  return new THREE.Vector3(
    Math.cos(lon) * Math.cos(lat),
    Math.sin(lat),
    Math.sin(lon) * Math.cos(lat),
  );
}

/**
 * Measure the HDRI and install it, turned about the vertical so its sun sits at `sunAzimuth`
 * (radians, from +x towards +z) at its own, true elevation. One rotation moves background, IBL and the
 * key light together, so the sky stays a single consistent light source.
 */
export function installSky(
  renderer: THREE.WebGLRenderer,
  scene: THREE.Scene,
  hdr: THREE.DataTexture,
  sunAzimuth: number,
): SkyLight {
  const { width: w, height: h } = hdr.image as { width: number; height: number };
  const src = hdr.image.data as Uint16Array;
  const lum = new Float32Array(w * h);
  let peak = 0;
  let peakAt = 0;
  for (let i = 0; i < w * h; i++) {
    const l =
      0.2126 * half(src[i * 4] ?? 0) +
      0.7152 * half(src[i * 4 + 1] ?? 0) +
      0.0722 * half(src[i * 4 + 2] ?? 0);
    lum[i] = l;
    if (l > peak) {
      peak = l;
      peakAt = i;
    }
  }
  // The sun: every texel far brighter than the sky around it. Integrate radiance × solid angle.
  const sorted = Float32Array.from(lum).sort();
  const skyLevel = sorted[Math.floor(sorted.length * 0.98)] ?? 1;
  const threshold = Math.max(skyLevel * 6, peak * 0.02);
  const dPhi = (Math.PI * 2) / w;
  const dTheta = Math.PI / h;
  const sunRgb = new THREE.Color(0, 0, 0);
  let sunE = 0;
  const clamped = new Uint16Array(src);
  for (let i = 0; i < w * h; i++) {
    if ((lum[i] ?? 0) <= threshold) continue;
    const y = Math.floor(i / w);
    const omega = dPhi * dTheta * Math.cos(((h - y - 0.5) / h - 0.5) * Math.PI);
    const r = half(src[i * 4] ?? 0);
    const g = half(src[i * 4 + 1] ?? 0);
    const b = half(src[i * 4 + 2] ?? 0);
    sunRgb.r += r * omega;
    sunRgb.g += g * omega;
    sunRgb.b += b * omega;
    sunE += (lum[i] ?? 0) * omega;
    // Clamp the disc to the surrounding sky for the IBL copy.
    const k = threshold / (lum[i] ?? 1);
    for (let c = 0; c < 3; c++)
      clamped[i * 4 + c] = THREE.DataUtils.toHalfFloat(half(src[i * 4 + c] ?? 0) * k);
  }
  const px = peakAt % w;
  const py = Math.floor(peakAt / w);
  const raw = texelDirection(px, py, w, h).normalize();
  // three samples the map at R·d; choose R so the wanted sun direction samples the HDRI's sun.
  const elevation = Math.asin(THREE.MathUtils.clamp(raw.y, -1, 1));
  const sun = new THREE.Vector3(
    Math.cos(elevation) * Math.cos(sunAzimuth),
    Math.sin(elevation),
    Math.cos(elevation) * Math.sin(sunAzimuth),
  );
  const orient = new THREE.Quaternion().setFromUnitVectors(sun, raw);

  // Horizon band: rows from 1° to 8° above the horizon.
  const horizon = new THREE.Color(0, 0, 0);
  let n = 0;
  for (let y = Math.floor(h * (0.5 - 8 / 180)); y < Math.floor(h * (0.5 - 1 / 180)); y++)
    for (let x = 0; x < w; x += 4) {
      const i = (y * w + x) * 4;
      horizon.r += half(clamped[i] ?? 0);
      horizon.g += half(clamped[i + 1] ?? 0);
      horizon.b += half(clamped[i + 2] ?? 0);
      n++;
    }
  horizon.multiplyScalar(1 / Math.max(n, 1));

  const iblSource = new THREE.DataTexture(clamped, w, h, THREE.RGBAFormat, THREE.HalfFloatType);
  iblSource.mapping = THREE.EquirectangularReflectionMapping;
  iblSource.colorSpace = THREE.LinearSRGBColorSpace;
  iblSource.flipY = hdr.flipY;
  iblSource.needsUpdate = true;
  const pmrem = new THREE.PMREMGenerator(renderer);
  const target = pmrem.fromEquirectangular(iblSource);
  const environment = target.texture;
  pmrem.dispose();
  iblSource.dispose();

  scene.background = hdr;
  scene.environment = environment;
  scene.backgroundRotation.setFromQuaternion(orient);
  scene.environmentRotation.setFromQuaternion(orient);
  const sunColour = sunRgb.multiplyScalar(1 / Math.max(sunE, 1e-6));
  return {
    sun,
    sunIlluminance: sunE,
    sunColour,
    horizon,
    environment,
    dispose: () => target.dispose(),
  };
}
