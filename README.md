# BORROWED WEATHER

A cosy hiking puzzle adventure with a jar full of weather.

**Status:** v1 is playable from start to finish. Six procedural trail dioramas climb from a sheep gate to a lantern shelter above the clouds. There is one jar and three kinds of weather (fog, rain, wind), a field notebook of discoveries, a hint that never lies, and a postcard of your route at the end. The rules are pure TypeScript, and the tests search the whole state space: they prove the trail can be finished from every reachable state (no dead ends) and that every borrowing can be undone. Everything runs locally; there are no network calls.

## How to play

You carry one glass jar. It holds a single pocket of fog, rain or wind.

- **Take** weather and the place you took it from changes.
- **Release** it and the place you release it changes.
- Walk by tapping or clicking a diorama, the trail dots, or the ← → buttons. You can walk to any diorama whose paths are open.

The rules, each noted in your notebook the first time you see it:

| Weather | What it does |
| --- | --- |
| Fog | Hides the stepping stones at the ford and the ferry lane on the tarn. Released in the marked hollow, it gathers into a cloud step you can stand on. |
| Wind | Turns the terrace vane, which runs the basket lift. On the tarn it fills the leaf ferry's sail. |
| Rain | Uncurls the terrace ferns into a stair. |

Reach the Lantern Shelter and release each kind of weather beside its instrument (cloud glass, rain gauge, wind vane) to wake it. Order matters: whatever you borrow stops working where it was.

**Keys:** ← → or A D to walk · 1 fog · 2 rain · 3 wind (take) · R release · H hint · N notebook · M mute · Esc to close panels.

**Sound:** gentle music, footsteps, jar clinks, notebook pages and chimes. The ambience follows the weather where you stand: rain patters where there is rain, wind blows where there is wind, the beck runs at the ford, and fog muffles everything. Audio loads and starts only after your first tap or key press. The mute button (or M) is remembered between visits. Audio pauses while the tab is hidden, and the music dips while the notebook or postcard is open.

There is no timer. If you get stuck, **Hint** points to the next take or release that matters and says what it will change.

## Development

```sh
bun install --frozen-lockfile
bun run dev      # http://127.0.0.1:4515/
bun run check    # tsc, Biome, bun test, production build into dist/
```

Code layout: `src/game/` holds the pure rules, notebook and solver (tested in `tests/`). `src/scene/` holds the three.js dioramas, weather effects and camera. `src/ui/` holds the React HUD and panels. `src/main.tsx` wires them together. `development/` and `tools/studio/` are earlier tooling and are not part of the app.

## Credits

All geometry, textures, icons and visual effects are generated in code for this project. Libraries: three.js, React, GSAP, Tailwind CSS.

Audio (all CC0 / public domain; converted to mono OGG Vorbis, trimmed and crossfaded into loops, about 1.3 MB in total, in `public/audio/`):

| File(s) | Source | Author | Licence |
| --- | --- | --- | --- |
| `music.ogg` ("Contemplation") | https://opengameart.org/content/contemplation-0 | Joth | CC0 |
| `amb-rain.ogg` ("Amb rain loop 1") | https://opengameart.org/content/amb-rain-loop-1 | Kresiek The Furry | CC0 |
| `amb-birds.ogg`, `amb-river.ogg`, `amb-wind.ogg` ("Park ambiences") | https://opengameart.org/content/park-ambiences | Thimras | CC0 |
| `step-1..3.ogg` (footstep_grass), `take.ogg`, `release.ogg` (impactGlass), `restore.ogg` (impactBell) | https://kenney.nl/assets/impact-sounds | Kenney (kenney.nl) | CC0 |
| `book-open.ogg`, `book-close.ogg`, `page.ogg` (bookOpen, bookClose, bookFlip2) | https://kenney.nl/assets/rpg-audio | Kenney (kenney.nl) | CC0 |
| `click.ogg`, `hint.ogg`, `toggle.ogg` (click_002, question_002, toggle_001) | https://kenney.nl/assets/interface-sounds | Kenney (kenney.nl) | CC0 |
| `blocked.ogg`, `discover.ogg`, `finish.ogg` (jingles_PIZZI04, 10, 02) | https://kenney.nl/assets/music-jingles | Kenney (kenney.nl) | CC0 |
