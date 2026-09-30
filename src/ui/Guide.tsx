const STEPS = [
  [
    "Follow the meadow",
    "Walk to Fog Ford: tap On, a trail dot, or use the right arrow. Nothing is on a timer; take your time with the view.",
  ],
  [
    "Borrow a little sky",
    "Take the weather here. At the ford, take fog to reveal its stepping stones. The jar holds only one kind; release it first if it is full.",
  ],
  [
    "Carry what changed",
    "Walk to another diorama with your jar. Taking fog opened the ford; Cairn Hollow is waiting just uphill. Tap On or use the right arrow.",
  ],
  [
    "Give it somewhere to go",
    "Release the weather (R). Fog in Cairn Hollow makes a cloud step; rain wakes ferns; wind powers the lift. Hint can suggest your next move.",
  ],
];
export function Guide({ step, onSkip }: { step: number; onSkip: () => void }) {
  return (
    <aside className="panel trail-guide" aria-label="Trail guide" aria-live="polite">
      <p className="eyebrow">
        {step + 1}/4 · {STEPS[step]?.[0]}
      </p>
      <p>{STEPS[step]?.[1]}</p>
      <div className="guide-foot">
        <span aria-hidden="true">{STEPS.map((_, i) => (i === step ? "● " : "○ "))}</span>
        <button type="button" onClick={onSkip}>
          Skip the guide
        </button>
      </div>
    </aside>
  );
}
