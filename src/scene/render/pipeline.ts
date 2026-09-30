// Post-processing chain, adapted from ODD TIDE's pipeline: scene into a half-float MSAA target,
// ground-truth ambient occlusion, bloom only on energy above an HDR threshold (lanterns, the
// sun's glint), SMAA, then tone mapping and the sRGB transfer exactly once in OutputPass.

import * as THREE from "three";
import { EffectComposer } from "three/addons/postprocessing/EffectComposer.js";
import { GTAOPass } from "three/addons/postprocessing/GTAOPass.js";
import { OutputPass } from "three/addons/postprocessing/OutputPass.js";
import { RenderPass } from "three/addons/postprocessing/RenderPass.js";
import { ShaderPass } from "three/addons/postprocessing/ShaderPass.js";
import { SMAAPass } from "three/addons/postprocessing/SMAAPass.js";
import { UnrealBloomPass } from "three/addons/postprocessing/UnrealBloomPass.js";

export type Quality = "high" | "medium" | "low";

/**
 * Zeroes NaN and infinity (all exponent bits set: immune to fast-math) and caps HDR values
 * before bloom. Some GPUs (Apple's) make NaN where others quietly don't, and bloom's blur
 * would spread one bad pixel over the whole frame.
 */
const FiniteShader = {
  name: "FiniteShader",
  uniforms: { tDiffuse: { value: null } },
  vertexShader: /* glsl */ `
    varying vec2 vUv;
    void main() { vUv = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }`,
  fragmentShader: /* glsl */ `
    uniform sampler2D tDiffuse;
    varying vec2 vUv;
    float finite(float x) {
      return (floatBitsToUint(x) & 0x7f800000u) == 0x7f800000u ? 0.0 : clamp(x, 0.0, 16384.0);
    }
    void main() {
      vec4 c = texture2D(tDiffuse, vUv);
      gl_FragColor = vec4(finite(c.r), finite(c.g), finite(c.b), 1.0);
    }`,
};

/** A restrained linear-light grade before tone mapping: a little saturation, a soft vignette. */
const GradeShader = {
  name: "BorrowedWeatherGrade",
  uniforms: { tDiffuse: { value: null }, saturation: { value: 1.18 }, vignette: { value: 0.16 } },
  vertexShader: /* glsl */ `
    varying vec2 vUv;
    void main() { vUv = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }`,
  fragmentShader: /* glsl */ `
    uniform sampler2D tDiffuse;
    uniform float saturation;
    uniform float vignette;
    varying vec2 vUv;
    void main() {
      vec4 texel = texture2D(tDiffuse, vUv);
      float l = dot(texel.rgb, vec3(0.2126, 0.7152, 0.0722));
      vec3 c = max(mix(vec3(l), texel.rgb, saturation), 0.0);
      c *= 1.0 - vignette * smoothstep(0.35, 0.95, length(vUv - 0.5) * 1.4);
      gl_FragColor = vec4(c, texel.a);
    }`,
};

type VisibilityPatched = { _overrideVisibility(): void; _visibilityCache: THREE.Object3D[] };

/**
 * Pick a tier: `?quality=low|medium|high` wins; phones and small CPUs get the low tier;
 * otherwise the GPU's name decides: discrete and recent Apple GPUs high, integrated medium
 * (no ambient occlusion or multisampling). The stage's governor corrects the guess in play.
 */
export function detectQuality(): Quality {
  const asked = new URLSearchParams(window.location.search).get("quality");
  if (asked === "low" || asked === "medium" || asked === "high") return asked;
  const coarse = window.matchMedia("(pointer: coarse)").matches;
  const cores = navigator.hardwareConcurrency || 4;
  if (coarse || cores <= 2) return "low";
  let gpu = "";
  try {
    const gl = document.createElement("canvas").getContext("webgl2");
    if (gl) {
      const ext = gl.getExtension("WEBGL_debug_renderer_info");
      gpu = String(
        ext ? gl.getParameter(ext.UNMASKED_RENDERER_WEBGL) : gl.getParameter(gl.RENDERER),
      );
      gl.getExtension("WEBGL_lose_context")?.loseContext();
    }
  } catch {
    return "low";
  }
  if (/swiftshader|llvmpipe|software|basic render/i.test(gpu)) return "low";
  if (/nvidia|geforce|rtx|gtx|radeon (rx|pro)|amd radeon rx|apple m[2-9]/i.test(gpu)) return "high";
  return "medium";
}

export class Pipeline {
  readonly composer: EffectComposer;
  private readonly ao: GTAOPass | null = null;

  constructor(
    readonly renderer: THREE.WebGLRenderer,
    scene: THREE.Scene,
    camera: THREE.PerspectiveCamera,
    readonly quality: Quality,
    /** Objects the AO G-buffer must ignore: water, fog sheets, sprites and other effects. */
    aoHidden: () => THREE.Object3D[],
  ) {
    const target = new THREE.WebGLRenderTarget(1, 1, {
      type: THREE.HalfFloatType,
      samples: quality === "high" ? 4 : 0,
    });
    const glare = quality !== "low";
    this.composer = new EffectComposer(renderer, target);
    this.composer.addPass(new RenderPass(scene, camera));
    if (quality === "high") {
      const ao = new GTAOPass(scene, camera, 1, 1);
      ao.blendIntensity = 0.9;
      // GTAO's pre-pass is a full render; the scene pass has already drawn the shadow maps.
      const aoRender = ao.render.bind(ao);
      ao.render = ((...args: Parameters<GTAOPass["render"]>) => {
        const shadows = renderer.shadowMap;
        const auto = shadows.autoUpdate;
        shadows.autoUpdate = false;
        try {
          aoRender(...args);
        } finally {
          shadows.autoUpdate = auto;
        }
      }) as GTAOPass["render"];
      ao.updateGtaoMaterial({
        radius: 0.35,
        distanceExponent: 1.6,
        thickness: 0.6,
        scale: 1,
        samples: 12,
      });
      ao.updatePdMaterial({
        lumaPhi: 10,
        depthPhi: 2,
        normalPhi: 3,
        radius: 5,
        rings: 2,
        samples: 12,
      });
      const patched = ao as unknown as VisibilityPatched;
      const original = patched._overrideVisibility.bind(ao);
      patched._overrideVisibility = () => {
        original();
        for (const object of aoHidden())
          if (object.visible) {
            object.visible = false;
            patched._visibilityCache.push(object);
          }
      };
      this.composer.addPass(ao);
      this.ao = ao;
    }
    this.composer.addPass(new ShaderPass(FiniteShader));
    if (glare) {
      // Bloom as lens glare: only light above the threshold contributes, clamped so a bright
      // lamp cannot flood the frame.
      const bloom = new UnrealBloomPass(new THREE.Vector2(1, 1), 0.16, 0.2, 2.2);
      const high = bloom.materialHighPassFilter;
      high.fragmentShader = high.fragmentShader.replace(
        "gl_FragColor = mix( outputColor, texel, alpha );",
        `vec3 above = texel.rgb * (max(v - luminosityThreshold, 0.0) / max(v, 1e-4));
        above *= min(1.0, 8.0 / max(luminance(above), 1e-4));
        gl_FragColor = vec4(above, 1.0);`,
      );
      high.needsUpdate = true;
      this.composer.addPass(bloom);
    }
    this.composer.addPass(new ShaderPass(GradeShader));
    this.composer.addPass(new OutputPass());
    if (glare) {
      this.composer.addPass(new SMAAPass());
    }
  }

  /**
   * One adaptive step when frames stay slow: ambient occlusion first, then multisampling (SMAA
   * still smooths edges). False when neither is left.
   */
  degrade(): boolean {
    if (this.ao?.enabled) {
      this.ao.enabled = false;
      return true;
    }
    const targets = [this.composer.renderTarget1, this.composer.renderTarget2];
    if (targets.some((t) => t.samples > 0)) {
      for (const t of targets) {
        t.samples = 0;
        t.dispose();
      }
      return true;
    }
    return false;
  }

  /** Where the adaptive steps have got to, for evidence and tests. */
  get state() {
    return {
      quality: this.quality,
      ao: this.ao?.enabled ?? false,
      msaa: this.composer.renderTarget1.samples,
    };
  }

  setSize(width: number, height: number, pixelRatio: number): void {
    this.composer.setPixelRatio(pixelRatio);
    this.composer.setSize(width, height);
    this.ao?.setSize(width * pixelRatio, height * pixelRatio);
  }

  render(): void {
    this.composer.render();
  }

  dispose(): void {
    for (const pass of this.composer.passes) {
      // These materials are omitted by the pinned Three.js 0.186 pass disposers.
      if (pass instanceof GTAOPass) {
        pass.gtaoMaterial.dispose();
        pass.blendMaterial.dispose();
      }
      if (pass instanceof UnrealBloomPass) pass.materialHighPassFilter.dispose();
      pass.dispose();
    }
    this.composer.dispose();
  }
}
