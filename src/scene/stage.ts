// Renderer, sky, light rig and the frame loop.

import * as THREE from "three";

const SKY_VERT = /* glsl */ `
varying vec3 vDir;
void main() {
  vDir = normalize(position);
  gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
}`;

const SKY_FRAG = /* glsl */ `
varying vec3 vDir;
uniform vec3 top;
uniform vec3 horizon;
uniform vec3 glow;
uniform vec3 valley;
float hash(vec2 p) { return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453); }
float noise(vec2 p) {
  vec2 i = floor(p);
  vec2 f = fract(p);
  vec2 u = f * f * (3.0 - 2.0 * f);
  return mix(mix(hash(i), hash(i + vec2(1.0, 0.0)), u.x),
             mix(hash(i + vec2(0.0, 1.0)), hash(i + vec2(1.0, 1.0)), u.x), u.y);
}
void main() {
  vec3 d = normalize(vDir);
  vec3 sunDir = normalize(vec3(0.45, 0.07, -0.9));
  float sun = max(dot(d, sunDir), 0.0);
  // Painterly bands: the height is nudged by soft horizontal brush noise.
  float brush = noise(vec2(atan(d.z, d.x) * 3.0, d.y * 14.0)) - 0.5;
  float h = d.y + brush * 0.035;
  vec3 col = mix(horizon, top, smoothstep(0.02, 0.55, h));
  col = mix(col, valley, smoothstep(0.0, -0.35, h));
  // Warm low sun: a wide haze, a tighter bloom and a soft disc.
  col += glow * (pow(sun, 4.0) * 0.35 + pow(sun, 32.0) * 0.5);
  col = mix(col, vec3(1.0, 0.96, 0.86), smoothstep(0.9975, 0.9995, sun));
  gl_FragColor = vec4(col, 1.0);
}`;

export class Stage {
  readonly renderer: THREE.WebGLRenderer;
  readonly scene = new THREE.Scene();
  readonly camera = new THREE.PerspectiveCamera(40, 1, 0.1, 120);
  readonly key: THREE.DirectionalLight;
  private readonly clock = new THREE.Clock();
  private frame = 0;
  private running = false;
  private frozenAt: number | null = null;
  private waiters: { frame: number; done: () => void }[] = [];
  onFrame: (dt: number, time: number) => void = () => {};
  onFirstFrame: () => void = () => {};

  constructor(private readonly host: HTMLElement) {
    this.renderer = new THREE.WebGLRenderer({
      antialias: true,
      powerPreference: "high-performance",
    });
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    this.renderer.toneMapping = THREE.AgXToneMapping;
    this.renderer.toneMappingExposure = 1.15;
    this.renderer.shadowMap.enabled = true;
    this.renderer.shadowMap.type = THREE.PCFSoftShadowMap;
    this.renderer.domElement.className = "block h-full w-full touch-none";
    this.renderer.domElement.setAttribute("aria-hidden", "true");
    host.appendChild(this.renderer.domElement);

    const horizon = new THREE.Color("#d9d2bd");
    this.scene.background = horizon;
    this.scene.fog = new THREE.Fog(new THREE.Color("#c7cdc2"), 14, 62);
    const sky = new THREE.Mesh(
      new THREE.SphereGeometry(90, 24, 16),
      new THREE.ShaderMaterial({
        vertexShader: SKY_VERT,
        fragmentShader: SKY_FRAG,
        side: THREE.BackSide,
        depthWrite: false,
        fog: false,
        uniforms: {
          top: { value: new THREE.Color("#7894a0") },
          horizon: { value: horizon },
          glow: { value: new THREE.Color("#ffc98a") },
          valley: { value: new THREE.Color("#9fb1ae") },
        },
      }),
    );
    this.scene.add(sky);

    this.scene.add(new THREE.HemisphereLight("#dfe8ea", "#4a4432", 1.4));
    this.key = new THREE.DirectionalLight("#fff0da", 2.6);
    this.key.castShadow = true;
    this.key.shadow.mapSize.set(1024, 1024);
    const cam = this.key.shadow.camera;
    cam.left = -5;
    cam.right = 5;
    cam.top = 5;
    cam.bottom = -5;
    cam.near = 0.5;
    cam.far = 30;
    this.key.shadow.bias = -0.0006;
    this.key.shadow.normalBias = 0.03;
    this.key.shadow.radius = 4;
    this.scene.add(this.key, this.key.target);

    this.resize();
    window.addEventListener("resize", this.resize);
  }

  /** Keep the key light and its shadow box centred on what the camera is looking at. */
  aimLight(target: THREE.Vector3): void {
    this.key.position.copy(target).add(new THREE.Vector3(5, 9, 4));
    this.key.target.position.copy(target);
  }

  readonly resize = (): void => {
    const w = this.host.clientWidth || window.innerWidth;
    const h = this.host.clientHeight || window.innerHeight;
    this.renderer.setSize(w, h, false);
    this.camera.aspect = w / h;
    this.camera.fov = w / h < 0.75 ? 52 : 40;
    this.camera.updateProjectionMatrix();
  };

  start(): void {
    this.running = true;
    const tick = () => {
      if (!this.running) return;
      const raw = Math.min(this.clock.getDelta(), 0.1);
      const dt = this.frozenAt === null ? raw : 0;
      this.onFrame(dt, this.frozenAt ?? this.clock.elapsedTime);
      this.renderer.render(this.scene, this.camera);
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
    this.renderer.dispose();
    this.renderer.domElement.remove();
  }
}
