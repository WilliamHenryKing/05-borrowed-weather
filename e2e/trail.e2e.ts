import { expect, test } from "@playwright/test";
import { solve } from "../src/game/solver";
import { apply, createGame } from "../src/game/state";
import { LOCATION_INFO, LOCATIONS, WEATHERS } from "../src/game/world";

// Walk the trail to the Lantern Shelter with the keyboard, borrowing and releasing weather
// along the way, and check the HUD agrees with the rules at every step.
test("walks the trail to the lantern shelter using take and release", async ({ page }) => {
  const plan = solve(createGame());
  expect(plan).not.toBeNull();

  await page.goto("/");
  await expect(page.locator("#arrival")).toHaveCount(0, { timeout: 30_000 });
  await page.getByRole("button", { name: "Set off" }).click();

  const place = page.locator("#place");
  const jar = page.getByText(/^Jar holds /);
  let state = createGame();
  for (const action of plan ?? []) {
    if (action.type === "travel") {
      const forward = LOCATIONS.indexOf(action.to) > LOCATIONS.indexOf(state.at);
      await page.keyboard.press(forward ? "ArrowRight" : "ArrowLeft");
    } else if (action.type === "take") {
      await page.keyboard.press(String(WEATHERS.indexOf(action.weather) + 1));
    } else {
      await page.keyboard.press("r");
    }
    state = apply(state, action).state;
    await expect(place).toHaveText(LOCATION_INFO[state.at].name);
    await expect(jar).toHaveText(`Jar holds ${state.jar ?? "nothing"}.`);
  }

  expect(state.finished).toBe(true);
  const postcard = page.getByRole("dialog", { name: "Postcard of your route" });
  await expect(postcard).toBeVisible({ timeout: 15_000 });
  await expect(postcard.getByText("Greetings from the Lantern Shelter")).toBeVisible();
  await page.screenshot({ path: "test-results/lantern-shelter.png" });
});
