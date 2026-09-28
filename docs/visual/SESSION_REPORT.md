# Fidelity pass: session report

Branch `cloud-v1`. The evidence is in `docs/visual/captures/baseline/`, `docs/visual/captures/after/` and `docs/visual/AUDIT.md`, and every sourced file is recorded in `assets.manifest.json`.

## Scores (1–5, see AUDIT.md)

| Bookmark | Before | After |
| --- | --- | --- |
| establishing | 2.1 | 2.9 |
| hero | 2.4 | 3.0 |
| closeup | 1.6 | 2.9 |
| grazing | 1.8 | 2.6 |
| phone-hero | 2.4 | 3.0 |

This is "competent indie" throughout, but not the premium (4) the directive aims for. The audit lists the three most visible remaining flaws per bookmark.

## Assets

- **15.1 MB shipped in total** (budget about 25 MB). That includes:
  - the 5.2 MB sky HDRI (2K);
  - 4.3 MB of 1K WebP texture sets;
  - 4.1 MB of meshopt models and foliage;
  - 1.3 MB of audio.
- **Sources:** all CC0 from Poly Haven. The HDRI is Table Mountain 1 (Pure Sky). The texture sets are cliff side, mossy rock, grass ground, river small rocks, weathered planks and bark brown 02. The models are rock moss sets 01/02 and boulder 01. `grass_medium_02` and `fern_02` were copied from ODD TIDE with their provenance carried over.
- **Records:** each file has its source URL, author, licence, date, original and output sha256, and processing steps in `assets.manifest.json`. The credits are in the README.

## What changed

- **Evidence tooling.** A `window.__VISUAL_TEST__` hook (dev and `?e2e` builds only): `ready`, `setBookmark`, `freeze`, `settle`, plus `pause`, `frameTime` and `lighting`. There are five camera bookmarks in `src/scene/layout.ts`, and `tools/visual/capture.mjs` captures them from the production build.
- **One lighting model.** The HDRI is the background and the PMREM environment. Its sun is measured from the image, removed from the IBL copy and handed to the key light. One quaternion orients the whole sky. AgX runs once in `OutputPass`, and exposure is the only brightness control. The hemisphere light and the old sky shader are gone.
- **Rendering.**
  - Post chain adapted from ODD TIDE: half-float MSAA target, GTAO (skipping transparent effects and the duplicate shadow pass), HDR-thresholded bloom, SMAA, then OutputPass.
  - Fitted, texel-snapped shadows.
  - Aerial perspective patched into three's fog chunks.
  - A lit cloud floor.
  - A low tier (touch devices, 2 or fewer cores, or `?quality=low`) without AO, bloom or SMAA, with 35% of the foliage and a 1.5 pixel-ratio cap.
- **Materials.**
  - A triplanar terrain shader adapted from ODD TIDE on smooth lathed islands, with rain-driven wetness.
  - Scanned rocks and boulders with jittered tint and scale, seated in the ground.
  - Planks and bark on all joinery.
  - A physical transmission water surface over pebble beds.
- **Detail.** Instanced grass clumps and ferns (alpha-to-coverage, wind) and procedural wildflowers, all with scale, rotation and tone jitter.
- **README media.** `desktop.png`, `phone.png` and `preview.gif` are being re-rendered from the new build (the GIF with disposal "none"); they land in the next commit.
- **Checks.** `bun run check` is green (20 tests). The Playwright end-to-end walk passes, taking 1.4 min in SwiftShader (up from 14 s) because every frame now costs more there.

## What I could not do, and caveats

- **No real-GPU measurement.** Every capture and timing is SwiftShader: several seconds per high-tier frame at 1440 × 900 and about one second per low-tier frame at 400 × 300. The 60 fps budget on a mid laptop and phone smoothness are unverified and need checking on hardware. The most likely costs are GTAO plus the transmission pass on the high tier, and roughly 1,000 grass clumps of 550–1,300 triangles.
- **The sky is fixed.** The directive asks for an environment refreshed when the weather changes. In this game weather is a local pocket carried in a jar, not the sky's state, so the HDRI environment stays fixed and each island's rain instead drives its terrain wetness.
- **Sun elevation.** The HDRI's 13° sun is lifted to 32° by orientation, so the flat island tops get modelling light. That tilts the HDRI's zenith into view, visible as a darker band at the top of the establishing shot.
- **Primitives remain:** the hiker and the sheep, which are stylised on purpose, plus the lantern garland, instruments and jar. I found no CC0 character that fits the hand-made style, and did not want to introduce one that clashes.
- **Grass density** is limited by the scan's triangle count. At gameplay distance the turf reads as texture rather than blades. Custom card tufts (as ODD TIDE builds for turf) would be the next step.
- **No KTX2.** Textures ship as WebP rather than KTX2 because no Basis encoder is available here. They are 1K, and 4.3 MB in total.
- **Access.** Cloning `WilliamHenryKing/01-odd-tide` succeeded after adding it to this session with read access (commit 924febb). It was used as reference and for two foliage models only. No runtime imports cross repositories.
