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
void main() {
  float h = clamp(vDir.y * 0.5 + 0.5, 0.0, 1.0);
  vec3 col = mix(horizon, top, smoothstep(0.45, 0.95, h));
  float sun = pow(max(dot(vDir, normalize(vec3(0.5, 0.25, -0.8))), 0.0), 6.0);
  col += glow * sun * 0.5;
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

    const horizon = new THREE.Color("#c9cbbf");
    this.scene.background = horizon;
    this.scene.fog = new THREE.Fog(horizon, 16, 48);
    const sky = new THREE.Mesh(
      new THREE.SphereGeometry(90, 24, 16),
      new THREE.ShaderMaterial({
        vertexShader: SKY_VERT,
        fragmentShader: SKY_FRAG,
        side: THREE.BackSide,
        depthWrite: false,
        fog: false,
        uniforms: {
          top: { value: new THREE.Color("#7f97a0") },
          horizon: { value: horizon },
          glow: { value: new THREE.Color("#ffd8a8") },
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
      const dt = Math.min(this.clock.getDelta(), 0.1);
      this.onFrame(dt, this.clock.elapsedTime);
      this.renderer.render(this.scene, this.camera);
      if (this.frame++ === 0) this.onFirstFrame();
      requestAnimationFrame(tick);
    };
    requestAnimationFrame(tick);
  }

  dispose(): void {
    this.running = false;
    window.removeEventListener("resize", this.resize);
    this.renderer.dispose();
    this.renderer.domElement.remove();
  }
}
