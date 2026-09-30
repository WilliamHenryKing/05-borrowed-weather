import { describe, expect, test } from "bun:test";
import { renderToStaticMarkup } from "react-dom/server";
import { apply, createGame } from "../src/game/state";
import { Guide } from "../src/ui/Guide";
import { Hud } from "../src/ui/Hud";
import { Modal } from "../src/ui/Modal";
import { Notebook } from "../src/ui/Notebook";
import { Postcard } from "../src/ui/Postcard";
import { SoundButton } from "../src/ui/SoundButton";

const noop = () => {};
const hud = (message = "", withGuide = true) =>
  renderToStaticMarkup(
    <Hud
      state={createGame()}
      message={message}
      onAction={noop}
      onNotebook={noop}
      onHint={noop}
      hint={null}
      muted={false}
      onMute={noop}
      onGuide={noop}
      guide={withGuide ? <Guide step={0} state={createGame()} onSkip={noop} /> : null}
    />,
  );

describe("trail and reading panel semantics", () => {
  test("each miniature trail mark has its own named native button", () => {
    const markup = hud();
    expect(markup.match(/class="trail-stop"/g)).toHaveLength(6);
    expect(markup).toContain('aria-current="location"');
    expect(markup).toContain('aria-label="Wool Gate (you are here)"');
    expect(markup).toContain('aria-label="Cairn Hollow (not reachable yet)"');
    expect(markup).toContain('aria-label="Walk on to Fog Ford"');
    expect(markup).toContain('aria-label="Replay the guide"');
    expect(markup.match(/aria-label="Trail guide"/g)).toHaveLength(1);
  });

  test("empty announcements add no useless keyboard stop", () => {
    expect(hud("", false)).toMatch(/role="status" aria-live="polite"><\/p>/);
    expect(hud("You bottle the rain.", false)).toMatch(
      /role="status" aria-live="polite" tabindex="0">You bottle the rain/,
    );
  });

  test("guide progression stays outside the controls scrolling region without a duplicate message", () => {
    const markup = hud("You walk to Fog Ford.");
    expect(markup.indexOf("</aside>")).toBeLessThan(
      markup.indexOf('class="hud-play-controls keyboard-scroll"'),
    );
    expect(markup).not.toContain('role="status"');
    expect(markup).not.toContain("You walk to Fog Ford.");
  });

  test("Sound state remains visible and named inside a modal", () => {
    const markup = renderToStaticMarkup(
      <Modal open label="Field notebook" onClose={noop} sound={<SoundButton muted onMute={noop} />}>
        <Notebook state={createGame()} onClose={noop} />
      </Modal>,
    );
    expect(markup).toContain('aria-modal="true" tabindex="-1"');
    expect(markup).toContain('aria-label="Field notebook"');
    expect(markup).toContain('aria-label="Sound off. Turn sound on"');
    expect(markup).toContain('aria-pressed="true"');
    expect(markup.indexOf('class="modal-tools paper"')).toBeLessThan(
      markup.indexOf("Field notebook</h2>"),
    );
    expect(markup).toContain("Back to the trail");
  });

  test("closed dialogs do not retain controls or notebook contents in their DOM", () => {
    const markup = renderToStaticMarkup(
      <Modal
        open={false}
        label="Field notebook"
        onClose={noop}
        sound={<SoundButton muted={false} onMute={noop} />}
      >
        <Notebook state={createGame()} onClose={noop} />
      </Modal>,
    );
    expect(markup).not.toContain("modal-tools");
    expect(markup).not.toContain("Back to the trail");
    expect(markup).not.toContain("Sound on. Mute");
  });

  test("postcard text reports the recorded route and borrow, alongside its named map", () => {
    let state = createGame();
    for (const action of [
      { type: "travel", to: "ford" },
      { type: "take", weather: "fog" },
      { type: "travel", to: "hollow" },
      { type: "release" },
    ] as const)
      state = apply(state, action).state;
    const markup = renderToStaticMarkup(<Postcard state={state} onClose={noop} onReplay={noop} />);
    expect(markup).toContain('aria-label="Map of the route you walked"');
    expect(markup).toContain("I walked 2 stretches of trail and borrowed weather 1 times.");
    expect(markup).toContain("Fog Ford → Cairn Hollow");
    expect(markup).toContain("Stay a while");
    expect(markup).toContain("Walk it again");
  });
});
