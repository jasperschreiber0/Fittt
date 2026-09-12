import { test, expect } from "@playwright/test";
import {
  buildReview,
  dueReviewEnd,
  addDays,
  type Context,
} from "../lib/intelligence";
import { dateInZone } from "../lib/engine";
test("phone daily intelligence and Sunday plan keep estimates and missing days honest", async ({
  page,
}) => {
  const today = dateInZone(),
    end = dueReviewEnd("Australia/Sydney");
  const c: Context = {
    profile: {
      name: "Alex",
      age: 35,
      sex: "male",
      height: 180,
      weight: 90,
      goal: "lose",
      training: 3,
      activity: "moderate",
      difficulty: "balanced",
      alcoholFrequency: 1,
      start: addDays(end, -35),
      timezone: "Australia/Sydney",
      targetWeight: 87,
      waist: null,
      calorieLow: null,
      calorieHigh: null,
      protein: null,
      share: false,
      minimum: "Regular meals",
      reviewReminder: false,
    },
    entries: [
      {
        id: "demo",
        day: today,
        source: "voice",
        estimate: {
          foods: [
            {
              name: "Meals",
              quantity: "rough portions",
              caloriesLow: 2300,
              caloriesHigh: 2600,
              proteinLow: 150,
              proteinHigh: 185,
              standardDrinks: 0,
            },
          ],
          drinks: [],
          exercise: ["45 minutes weights"],
          activity: [
            {
              kind: "weights",
              description: "weights",
              minutes: 45,
              durationBasis: "reported",
            },
          ],
          steps: 9200,
          stepsBasis: "reported",
          confidence: "medium",
          assumptions: ["Typical portions"],
          clarification: null,
          completeDay: true,
          safetyConcern: false,
        },
      },
    ],
    days: [],
    weights: [],
    events: [{ day: addDays(end, 5), name: "Friday wedding", size: "Big one" }],
  };
  await page.route("**/api/review", (r) => r.fulfill({ json: { ok: true } }));
  await page.route("**/api/data", (r) =>
    r.fulfill({
      json:
        r.request().method() === "POST"
          ? { ok: true }
          : {
              user: { id: "demo", email: "demo@example.com" },
              profiles: [{ data: c.profile }],
              entries: c.entries,
              weights: [],
              days: [],
              events: c.events,
              reviews: [
                {
                  review_end: end,
                  payload: buildReview(c, end),
                  generated_at: new Date().toISOString(),
                },
              ],
            },
    }),
  );
  await page.goto("/");
  const daily = page.getByRole("region", { name: "Today's intelligence" });
  await expect(daily).toContainText("2,450 kcal");
  await expect(daily).toContainText("9,200 steps reported");
  await expect(daily).toContainText("Building the picture");
  await daily.scrollIntoViewIfNeeded();
  await page.screenshot({ path: "test-results/intelligence-daily-phone.png" });
  await page.getByRole("button", { name: "Progress", exact: true }).click();
  await expect(
    page.getByRole("heading", { name: "What to do next." }),
  ).toBeVisible();
  await expect(page.getByText("Friday wedding", { exact: true })).toBeVisible();
  await page.getByText("What happened this week", { exact: true }).click();
  await expect(
    page.getByText("Unknown — some food days are incomplete"),
  ).toBeVisible();
  await expect(page.getByText(/invent a calorie allowance/)).toBeVisible();
  await page.getByRole("button", { name: "Refresh latest recap" }).click();
  await expect(page.getByText("Sunday recap updated.")).toBeVisible();
  await expect(page.getByRole("navigation").getByRole("button")).toHaveCount(4);
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= innerWidth,
    ),
  ).toBe(true);
  await page.screenshot({
    path: "test-results/intelligence-weekly-phone.png",
    fullPage: true,
  });
});
