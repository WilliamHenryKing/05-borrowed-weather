// Renderer, sky, light rig and the frame loop. One lighting model: the HDRI sky lights the
// scene through PMREM, the key light is that sky's own sun, AgX runs once in OutputPass, and
// exposure is the only brightness control.

import * as THREE from "three";
import type { Assets } from "./assets";
import { Pipeline, type Quality } from "./render/pipeline";
import { installSky, type SkyLight } from "./render/sky";

/** Exposure: the single brightness control. */
const EXPOSURE = 2.6;
/** Sun placement for the composition: ahead and to the right of the climb, afternoon-high. */
const SUN_AZIMUTH = Math.atan2(-0.9, 0.45);
const SUN_ELEVATION = THREE.MathUtils.degToRad(32);
/** Metres the key light's shadow box spans around the focused diorama. */
const SHADOW_HALF = 3.4;

let fogPatched = false;
/**
 * Aerial perspective (after ODD TIDE's rig): exponential extinction over the true view
 * distance rather than view depth, tinted with the sky's horizon radiance, and thinning with
 * height so the high islands stand clear of the valley haze.
 */
function patchFog(): void {
  if (fogPatched) return;
  fogPatched = true;
  THREE.ShaderChunk.fog_pars_vertex = `#ifdef USE_FOG
  varying float vFogDepth;
  varying float vFogHeight;
#endif`;
  THREE.ShaderChunk.fog_vertex = `#ifdef USE_FOG
  vFogDepth = length( mvPosition.xyz );
  vFogHeight = ( inverse( viewMatrix ) * mvPosition ).y;
#endif`;
  THREE.ShaderChunk.fog_pars_fragment = `#ifdef USE_FOG
  uniform vec3 fogColor;
  varying float vFogDepth;
  varying float vFogHeight;
  #ifdef FOG_EXP2
    uniform float fogDensity;
  #else
    uniform float fogNear;
    uniform float fogFar;
  #endif
#endif`;
  THREE.ShaderChunk.fog_fragment = `#ifdef USE_FOG
  #ifdef FOG_EXP2
    float fogThin = exp( -max( vFogHeight - 2.0, 0.0 ) * 0.035 );
    float fogFactor = 1.0 - exp( -fogDensity * vFogDepth * fogThin );
  #else
    float fogFactor = smoothstep( fogNear, fogFar, vFogDepth );
  #endif
  gl_FragColor.rgb = mix( gl_FragColor.rgb, fogColor, fogFactor );
#endif`;
}

export class Stage {
  readonly renderer: THREE.WebGLRenderer;
  readonly scene = new THREE.Scene();
  readonly camera = new THREE.PerspectiveCamera(40, 1, 0.1, 400);
  readonly key: THREE.DirectionalLight;
  readonly sky: SkyLight;
  readonly pipeline: Pipeline;
  /** Objects the AO pass skips (transparent effects); filled by the scene. */
  readonly aoHidden: THREE.Object3D[] = [];
  private readonly clock = new THREE.Clock();
  private frame = 0;
  private running = false;
  private frozenAt: number | null = null;
  private paused = false;
  private waiters: { frame: number; done: () => void }[] = [];
  onFrame: (dt: number, time: number) => void = () => {};
  onFirstFrame: () => void = () => {};

  constructor(
    private readonly host: HTMLElement,
    readonly quality: Quality,
    assets: Assets,
  ) {
    patchFog();
    this.renderer = new THREE.WebGLRenderer({
      antialias: false,
      powerPreference: "high-performance",
      stencil: false,
    });
    this.renderer.outputColorSpace = THREE.SRGBColorSpace;
    this.renderer.toneMapping = THREE.AgXToneMapping;
    this.renderer.toneMappingExposure = EXPOSURE;
    this.renderer.shadowMap.enabled = true;
    this.renderer.shadowMap.type = THREE.PCFSoftShadowMap;
    this.renderer.domElement.className = "block h-full w-full touch-none";
    this.renderer.domElement.setAttribute("aria-hidden", "true");
    host.appendChild(this.renderer.domElement);

    this.sky = installSky(this.renderer, this.scene, assets.sky, SUN_AZIMUTH, SUN_ELEVATION);
    this.scene.fog = new THREE.FogExp2(this.sky.horizon.clone(), 0.004);

    this.key = new THREE.DirectionalLight(this.sky.sunColour, this.sky.sunIlluminance);
    this.key.castShadow = true;
    const size = quality === "high" ? 2048 : 1024;
    this.key.shadow.mapSize.set(size, size);
    const cam = this.key.shadow.camera;
    cam.left = cam.bottom = -SHADOW_HALF;
    cam.right = cam.top = SHADOW_HALF;
    cam.near = 0.5;
    cam.far = 40;
    cam.updateProjectionMatrix();
    const texel = (2 * SHADOW_HALF) / size;
    this.key.shadow.normalBias = texel * 1.2;
    this.key.shadow.bias = -0.0002;
    this.key.shadow.radius = 2;
    this.scene.add(this.key, this.key.target);

    this.pipeline = new Pipeline(
      this.renderer,
      this.scene,
      this.camera,
      quality,
      () => this.aoHidden,
    );
    this.resize();
    window.addEventListener("resize", this.resize);
  }

  /**
   * Keep the fitted shadow box on the focused diorama, snapped to whole shadow texels in light
   * space so edges do not shimmer as the camera glides.
   */
  aimLight(target: THREE.Vector3): void {
    const texel = (2 * SHADOW_HALF) / this.key.shadow.mapSize.x;
    const forward = this.sky.sun.clone().negate();
    const right = new THREE.Vector3().crossVectors(forward, new THREE.Vector3(0, 1, 0)).normalize();
    const up = new THREE.Vector3().crossVectors(right, forward).normalize();
    const snap = (v: number) => Math.round(v / texel) * texel;
    const snapped = new THREE.Vector3()
      .addScaledVector(right, snap(target.dot(right)))
      .addScaledVector(up, snap(target.dot(up)))
      .addScaledVector(forward, target.dot(forward));
    this.key.target.position.copy(snapped);
    this.key.position.copy(snapped).addScaledVector(this.sky.sun, 18);
  }

  readonly resize = (): void => {
    const w = this.host.clientWidth || window.innerWidth;
    const h = this.host.clientHeight || window.innerHeight;
    const cap = this.quality === "high" ? 2 : 1.5;
    const ratio = Math.min(window.devicePixelRatio || 1, cap);
    this.renderer.setPixelRatio(ratio);
    this.renderer.setSize(w, h, false);
    this.pipeline.setSize(w, h, ratio);
    this.camera.aspect = w / h;
    this.camera.fov = w / h < 0.75 ? 52 : 40;
    this.camera.updateProjectionMatrix();
  };

  start(): void {
    this.running = true;
    const tick = () => {
      if (!this.running) return;
      if (this.paused) {
        requestAnimationFrame(tick);
        return;
      }
      const raw = Math.min(this.clock.getDelta(), 0.1);
      const dt = this.frozenAt === null ? raw : 0;
      this.onFrame(dt, this.frozenAt ?? this.clock.elapsedTime);
      this.pipeline.render();
      if (this.frame++ === 0) this.onFirstFrame();
      const due = this.waiters.filter((w) => this.frame >= w.frame);
      this.waiters = this.waiters.filter((w) => this.frame < w.frame);
      for (const w of due) w.done();
      requestAnimationFrame(tick);
    };
    requestAnimationFrame(tick);
  }

  /** Stop scene time (visual tests); rendering continues so captures stay live. */
  freeze(on: boolean): void {
    this.frozenAt = on ? this.clock.elapsedTime : null;
  }

  /** Stop drawing (visual tests): the last frame stays on the canvas for a screenshot. */
  pause(on: boolean): void {
    this.paused = on;
  }

  /** Resolve once `frames` more frames have been rendered. */
  settle(frames: number): Promise<void> {
    return new Promise((done) => this.waiters.push({ frame: this.frame + frames, done }));
  }

  get rendered(): number {
    return this.frame;
  }

  /** The GPU renderer string, for logging which backend produced a capture. */
  rendererName(): string {
    const gl = this.renderer.getContext();
    const ext = gl.getExtension("WEBGL_debug_renderer_info");
    return String(gl.getParameter(ext ? ext.UNMASKED_RENDERER_WEBGL : gl.RENDERER));
  }

  dispose(): void {
    this.running = false;
    window.removeEventListener("resize", this.resize);
    this.pipeline.dispose();
    this.renderer.dispose();
    this.renderer.domElement.remove();
  }
}
