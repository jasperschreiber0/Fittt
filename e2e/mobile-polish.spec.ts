import { test, expect } from "@playwright/test";
import { dateInZone, type Entry } from "../lib/engine";
test.beforeEach(async ({ page }) => {
  const entries: Entry[] = [];
  const profile = {
    name: "Alex",
    age: 35,
    sex: "male",
    height: 180,
    weight: 90,
    goal: "maintain",
    training: 3,
    activity: "moderate",
    difficulty: "balanced",
    alcoholFrequency: 1,
    start: dateInZone(),
    timezone: "Australia/Sydney",
    targetWeight: null,
    waist: null,
    calorieLow: null,
    calorieHigh: null,
    protein: null,
    share: false,
    minimum: "Regular meals",
    reviewReminder: false,
  };
  const estimate = {
    foods: [
      {
        name: "Chicken wrap",
        quantity: "one",
        caloriesLow: 500,
        caloriesHigh: 700,
        proteinLow: 30,
        proteinHigh: 40,
        standardDrinks: 0,
      },
    ],
    drinks: [],
    exercise: [],
    steps: null,
    confidence: "medium",
    assumptions: ["Typical wrap"],
    clarification: null,
    completeDay: false,
    safetyConcern: false,
  };
  await page.route("**/api/review", (r) => r.fulfill({ json: { ok: true } }));
  await page.route("**/api/interpret", (r) =>
    r.fulfill({ json: { estimate } }),
  );
  await page.route("**/api/data", (r) => {
    if (r.request().method() === "POST") {
      const b = r.request().postDataJSON();
      if (b.action === "entry") entries.push(b);
      return r.fulfill({ json: { ok: true } });
    }
    return r.fulfill({
      json: {
        user: { id: "demo", email: "demo@example.com" },
        profiles: [{ data: profile }],
        entries,
      },
    });
  });
});
for (const size of [
  { width: 320, height: 740 },
  { width: 360, height: 640 },
  { width: 390, height: 844 },
]) {
  test(`primary log controls fit and save clearly on ${size.width}×${size.height}`, async ({
    page,
  }) => {
    await page.setViewportSize(size);
    await page.goto("/");
    const review = page.getByRole("button", {
      name: "Review my day",
      exact: true,
    });
    await expect(review).toBeVisible();
    const box = (await review.boundingBox())!,
      nav = (await page.getByRole("navigation").boundingBox())!;
    expect(box.y).toBeGreaterThan(0);
    expect(box.y + box.height).toBeLessThan(nav.y - 4);
    expect(
      await page.evaluate(
        () => document.documentElement.scrollWidth <= innerWidth,
      ),
    ).toBe(true);
    await page.screenshot({
      path: `test-results/polish-today-${size.width}.png`,
    });
    await page
      .getByLabel("Describe your food, drinks and movement")
      .fill("Chicken wrap for lunch");
    await review.click();
    await page.getByRole("button", { name: "Looks right" }).click();
    const result = page.getByRole("region", { name: "Today's intelligence" });
    await expect(result).toBeFocused();
    await expect(result).toContainText("Your day, saved.");
    expect((await result.boundingBox())!.y).toBeGreaterThanOrEqual(0);
    expect((await result.boundingBox())!.y).toBeLessThan(40);
    await page.screenshot({
      path: `test-results/polish-saved-${size.width}.png`,
    });
    await page.getByRole("button", { name: "Progress", exact: true }).click();
    const plan = page.locator(".next-week-plan"),
      recap = page.getByRole("heading", { name: "Your week", exact: true });
    await expect(plan).toBeVisible();
    await expect
      .poll(async () => (await plan.boundingBox())!.y)
      .toBeGreaterThanOrEqual(0);
    await expect
      .poll(async () => (await plan.boundingBox())!.y)
      .toBeLessThan(220);
    expect((await plan.boundingBox())!.y).toBeLessThan(
      (await recap.boundingBox())!.y,
    );
    await page.screenshot({
      path: `test-results/polish-progress-${size.width}.png`,
    });
  });
}
test("navigation clears the simulated software keyboard and returns afterwards", async ({
  page,
}) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto("/");
  await page.getByLabel("Describe your food, drinks and movement").focus();
  await page.evaluate(() => {
    Object.defineProperty(window.visualViewport!, "height", {
      configurable: true,
      get: () => innerHeight - 300,
    });
    window.visualViewport!.dispatchEvent(new Event("resize"));
  });
  await expect(page.getByRole("navigation")).not.toBeVisible();
  await page.evaluate(() => {
    delete (window.visualViewport as unknown as { height?: number }).height;
    window.visualViewport!.dispatchEvent(new Event("resize"));
  });
  await expect(page.getByRole("navigation")).toBeVisible();
});
