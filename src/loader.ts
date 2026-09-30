// The arrival veil lifts only after a rendered frame or the visible startup error.
let revealed = false;
let slowTimer: number | undefined;
let removeTimer: number | undefined;

export function worldReady() {
  if (revealed || typeof document === "undefined") return;
  revealed = true;
  window.clearTimeout(slowTimer);
  const veil = document.getElementById("arrival");
  if (!veil) return;
  veil.classList.add("is-done");
  removeTimer = window.setTimeout(() => veil.remove(), 700);
}

if (typeof window !== "undefined") {
  slowTimer = window.setTimeout(() => {
    if (revealed) return;
    const veil = document.getElementById("arrival");
    if (!veil) return;
    const status = veil.querySelector(".loading-status");
    if (status) status.textContent = "Still gathering the weather";
    const retry = document.createElement("button");
    retry.type = "button";
    retry.className = "btn";
    retry.textContent = "Reload";
    retry.addEventListener("click", () => location.reload());
    veil.append(retry);
  }, 12_000);
}

if (import.meta.hot) {
  import.meta.hot.dispose(() => {
    window.clearTimeout(slowTimer);
    window.clearTimeout(removeTimer);
  });
}
