/** Use a stable walk control when an action removed its own button or replay replaced a dialog. */
export function focusTrailControl(): void {
  const hud = document.querySelector<HTMLElement>("[data-hud]");
  if (!hud || hud.closest("[inert]") || document.querySelector("dialog[open]")) return;
  for (const selector of [
    ".walk-on:not(:disabled)",
    ".jar-action:not(:disabled)",
    ".walk-back:not(:disabled)",
    ".trail-stop[aria-current]",
  ]) {
    const node = hud.querySelector<HTMLElement>(selector);
    if (!node) continue;
    node.focus({ preventScroll: true });
    node.scrollIntoView({ block: "nearest", inline: "nearest" });
    return;
  }
}
