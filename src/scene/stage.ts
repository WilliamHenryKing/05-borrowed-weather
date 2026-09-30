// Renderer, sky, light rig and the frame loop. One lighting model: the HDRI sky lights the
// scene through PMREM, the key light is that sky's own sun, AgX runs once in OutputPass, and
// exposure is the only brightness control.

import * as THREE from "three";
import type { Assets } from "./assets";
import { Pipeline, type Quality } from "./render/pipeline";
import { installSky, type SkyLight } from "./render/sky";

/** Exposure: the single brightness control. */
const EXPOSURE = 2.6;
/**
 * Sun placement for the composition: the HDRI's own warm, low sun (about 13°), turned to rake
 * in from the camera's right so the faces we look at catch golden light and shadows fall long.
 */
const SUN_AZIMUTH = Math.atan2(0.35, 0.9);
/** Metres the key light's shadow box spans around the focused diorama. */
const SHADOW_HALF = 3.4;
/** Drawing-buffer pixels each tier may use (full density up to about 2560 × 1440 on high). */
const PIXEL_BUDGET: Record<Quality, number> = { high: 3.7e6, medium: 2.1e6, low: 1.2e6 };
const MAX_RATIO: Record<Quality, number> = { high: 2, medium: 1.5, low: 1.5 };

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
    // Clear air around the play area; extinction builds only beyond ~12 units.
    float fogFactor = 1.0 - exp( -fogDensity * max( vFogDepth - 12.0, 0.0 ) * fogThin );
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
  /** Adaptive steps: seconds the smoothed frame time has stayed over budget, and whether spent. */
  private slowFor = 0;
  private frameAvg = 1 / 60;
  private degraded = false;
  private waterCheap = false;
  /** Resolution scale the governor may lower (to 0.6), on top of the pixel budget. */
  private renderScale = 1;
  adaptive = true;
  onDegrade: () => void = () => {};
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
    this.renderer.shadowMap.type = THREE.PCFShadowMap;
    this.renderer.domElement.className = "block h-full w-full touch-none";
    this.renderer.domElement.setAttribute("aria-hidden", "true");
    host.appendChild(this.renderer.domElement);

    this.sky = installSky(this.renderer, this.scene, assets.sky, SUN_AZIMUTH);
    this.scene.fog = new THREE.FogExp2(this.sky.horizon.clone(), 0.006);

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
    // Within the tier's pixel budget (a high-density screen need not draw every device pixel).
    const budget = Math.sqrt(PIXEL_BUDGET[this.quality] / Math.max(1, w * h));
    const ratio =
      Math.min(window.devicePixelRatio || 1, MAX_RATIO[this.quality], budget) * this.renderScale;
    this.renderer.setPixelRatio(ratio);
    this.renderer.setSize(w, h, false);
    this.pipeline.setSize(w, h, ratio);
    this.camera.aspect = w / h;
    this.camera.fov = w / h < 0.75 ? 52 : 40;
    this.camera.updateProjectionMatrix();
  };

  /**
   * Compile every shader before the first frame: in parallel where the browser allows
   * (KHR_parallel_shader_compile), for the HDR target the scene pass draws into (whose programs
   * differ from on-screen ones); then draw everything once with culling off, so the driver
   * finishes each program for the layouts and passes it will meet (ANGLE builds its D3D shaders
   * at the first draw). All behind the arrival veil.
   */
  async precompile(): Promise<void> {
    const r = this.renderer;
    const composer = this.pipeline.composer;
    const previous = r.getRenderTarget();
    r.setRenderTarget(composer.readBuffer);
    const compiling = r.compileAsync(this.scene, this.camera);
    r.setRenderTarget(previous);
    await compiling;
    const culled: THREE.Object3D[] = [];
    this.scene.traverse((o) => {
      if (o.frustumCulled) {
        o.frustumCulled = false;
        culled.push(o);
      }
    });
    this.pipeline.render();
    for (const o of culled) o.frustumCulled = true;
  }

  /**
   * Things that join the scene in play (streamed foliage) stay hidden until their shaders are
   * compiled in parallel, so their arrival never stalls a frame.
   */
  async reveal(objects: THREE.Object3D[]): Promise<void> {
    for (const o of objects) o.visible = false;
    const r = this.renderer;
    const previous = r.getRenderTarget();
    r.setRenderTarget(this.pipeline.composer.readBuffer);
    const compiling = Promise.all(objects.map((o) => r.compileAsync(o, this.camera, this.scene)));
    r.setRenderTarget(previous);
    await compiling;
    for (const o of objects) o.visible = true;
  }

  start(): void {
    this.running = true;
    const tick = () => {
      if (!this.running) return;
      if (this.paused) {
        requestAnimationFrame(tick);
        return;
      }
      const raw = Math.min(this.clock.getDelta(), 0.1);
      this.watchFrameTime(raw);
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

  /**
   * Whenever frames stay over 16.7 ms for about two seconds, take one step lighter: GTAO and the
   * water's transmission pass, then multisampling, then resolution in tenths down to 60 %
   * (never back up, so it cannot oscillate).
   */
  private watchFrameTime(raw: number): void {
    if (!this.adaptive || this.degraded || this.frame < 30) return;
    this.frameAvg += (raw - this.frameAvg) * 0.1;
    this.slowFor = this.frameAvg > 1 / 59 ? this.slowFor + raw : 0;
    if (this.slowFor < 2) return;
    this.slowFor = 0;
    this.frameAvg = 1 / 60;
    if (!this.degrade()) this.degraded = true;
  }

  /** One governor step down (false when nothing is left). */
  degrade(): boolean {
    if (!this.waterCheap) {
      this.waterCheap = true;
      this.pipeline.degrade();
      this.onDegrade();
      return true;
    }
    if (this.pipeline.degrade()) return true;
    if (this.renderScale > 0.65) {
      this.renderScale = Math.max(0.6, this.renderScale - 0.1);
      this.resize();
      return true;
    }
    return false;
  }

  /** Where the governor has got to, for evidence and tests. */
  get qualityState() {
    return {
      ...this.pipeline.state,
      pixelRatio: +this.renderer.getPixelRatio().toFixed(3),
      renderScale: +this.renderScale.toFixed(2),
    };
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
