import { expect, type Page, test } from "@playwright/test";
import { solve } from "../src/game/solver";
import { apply, createGame, type GameState } from "../src/game/state";
import { LOCATION_INFO, LOCATIONS, WEATHERS } from "../src/game/world";

function watchErrors(page: Page) {
  const errors: string[] = [];
  page.on("pageerror", (error) => errors.push(error.message));
  page.on("console", (message) => {
    if (message.type() === "error") errors.push(message.text());
  });
  return errors;
}

async function ready(page: Page, query = "?e2e") {
  await page.goto(`/${query}`);
  await expect(page.locator("#arrival")).toHaveCount(0, { timeout: 45_000 });
  await page.waitForFunction(() => window.__VISUAL_TEST__?.ready);
  const renderer = await page.evaluate(() => window.__VISUAL_TEST__?.renderer);
  expect(renderer).toBeTruthy();
  if (process.env.REQUIRE_REAL_GPU === "1") expect(renderer).toMatch(/NVIDIA|RTX/i);
}

async function walk(page: Page, start: GameState = createGame()) {
  const plan = solve(start);
  expect(plan).not.toBeNull();
  let state = start;
  for (const action of plan ?? []) {
    if (action.type === "travel") {
      const forward = LOCATIONS.indexOf(action.to) > LOCATIONS.indexOf(state.at);
      await page.keyboard.press(forward ? "ArrowRight" : "ArrowLeft");
    } else if (action.type === "take") {
      await page.keyboard.press(String(WEATHERS.indexOf(action.weather) + 1));
    } else await page.keyboard.press("r");
    state = apply(state, action).state;
    await expect(page.locator("#place")).toHaveText(LOCATION_INFO[state.at].name);
    await expect(page.getByText(/^Jar holds /)).toHaveText(`Jar holds ${state.jar ?? "nothing"}.`);
  }
  expect(state.finished).toBe(true);
  return state;
}

async function assertModalFocus(page: Page) {
  expect(await page.evaluate(() => !!document.activeElement?.closest("dialog[open]"))).toBe(true);
}

async function settledAt(page: Page, at: string) {
  await page.waitForFunction(
    (expectedAt) => {
      const movement = window.__VISUAL_TEST__?.movement();
      return movement?.at === expectedAt && !movement.active && movement.distance < 0.00001;
    },
    at,
    { timeout: 6000 },
  );
}

async function readableGuide(page: Page) {
  await expect
    .poll(async () =>
      page.getByLabel("Trail guide", { exact: true }).evaluate((guide) => {
        const paragraphs = [...guide.querySelectorAll("p")];
        return (
          paragraphs.length >= 2 &&
          paragraphs.slice(0, 2).every((paragraph) => {
            const box = paragraph.getBoundingClientRect();
            const hit = document.elementFromPoint(
              box.left + Math.min(12, box.width / 2),
              box.top + Math.min(8, box.height / 2),
            );
            return hit !== null && paragraph.contains(hit);
          })
        );
      }),
    )
    .toBe(true);
}

test("completes all six stops, guards panels and replays without a stale postcard", async ({
  page,
}) => {
  const errors = watchErrors(page);
  await ready(page);
  const notebookButton = page.getByRole("button", { name: /Notebook/ });
  await notebookButton.click();
  const notebook = page.getByRole("dialog", { name: "Field notebook" });
  await expect(notebook).toBeVisible();
  await expect(notebook).toBeFocused();
  for (const key of ["ArrowRight", "2", "r"]) await page.keyboard.press(key);
  await expect(page.locator("#place")).toHaveText("Wool Gate");
  await expect(page.getByText(/^Jar holds /)).toHaveText("Jar holds nothing.");
  await notebook.getByRole("button", { name: /Sound/ }).click();
  await page.keyboard.press("Tab");
  await assertModalFocus(page);
  await page.keyboard.press("Escape");
  await expect(notebook).not.toBeVisible();
  await expect(notebookButton).toBeFocused();

  await walk(page);
  // Open and replay during the original 1.4-second ending delay.
  await page.getByRole("button", { name: "Open your postcard", exact: true }).click();
  const postcard = page.getByRole("dialog", { name: "Postcard of your route" });
  await expect(postcard).toBeFocused();
  await page.getByRole("button", { name: "Walk it again", exact: true }).click();
  await expect(page.locator("#place")).toHaveText("Wool Gate");
  await page.waitForTimeout(1700);
  await settledAt(page, "gate");
  await expect(postcard).not.toBeVisible();
  await expect(page.getByText(/^Jar holds /)).toHaveText("Jar holds nothing.");
  await walk(page);
  await expect(postcard).toBeVisible({ timeout: 8000 });
  await expect(postcard.getByText("Greetings from the Lantern Shelter")).toBeVisible();
  await expect(postcard).toBeFocused();
  await settledAt(page, "shelter");
  await page.screenshot({ path: "test-results/ending.png" });
  await page.getByRole("button", { name: "Stay a while", exact: true }).click();
  await expect(page.locator("#place")).toHaveText("Lantern Shelter");
  await page.getByRole("button", { name: "Open your postcard", exact: true }).click();
  await page.getByRole("button", { name: "Walk it again", exact: true }).click();
  await expect(page.locator("#place")).toHaveText("Wool Gate");
  expect(errors).toEqual([]);
});

for (const viewport of [
  { width: 390, height: 844 },
  { width: 568, height: 320 },
  { width: 320, height: 568 },
]) {
  test(`touch guide, weather and notebook at ${viewport.width}x${viewport.height}`, async ({
    browser,
  }) => {
    const context = await browser.newContext({
      viewport,
      hasTouch: true,
      isMobile: true,
      reducedMotion: "reduce",
    });
    const page = await context.newPage();
    const errors = watchErrors(page);
    await ready(page, "?e2e&intro");
    await page.getByRole("button", { name: "Set off", exact: true }).tap();
    const guide = page.getByLabel("Trail guide", { exact: true });
    await expect(guide).toContainText("1/4");
    await readableGuide(page);
    await page.getByRole("button", { name: "Walk on to Fog Ford", exact: true }).tap();
    await expect(guide).toContainText("2/4");
    await readableGuide(page);
    await page.getByRole("button", { name: "Take fog", exact: true }).tap();
    await expect(guide).toContainText("3/4");
    await readableGuide(page);
    await page.getByRole("button", { name: "Walk on to Cairn Hollow", exact: true }).tap();
    await expect(guide).toContainText("4/4");
    await readableGuide(page);
    await page.screenshot({ path: `test-results/guide-${viewport.width}.png` });
    await page.getByRole("button", { name: "Release fog", exact: true }).tap();
    await expect(guide).toHaveCount(0);
    await page.getByRole("button", { name: "Replay the guide", exact: true }).tap();
    await expect(guide).toBeVisible();
    await page.getByRole("button", { name: "Skip the guide", exact: true }).tap();
    const notebookButton = page.getByRole("button", { name: /Notebook/ });
    await notebookButton.tap();
    const notebook = page.getByRole("dialog", { name: "Field notebook" });
    await expect(notebook).toBeFocused();
    await notebook.getByRole("button", { name: /Sound/ }).tap();
    await page.screenshot({ path: `test-results/notebook-${viewport.width}.png` });
    await page.keyboard.press("Escape");
    await expect(page.locator("#place")).toHaveText("Cairn Hollow");
    await expect(notebookButton).toBeFocused();
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(
      true,
    );
    expect(errors).toEqual([]);
    await context.close();
  });
}

test("live reduced motion finishes the glide and held travel cannot skip a stop", async ({
  page,
}) => {
  const errors = watchErrors(page);
  await ready(page, "?e2e&intro");
  await page.getByRole("button", { name: "Set off", exact: true }).click();
  await page.waitForTimeout(150);
  await page.emulateMedia({ reducedMotion: "reduce" });
  await expect(page.locator("#place")).toBeVisible({ timeout: 1500 });
  await page.keyboard.press("ArrowRight");
  await page.keyboard.press("1");
  await page.keyboard.press("ArrowRight");
  await page.keyboard.press("r");
  await page.keyboard.down("ArrowRight");
  await page.keyboard.down("ArrowRight");
  await page.keyboard.down("ArrowRight");
  await page.keyboard.up("ArrowRight");
  await expect(page.locator("#place")).toHaveText("Vane Terrace");
  await page.keyboard.press("ArrowLeft");
  await page.keyboard.press("ArrowRight");
  await page.keyboard.press("ArrowLeft");
  await expect(page.locator("#place")).toHaveText("Cairn Hollow");
  await settledAt(page, "hollow");
  await page.screenshot({ path: "test-results/live-motion.png" });
  expect(errors).toEqual([]);
});

test("a slow critical asset keeps the arrival veil until a real first frame", async ({ page }) => {
  const errors = watchErrors(page);
  let release = () => {};
  const held = new Promise<void>((resolve) => {
    release = resolve;
  });
  await page.route("**/env/table_mountain_1_puresky_1k.hdr", async (route) => {
    await held;
    await route.continue();
  });
  try {
    await page.goto("/?e2e&intro");
    await expect(page.locator(".loading-status")).toHaveText("Still gathering the weather", {
      timeout: 16_000,
    });
    await expect(page.locator("#arrival")).toBeVisible();
    await expect(
      page.locator("#arrival").getByRole("button", { name: "Reload", exact: true }),
    ).toBeVisible();
    await page.keyboard.press("Enter");
    release();
    await expect(page.locator("#arrival")).toHaveCount(0, { timeout: 45_000 });
    await page.waitForFunction(() => window.__VISUAL_TEST__?.ready);
    await expect(page.getByRole("button", { name: "Set off", exact: true })).toBeVisible();
    expect(errors).toEqual([]);
  } finally {
    release();
  }
});

test("direct trail clicks retain passed discoveries without inventing a stopped lift", async ({
  page,
}) => {
  const errors = watchErrors(page);
  await page.emulateMedia({ reducedMotion: "reduce" });
  await ready(page);
  for (const key of ["ArrowRight", "1", "ArrowRight", "r"]) await page.keyboard.press(key);
  await page.getByRole("button", { name: "High Tarn", exact: true }).click();
  await expect(page.locator("#place")).toHaveText("High Tarn");
  await page.getByRole("button", { name: "Take wind", exact: true }).click();
  await page.getByRole("button", { name: "Walk back to Vane Terrace", exact: true }).click();
  await page.getByRole("button", { name: /Notebook/ }).click();
  const notebook = page.getByRole("dialog", { name: "Field notebook" });
  await expect(notebook.getByRole("heading", { name: "The vane lift", exact: true })).toHaveCount(
    1,
  );
  await expect(
    notebook.getByRole("heading", { name: "Borrowing has a cost", exact: true }),
  ).toHaveCount(0);
  await page.keyboard.press("Escape");
  await page.getByRole("button", { name: "Walk on to High Tarn", exact: true }).click();
  await page.getByRole("button", { name: "Release wind", exact: true }).click();
  await expect(page.getByText(/^Jar holds /)).toHaveText("Jar holds nothing.");
  expect(errors).toEqual([]);
});
