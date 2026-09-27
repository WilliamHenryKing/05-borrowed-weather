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

**Keys:** ← → or A D to walk · 1 fog · 2 rain · 3 wind (take) · R release · H hint · N notebook · Esc to close panels.

There is no timer. If you get stuck, **Hint** points to the next take or release that matters and says what it will change.

## Development

```sh
bun install --frozen-lockfile
bun run dev      # http://127.0.0.1:4515/
bun run check    # tsc, Biome, bun test, production build into dist/
```

Code layout: `src/game/` holds the pure rules, notebook and solver (tested in `tests/`). `src/scene/` holds the three.js dioramas, weather effects and camera. `src/ui/` holds the React HUD and panels. `src/main.tsx` wires them together. `development/` and `tools/studio/` are earlier tooling and are not part of the app.

## Credits

All geometry, textures, icons and effects are generated in code for this project. No external assets are used. Libraries: three.js, React, GSAP, Tailwind CSS.
