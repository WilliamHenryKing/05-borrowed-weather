// Capture every camera bookmark from the production build in headless Chromium.
// Usage: bun run build && node tools/visual/capture.mjs <label> [bookmark,bookmark]
// Writes docs/visual/captures/<label>/<bookmark>.png and renderer.txt.

import { spawn } from "node:child_process";
import { mkdirSync, writeFileSync } from "node:fs";
import { chromium } from "@playwright/test";

const label = process.argv[2] ?? "latest";
const only = process.argv[3]?.split(",");
const out = `docs/visual/captures/${label}`;
const url = "http://127.0.0.1:4615/?e2e";
mkdirSync(out, { recursive: true });

const SHOTS = [
  { name: "establishing", viewport: { width: 1440, height: 900 }, dpr: 1, walk: 0, hud: false },
  { name: "hero", viewport: { width: 1440, height: 900 }, dpr: 1, walk: 1, hud: true },
  { name: "closeup", viewport: { width: 1440, height: 900 }, dpr: 1, walk: 0, hud: false },
  { name: "grazing", viewport: { width: 1440, height: 900 }, dpr: 1, walk: 1, hud: false },
  { name: "phone-hero", viewport: { width: 390, height: 844 }, dpr: 2, walk: 1, hud: true },
];

async function serverUp() {
  try {
    return (await fetch(url)).ok;
  } catch {
    return false;
  }
}

let server = null;
if (!(await serverUp())) {
  server = spawn("bunx", ["vite", "preview"], { stdio: "ignore" });
  for (let i = 0; i < 60 && !(await serverUp()); i++) await new Promise((r) => setTimeout(r, 500));
}

const browser = await chromium.launch({
  args: ["--use-gl=angle", "--use-angle=swiftshader", "--enable-unsafe-swiftshader"],
});
let renderer = "";
for (const shot of SHOTS.filter((s) => !only || only.includes(s.name))) {
  const context = await browser.newContext({
    viewport: shot.viewport,
    deviceScaleFactor: shot.dpr,
    isMobile: shot.dpr > 1,
    hasTouch: shot.dpr > 1,
    reducedMotion: "no-preference",
  });
  const page = await context.newPage();
  await page.goto(url);
  await page.waitForFunction(() => window.__VISUAL_TEST__?.ready === true, null, {
    timeout: 300_000,
  });
  page.setDefaultTimeout(300_000);
  await page.getByRole("button", { name: "Set off" }).click();
  for (let i = 0; i < shot.walk; i++) await page.keyboard.press("ArrowRight");
  await page.waitForTimeout(shot.walk ? 4000 : 1500);
  if (!shot.hud) await page.addStyleTag({ content: "[data-hud]{display:none!important}" });
  await page.evaluate(async (name) => {
    const hook = window.__VISUAL_TEST__;
    hook.setBookmark(name);
    await hook.settle(2);
    hook.freeze(true);
    await hook.settle(3);
    hook.pause(true);
  }, shot.name);
  renderer = await page.evaluate(() => window.__VISUAL_TEST__.renderer);
  await page.waitForTimeout(500);
  await page.screenshot({ path: `${out}/${shot.name}.png`, timeout: 180_000 });
  console.log(`${out}/${shot.name}.png`);
  await context.close();
}
await browser.close();
server?.kill();
writeFileSync(`${out}/renderer.txt`, `${renderer}\n${new Date().toISOString()}\n`);
console.log("renderer:", renderer);
