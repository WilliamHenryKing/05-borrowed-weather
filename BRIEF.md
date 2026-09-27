# BORROWED WEATHER — v1 brief for a cloud build session

You are building this project's v1 in one focused session. Ship a small, polished, complete experience — not a prototype and not a sprawling one. Read this brief once, write a plan of 5–10 lines, then build. Stop when the definition of done is met.

## The idea

**05 — BORROWED WEATHER.** Develop approximately six connected trail dioramas around one jar and three weather types: fog, rain and wind. Taking weather changes the source; releasing it changes the destination. Design fair, reversible puzzles that exploit both consequences, a field notebook and a lantern-shelter destination. Begin by making one two-location puzzle understandable and satisfying. The final journey must contain actual exploration and reasoning.

### G2. BORROWED WEATHER

**A cosy hiking puzzle adventure with a jar full of weather.**

You walk a small mountain trail carrying one glass jar. It can hold a pocket of fog, a little rain or a gust of wind. Taking weather from one place changes that place; releasing it changes somewhere else.

**What you do:** observe the trail, borrow one kind of weather, carry it to a useful location and release it. The jar can hold only one type at a time, so order matters.

**First playable moment:** a bank of fog hides a crossing. Bottle it and the path becomes visible. Further along, release the fog at a marked hollow where it gathers into a temporary cloud step. The same thing that obscured the path now helps you cross it.

Later, wind moves a leaf ferry and rain wakes a line of curled fern fronds into stepping places. Keep the fictional rules consistent and visible. This is gentle weather magic, not realistic hiking advice.

**Depth:** borrowing has two consequences: what becomes possible at the destination and what stops working at the source. A wind-powered lift pauses when its breeze is in your jar. You need to find an order that gets you and your weather through the route.

**Atmosphere:** wet stone, wool, moss, bent grass, condensation on the jar and tiny sheltered places. Sit on a log, open a field notebook and record a discovery. Those quiet moments should support the adventure, not replace its puzzles.

**Ending:** reach a small lantern shelter above the clouds and restore its weather instruments. The completed notebook becomes a postcard of the route you took.

**Small complete version:** six connected trail dioramas, three weather types, a single jar and one destination. Reversible actions, useful hints and no punitive timer.

**What would ruin it:** collecting arbitrary coloured keys, obscure combinations, long empty walking, or weather effects that obscure all the interaction cues.

**First proof:** borrow fog, reveal a crossing, release it to make a second route and reach a small payoff. The two-location consequence must be understandable without a page of instructions.

Art direction: **BORROWED WEATHER:** richly textured nature, damp stone, condensation, atmospheric depth and intimate trail shelters.

## Definition of done (v1)

1. One focused scene delivering the idea above, with a complete loop: start → core interaction → a visible result or ending → replay. A short first-time hint teaches the controls in place.
2. Arrival loader: keep the veil in `index.html` and `src/loader.ts`; restyle the veil to the art direction and call `worldReady()` after the first rendered frame.
3. Desktop (1440×900) and phone (390×844) layouts; mouse, touch and keyboard; honour `prefers-reduced-motion`; visible focus and labelled controls.
4. `bun run check` passes: strict `tsc`, Biome, `bun test`, production build into `dist/`.
5. Unit tests of the game rules (pure TypeScript, no DOM) replace `tests/scaffold.test.ts`.
6. `README.md`: one status paragraph, how to play, and credits for any asset used.
No extra modes, settings screens, accounts, leaderboards, backends, analytics or network calls.

## Technical rules

- The stack is installed and pinned: Vite, React, strict TypeScript, three.js 0.186 (direct, no React Three Fiber), GSAP, Tailwind v4, Biome, Bun. Add a dependency only if essential, pinned exactly.
- `bun run dev` serves the real app (`index.html` → `src/main.tsx`); `bun run build` builds it into `dist/`. `development/` is old tooling: leave it alone.
- Single responsibility: `src/game/` pure rules and state (tested), `src/scene/` three.js scene, camera, lights and meshes, `src/ui/` React HUD and panels, `src/main.tsx` wiring. Files under ~300 lines.
- Visuals: author forms procedurally in code (geometry, instancing, small shaders where they clearly help), AgX or ACES tone mapping, one key light plus hemisphere or environment light, soft shadows where cheap, a cohesive palette and strong silhouettes. Type: a system font stack. External assets only if CC0 or public domain, with the source in README.
- Performance: 60 fps on a mid laptop; cap devicePixelRatio at 2.
- Do not change `wrangler.jsonc`, deploy or publish anything.

## Working method

- There is no GPU here. Do not loop on screenshots: at most two headless checks (desktop, phone) if Chromium is available (software WebGL is fine).
- Commit in small, clear steps. Finish with a message: what was built, how to play, known gaps.
