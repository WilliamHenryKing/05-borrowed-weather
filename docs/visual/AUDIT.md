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

## After the fidelity pass (`docs/visual/captures/after/`)

Same bookmarks, same build flags and the same SwiftShader renderer. Desktop bookmarks ran on the high tier (GTAO, bloom, SMAA). `phone-hero` emulates a touch device, so it ran on the low tier.

| Criterion | establishing | hero | closeup | grazing | phone-hero |
| --- | --- | --- | --- | --- | --- |
| Light plausibility | 3 | 3 | 3 | 3 | 3 |
| Materials | 3 | 3 | 3 | 3 | 3 |
| Detail density | 3 | 3 | 3 | 3 | 3 |
| Environment integration | 3 | 3 | 3 | 2 | 3 |
| Atmosphere and depth | 3 | 3 | 3 | 3 | 3 |
| Composition | 3 | 3 | 2 | 2 | 3 |
| Artefacts | 2 | 3 | 3 | 2 | 3 |
| Motion and UI integration | 3 | 3 | 3 | 3 | 3 |
| **Overall** | **2.9** | **3.0** | **2.9** | **2.6** | **3.0** |

Before → after: establishing 2.1 → 2.9, hero 2.4 → 3.0, closeup 1.6 → 2.9, grazing 1.8 → 2.6, phone-hero 2.4 → 3.0. The pass reaches "competent indie" across the board. It is not yet the premium studio web piece (4).

### What changed

- **One lighting model.** The CC0 HDRI is background and PMREM environment. Its measured sun (direction, illuminance, colour) drives the key light and is clamped out of the IBL copy. One quaternion orients the sky. AgX runs once in `OutputPass`, and exposure is the only brightness control.
- **Post chain.** `RenderPass` → `GTAOPass` → `UnrealBloomPass` (HDR threshold) → `OutputPass` → `SMAAPass` on the high tier. The low tier keeps only the render and output passes.
- **Aerial perspective.** Exponential extinction over true distance, thinning with height and tinted with the sky's horizon radiance. A lit cloud floor hides the HDRI's lower hemisphere.
- **Islands.** Smooth lathed masses with a triplanar terrain shader: scanned cliff strata regraded toward damp grey, moss at the rim, saturated turf, baked occlusion. Rain darkens and glosses them.
- **Scanned CC0 rocks** for walls, cairns, banks and stepping stones, and boulders for the ledge and cliff. Planks and bark for all joinery, masonry and a turf roof on the shelter.
- **Instanced grass clumps and ferns** with alpha-to-coverage and wind, plus procedural wildflowers, all jittered in scale, rotation and tone.
- **Water.** A transmission surface (refraction of a pebble bed, reflection of the sky) with a tileable ripple normal map, under the foam and rain-ring overlay.
- **Shadows.** Fitted and texel-snapped, following the focused diorama.

### Three most visible remaining flaws per bookmark

**establishing**
1. The sky above the cloud floor darkens abruptly toward the top right. Raising the HDRI's 13° sun to 32° tilts its zenith into view, and the cloud-floor horizon is a hard straight line.
2. Far islands read as pale, flat shapes: the haze lifts them to nearly the horizon colour with no silhouette detail.
3. The effect-driven fog banks and cloud step read as white discs from this height.

**hero**
1. Grass clumps are too small to read at gameplay distance, so the turf looks like a texture rather than a meadow.
2. The fog bank still covers most of the island top, hiding the new materials under a flat white layer.
3. The hiker is still a stylised primitive (capsule, sphere head) beside scanned surroundings.

**closeup**
1. The hiker and sheep are untextured primitives, the least consistent element at arm's length.
2. The log's end cap is a flat disc without end-grain.
3. Flowers are simple five-petal fans. They are fine in motion but read as cut-outs when still.

**grazing**
1. The beck surface reads bright white. At grazing angles the transmission surface reflects the bright horizon, and the fog volume sits over it.
2. Stepping stones sit in a flat band of fog with a visible upper edge where the fog sheets meet.
3. The rock scans are lit well, but the turf in front has no blade silhouettes at this angle.

**phone-hero** (low tier)
1. Without GTAO, contact between rocks, posts and turf is soft; things sit less firmly.
2. The HUD's location card covers a large share of the upper frame at 390 px.
3. The same large fog bank as the desktop hero dominates the island.

### Budget

- 15.1 MB of shipped assets in total, including 1.3 MB of audio (see `assets.manifest.json`). Textures are 1K WebP; models use meshopt.
- In SwiftShader a high-tier frame at 1440 × 900 takes several seconds, and the low tier about one second at 400 × 300. SwiftShader is a CPU rasteriser, so these numbers say nothing about real GPUs. Real-hardware frame rates have not been measured in this environment.

## Round 2: warmth, contrast and a natural beck (`docs/visual/captures/round2/`)

Review on a real GPU (RTX 2060) found the first pass washed-out grey, with the golden light gone and the islands not separating from the cloud sea. Changes:
- The HDRI keeps its own low, warm sun (about 13°) and is only turned about the vertical, so light rakes in from the camera's right.
- Aerial perspective starts beyond ~12 units.
- Rock keeps the scan's ochre.
- The cloud sea is cooler and less reflective.
- A restrained linear grade (saturation 1.18, soft vignette) sits before OutputPass.
- The beck and tarn are carved into the turf with damp margins and bank stones.

### Target luminance relationships

Values are display luma (Rec. 709 weights on the final sRGB frame, 0–1) and HSV-style saturation, measured by region on the captures:

| Surface | Target luma | Target saturation | Round 2 measured |
| --- | --- | --- | --- |
| Sunlit turf (hero, phone) | 0.30–0.60 | ≥ 0.40 | 0.34–0.60 luma, 0.45–0.63 sat |
| Sunlit rock sides | 0.30–0.45 | ≥ 0.40 | 0.36 luma, 0.53 sat |
| Cloud sea | 0.65–0.80, never clipped | ≤ 0.10 (cool, near neutral) | 0.65–0.77 luma, 0.04–0.05 sat |
| Fog banks and cloud step | ≤ 0.90 | ≈ 0 | 0.86 luma |
| Sky near horizon | 0.70–0.85 | ≤ 0.15 | 0.78 luma, 0.06 sat |

Rules that keep the islands popping:
1. Any island surface in the play area sits at least 0.15 luma below the cloud sea behind it, or carries at least 5× its saturation. Warm, saturated land against cool, near-neutral cloud separates by chroma even where values meet.
2. Haze never lifts play-area surfaces: aerial perspective only acts beyond ~12 units.
3. Only fog, cloud and glints go above 0.85. Nothing is clipped to white except the sun's specular glints.

### Scores (1–5)

| Bookmark | Baseline | Pass 1 | Round 2 |
| --- | --- | --- | --- |
| establishing | 2.1 | 2.9 | 3.2 |
| hero | 2.4 | 3.0 | 3.4 |
| closeup | 1.6 | 2.9 | 3.1 |
| grazing | 1.8 | 2.6 | 3.0 |
| phone-hero | 2.4 | 3.0 | 3.3 |

Round 2 moves light plausibility, atmosphere and composition up by about a point in the hero and phone views: warm key, readable separation, crisp play area. The beck reads as a cut channel with sloping banks and a damp margin rather than a trough.

### Remaining flaws (round 2)
- **establishing:** far islands are still pale, simple shapes; fog banks read as white discs from above; the cloud sea's texture repeats faintly at the horizon.
- **hero:** the fog bank covers the new beck until it is bottled; the hiker is a stylised primitive; grass clumps are small against the turf at this distance.
- **closeup:** hiker and sheep are primitives; the log's end is a flat disc; flower heads are simple fans.
- **grazing:** the water surface under fog reads bright; there is a visible band where the fog sheets meet the bank; the stepping stones sink into fog.
- **phone-hero** (low tier): no GTAO, so contact is soft; the HUD card covers the upper frame; small specular sparkles on grass tips at the fog edge.

### Performance (real GPU figures from the review; SwiftShader here is not representative)
- The high tier ran at about 76 fps on an RTX 2060 and the phone tier at about 130 before round 2. Round 2 adds an adaptive step: if the smoothed frame time stays over 16.7 ms for about 2 s, GTAO is dropped and the water switches from the transmission pass to a cheap tinted surface. The step is one-way.
- Arrival: only the 1K sky (1.4 MB), the three terrain sets and the rock scans block the veil. The 2K sky, wood and pebble sets and the foliage scans stream in afterwards. The review measured the loader at 5.7 s desktop and 2.6 s phone; this should now be shorter, but it has not been re-measured on real hardware.
