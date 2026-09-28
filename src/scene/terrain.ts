// Island terrain on three's standard material (so shadows, IBL and fog stay exact), adapted
// from ODD TIDE's terrain shader: triplanar scanned rock on the sides, regraded from the scan's
// ochre toward damp grey-brown stone, moss creeping in near the turf and in macro patches, and
// top-projected turf. A per-island `wetness` (rain present) darkens and glosses everything.
// Vertex colours carry baked occlusion (R), per-island variation (G) and nearness to the
// turf rim (B).

import * as THREE from "three";
import { assets } from "./assets";

export interface TerrainHandle {
  material: THREE.MeshStandardMaterial;
  wetness: { value: number };
}

export function terrainMaterial(seed: number): TerrainHandle {
  const { sets } = assets();
  const rock = sets.cliff_side;
  const moss = sets.mossy_rock;
  const turf = sets.grass_ground;
  const wetness = { value: 0 };
  const material = new THREE.MeshStandardMaterial({
    name: "terrain",
    roughness: 1,
    metalness: 0,
    vertexColors: true,
  });
  material.onBeforeCompile = (shader) => {
    Object.assign(shader.uniforms, {
      rockColour: { value: rock.colour },
      rockNormal: { value: rock.normal },
      rockArm: { value: rock.arm },
      mossColour: { value: moss.colour },
      mossNormal: { value: moss.normal },
      mossArm: { value: moss.arm },
      turfColour: { value: turf.colour },
      turfNormal: { value: turf.normal },
      turfArm: { value: turf.arm },
      wetness,
      terrainSeed: { value: seed * 0.173 },
    });
    shader.vertexShader = shader.vertexShader
      .replace(
        "#include <common>",
        `#include <common>
        varying vec3 vTerrainWorld;
        varying vec3 vTerrainNormal;`,
      )
      .replace(
        "#include <worldpos_vertex>",
        `#include <worldpos_vertex>
        vTerrainWorld = (modelMatrix * vec4(transformed, 1.0)).xyz;
        vTerrainNormal = normalize((vec4(transformedNormal, 0.0) * viewMatrix).xyz);`,
      );
    shader.fragmentShader = shader.fragmentShader
      .replace(
        "#include <common>",
        `#include <common>
        varying vec3 vTerrainWorld;
        varying vec3 vTerrainNormal;
        uniform sampler2D rockColour, rockNormal, rockArm;
        uniform sampler2D mossColour, mossNormal, mossArm;
        uniform sampler2D turfColour, turfNormal, turfArm;
        uniform float wetness;
        uniform float terrainSeed;
        float tHash(vec2 p) { return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453); }
        float tNoise(vec2 p) {
          vec2 i = floor(p), f = fract(p);
          f = f * f * (3.0 - 2.0 * f);
          return mix(mix(tHash(i), tHash(i + vec2(1.0, 0.0)), f.x), mix(tHash(i + vec2(0.0, 1.0)), tHash(i + 1.0), f.x), f.y);
        }
        vec3 triWeights(vec3 n) { vec3 w = pow(abs(n), vec3(4.0)); return w / (w.x + w.y + w.z); }
        vec4 tri(sampler2D t, vec3 p, vec3 w, float s) {
          return texture2D(t, p.zy * s) * w.x + texture2D(t, p.xz * s) * w.y + texture2D(t, p.xy * s) * w.z;
        }
        // Whiteout-blended triplanar normal for OpenGL-convention maps (after Ben Golus).
        vec3 triNormal(sampler2D t, vec3 p, vec3 n, vec3 w, float s) {
          vec3 nx = texture2D(t, p.zy * s).xyz * 2.0 - 1.0;
          vec3 ny = texture2D(t, p.xz * s).xyz * 2.0 - 1.0;
          vec3 nz = texture2D(t, p.xy * s).xyz * 2.0 - 1.0;
          nx = vec3(nx.xy + n.zy, abs(nx.z) * n.x);
          ny = vec3(ny.xy + n.xz, abs(ny.z) * n.y);
          nz = vec3(nz.xy + n.xy, abs(nz.z) * n.z);
          return normalize(nx.zyx * w.x + ny.xzy * w.y + nz.xyz * w.z);
        }
        vec3 topNormal(sampler2D t, vec2 uv, vec3 n) {
          vec3 m = texture2D(t, uv).xyz * 2.0 - 1.0;
          m = vec3(m.xy + n.xz, abs(m.z) * n.y);
          return normalize(m.xzy);
        }`,
      )
      .replace(
        "#include <map_fragment>",
        `vec3 P = vTerrainWorld;
        vec3 N = normalize(vTerrainNormal);
        vec3 W = triWeights(N);
        float macro = tNoise(P.xz * 0.9 + terrainSeed) * 0.6 + tNoise(P.xz * 3.1 + P.y) * 0.4;
        float bakedAo = vColor.r;
        float variation = vColor.g;

        // Rock: the cliff scan's strata, desaturated and cooled toward damp stone.
        vec3 rockAlbedo = tri(rockColour, P, W, 0.55).rgb;
        float rl = dot(rockAlbedo, vec3(0.2126, 0.7152, 0.0722));
        rockAlbedo = mix(vec3(rl), rockAlbedo, 0.45) * vec3(0.92, 0.9, 0.86) * mix(0.8, 1.05, variation);
        vec3 rockArmV = tri(rockArm, P, W, 0.55).rgb;
        // Moss near the rim and in patches, where water runs off the turf.
        float rim = vColor.b;
        float mossMask = smoothstep(0.45, 0.8, rim * 0.8 + macro * 0.5 + wetness * 0.15);
        vec3 mossAlbedo = tri(mossColour, P, W, 0.9).rgb * vec3(0.85, 1.0, 0.8);
        vec3 sideAlbedo = mix(rockAlbedo, mossAlbedo, mossMask);
        vec3 sideArm = mix(rockArmV, tri(mossArm, P, W, 0.9).rgb, mossMask);
        vec3 sideN = triNormal(rockNormal, P, N, W, 0.55);
        sideN = normalize(mix(sideN, triNormal(mossNormal, P, N, W, 0.9), mossMask));

        // Turf, top-projected, tinted toward the damp olive of the art direction.
        vec2 topUv = P.xz * 0.55;
        vec3 turfScan = mix(texture2D(turfColour, topUv).rgb, texture2D(turfColour, topUv * 0.23 + 0.37).rgb, 0.35);
        float tl = dot(turfScan, vec3(0.2126, 0.7152, 0.0722));
        // Living, rain-fed grass: more saturated than the scan's dry mix, toward moss green.
        vec3 turfAlbedo = mix(vec3(tl), turfScan, 1.7) * vec3(0.85, 1.2, 0.55) * 1.25 * mix(0.85, 1.15, macro);
        vec3 turfArmV = texture2D(turfArm, topUv).rgb;
        float turfMask = smoothstep(0.55, 0.8, N.y + (macro - 0.5) * 0.25);
        vec3 albedo = mix(sideAlbedo, turfAlbedo, turfMask);
        vec3 arm = mix(sideArm, turfArmV, turfMask);
        vec3 terrainN = normalize(mix(sideN, topNormal(turfNormal, topUv, N), turfMask));

        // Rain darkens and glosses stone and turf alike.
        albedo *= mix(1.0, 0.7, wetness);
        float terrainRoughness = mix(arm.g, arm.g * 0.55, wetness);
        float terrainAo = arm.r;
        diffuseColor.rgb = albedo;`,
      )
      .replace("#include <color_fragment>", "")
      .replace(
        "#include <roughnessmap_fragment>",
        "float roughnessFactor = clamp(terrainRoughness, 0.05, 1.0);",
      )
      .replace("#include <metalnessmap_fragment>", "float metalnessFactor = 0.0;")
      .replace(
        "#include <normal_fragment_maps>",
        "normal = normalize((viewMatrix * vec4(terrainN, 0.0)).xyz);",
      )
      .replace(
        "#include <aomap_fragment>",
        `float ambientOcclusion = bakedAo * mix(1.0, terrainAo, 0.8);
        reflectedLight.indirectDiffuse *= ambientOcclusion;
        #if defined( USE_ENVMAP ) && defined( STANDARD )
          float dotNVao = saturate(dot(geometryNormal, geometryViewDir));
          reflectedLight.indirectSpecular *= computeSpecularOcclusion(dotNVao, ambientOcclusion, material.roughness);
        #endif`,
      );
  };
  material.customProgramCacheKey = () => "borrowed-weather-terrain-v1";
  return { material, wetness };
}
