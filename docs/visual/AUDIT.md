# Visual audit: Borrowed Weather

Captures come from `tools/visual/capture.mjs`, run against the production build (`?e2e` enables the `window.__VISUAL_TEST__` hook) in headless Chromium on SwiftShader:

`ANGLE (Google, Vulkan 1.3.0 (SwiftShader Device (Subzero) (0x0000C0DE)), SwiftShader driver)`

The bookmarks are defined in `src/scene/layout.ts`: `establishing`, `hero`, `closeup`, `grazing` (all 1440 × 900) and `phone-hero` (390 × 844 at 2×). Scene time is frozen before each capture.

The scale is 1 placeholder, 2 tech demo, 3 competent indie, 4 premium studio web piece, 5 reference.

## Baseline (`docs/visual/captures/baseline/`)

| Criterion | establishing | hero | closeup | grazing | phone-hero |
| --- | --- | --- | --- | --- | --- |
| Light plausibility | 2 | 2 | 2 | 2 | 2 |
| Materials | 1 | 2 | 1 | 1 | 2 |
| Detail density | 2 | 2 | 1 | 1 | 2 |
| Environment integration | 2 | 2 | 2 | 2 | 2 |
| Atmosphere and depth | 2 | 3 | 2 | 2 | 3 |
| Composition | 3 | 3 | 2 | 2 | 3 |
| Artefacts | 2 | 2 | 1 | 2 | 2 |
| Motion and UI integration | 3 | 3 | 2 | 2 | 3 |
| **Overall** | **2.1** | **2.4** | **1.6** | **1.8** | **2.4** |

What the baseline shows:

- **Lighting.** A hemisphere fill and a hand-tuned sun light a sky that is only a shader. Nothing in the scene reflects that sky, so metal, glass and water look pasted on. There is no ambient occlusion: sheep, stones and logs float on the turf without contact darkening.
- **Materials.** Everything is vertex colour on flat-shaded, low-poly geometry. The island sides are faceted brown cylinders, the stepping stones and cairns are faceted icosahedra, and the turf is one flat green. There are no normal or roughness maps anywhere.
- **Detail.** "Grass" is scattered cones that read as spikes at arm's length. The flowers are floating icosahedra. At the close-up the log, the jar and the hiker are bare primitives.
- **Environment.** The distant islands read as pale inverted triangles pasted on the sky. Linear depth fog makes a flat wall rather than aerial perspective.
- **Water.** The shader has ripples, foam and a sheen, but no reflection of the environment and no refraction of the bed. The beck is a lit rectangle with a hard edge.
- **Artefacts.** Aliasing on grass and thin rails. Shadow acne on the faceted islands.

## Ranked fix list

1. **One lighting model.** Use a CC0 sky HDRI as background and PMREM environment, a sun aligned to the HDRI's sun, AgX applied once through `OutputPass`, and exposure as the only brightness control. Remove the hemisphere light.
2. **Real island materials.** Use smooth (indexed) geometry with UVs, scanned CC0 rock and soil on the sides and CC0 turf on top, with macro colour variation to break tiling and moss where rain falls.
3. **Scanned rocks** for the stepping stones, cairns, wall and ledge, instanced with scale, rotation and hue jitter, and seated into the ground.
4. **Dense grass and flowers**: instanced, curved, tapered blades with alpha-tested tips, swaying in a wind shader. Stems and petals for the flowers, all jittered.
5. **Water with reflection and refraction**: a physical transmission material with an animated normal map, a visible stream bed, and a foam shoreline overlay.
6. **Post chain**: `RenderPass` → `GTAOPass` → `UnrealBloomPass` (HDR threshold, only lanterns glow) → `SMAAPass` → `OutputPass`, with a lower tier for phones.
7. **Aerial perspective**: exponential, height-aware haze tinted from the sky, and distant islands built like the near ones so they soften instead of floating as triangles.
8. **Texel-snapped, fitted shadows** that follow the focused diorama without shimmering.
