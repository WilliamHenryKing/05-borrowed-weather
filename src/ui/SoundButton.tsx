import { SoundGlyph } from "./Glyphs";

export function SoundButton({ muted, onMute }: { muted: boolean; onMute: () => void }) {
  return (
    <button
      type="button"
      className="btn sound-button"
      onClick={onMute}
      aria-pressed={muted}
      aria-keyshortcuts="M"
      aria-label={muted ? "Sound off. Turn sound on" : "Sound on. Mute"}
    >
      <SoundGlyph muted={muted} />
      <span className="sound-label">Sound {muted ? "off" : "on"}</span>
    </button>
  );
}
