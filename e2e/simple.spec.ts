import { test, expect } from "@playwright/test";
test("four destinations keep logging primary and private tools under More", async ({
  page,
}) => {
  await page.setViewportSize({ width: 390, height: 844 });
  const profile = {
    name: "Alex",
    age: 30,
    sex: "male",
    height: 175,
    weight: 80,
    goal: "maintain",
    training: 3,
    activity: "moderate",
    difficulty: "focused",
    alcoholFrequency: 1,
    start: "2026-09-01",
    timezone: "Australia/Sydney",
    targetWeight: 75,
    waist: 90,
    calorieLow: null,
    calorieHigh: null,
    protein: null,
    share: true,
    minimum: "My existing minimum",
    reviewReminder: false,
  };
  let saved: typeof profile | undefined;
  let savedWaist: number | undefined;
  await page.route("**/api/data", async (route) => {
    if (route.request().method() === "POST") {
      const b = route.request().postDataJSON();
      if (b.action === "profile") saved = b.data;
      if (b.action === "weight") savedWaist = b.waist;
      return route.fulfill({ json: { ok: true } });
    }
    return route.fulfill({
      json: {
        user: { id: "test", email: "test@example.com" },
        profiles: [{ data: saved || profile }],
        weights: [{ day: "2026-09-10", weight: 80, waist: 90 }],
        memories: [{ name: "usual lunch", estimate: {} }],
      },
    });
  });
  await page.goto("/");
  await expect(page.getByRole("navigation").getByRole("button")).toHaveText([
    "Today",
    "Calendar",
    "Friends",
    "Progress",
  ]);
  await expect(
    page.getByRole("button", { name: "Log my day", exact: true }),
  ).toBeVisible();
  await expect(
    page.getByText("Room for real life.", { exact: true }),
  ).not.toBeVisible();
  await page.screenshot({
    path: "test-results/simple-today-phone.png",
    fullPage: true,
  });
  await page.getByRole("button", { name: "Progress", exact: true }).click();
  await expect(
    page.getByRole("heading", { name: "Your week", exact: true }),
  ).toBeVisible();
  await expect(
    page.getByLabel("Weight (kg)", { exact: true }),
  ).not.toBeVisible();
  await expect(
    page.getByRole("button", { name: "Sunday reset" }),
  ).not.toBeVisible();
  await page.getByRole("button", { name: "More", exact: true }).click();
  await expect(
    page.getByRole("heading", { name: "Saved meals" }),
  ).toBeVisible();
  await expect(
    page.getByRole("button", { name: "Export my data" }),
  ).toBeVisible();
  await page.getByText("Private weight trend", { exact: true }).click();
  await expect(page.getByLabel("Weight (kg)", { exact: true })).toBeVisible();
  await expect(page.getByText("7-day mean 80.0 kg")).toBeVisible();
  await page.getByLabel("Date", { exact: true }).fill("2026-09-10");
  await page.getByLabel("Weight (kg)", { exact: true }).fill("79.9");
  await page.getByRole("button", { name: "Save", exact: true }).click();
  await expect(page.getByText("Private measurement saved.")).toBeVisible();
  expect(savedWaist).toBe(90);
  await page.getByRole("button", { name: "Edit profile & targets" }).click();
  await expect(page.getByLabel("Your pace")).toHaveCount(0);
  await expect(page.getByLabel(/Waist/)).toHaveCount(0);
  await page.getByRole("button", { name: "Save my plan" }).click();
  await expect(
    page.getByText("Your plan is ready. Refine it whenever life changes."),
  ).toBeVisible();
  expect(saved?.waist).toBe(90);
  expect(saved?.targetWeight).toBe(75);
  expect(saved?.minimum).toBe(profile.minimum);
});
