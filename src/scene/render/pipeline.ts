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

export type Quality = "high" | "low";

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

/** Pick a tier: `?quality=low|high` wins, otherwise phones and small CPUs get the low tier. */
export function detectQuality(): Quality {
  const asked = new URLSearchParams(window.location.search).get("quality");
  if (asked === "low" || asked === "high") return asked;
  const coarse = window.matchMedia("(pointer: coarse)").matches;
  const cores = navigator.hardwareConcurrency || 4;
  return coarse || cores <= 2 ? "low" : "high";
}

export class Pipeline {
  readonly composer: EffectComposer;
  private readonly ao: GTAOPass | null = null;
  private readonly smaa: SMAAPass | null = null;

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
    if (quality === "high") {
      this.smaa = new SMAAPass();
      this.composer.addPass(this.smaa);
    }
  }

  /** The adaptive step: drop ambient occlusion when frames stay slow. */
  degrade(): void {
    if (this.ao) this.ao.enabled = false;
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
    this.ao?.dispose();
    this.smaa?.dispose();
    this.composer.dispose();
  }
}
