import { test, expect } from "@playwright/test";
test("phone calendar plans a future event, marks its date and removes it", async ({
  page,
}) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.clock.setFixedTime(new Date("2028-02-10T12:00:00+11:00"));
  let events: { id: string; name: string; day: string; size: string }[] = [];
  await page.route("**/api/data", async (route) => {
    if (route.request().method() === "POST") {
      const b = route.request().postDataJSON();
      if (b.action === "event") events.push({ ...b, id: "test-event" });
      if (b.action === "deleteEvent")
        events = events.filter((e) => e.id !== b.id);
      return route.fulfill({ json: { ok: true } });
    }
    return route.fulfill({
      json: {
        user: { id: "calendar-test", email: "test@example.com" },
        events,
        profiles: [
          {
            data: {
              name: "Alex",
              age: 30,
              sex: "male",
              height: 175,
              weight: 80,
              goal: "maintain",
              training: 3,
              activity: "moderate",
              difficulty: "balanced",
              alcoholFrequency: 1,
              start: "2028-02-01",
              timezone: "Australia/Sydney",
              targetWeight: null,
              waist: null,
              calorieLow: null,
              calorieHigh: null,
              protein: null,
              share: true,
              minimum: "Regular meals",
              reviewReminder: false,
            },
          },
        ],
      },
    });
  });
  await page.goto("/");
  await page.getByRole("button", { name: "Events", exact: true }).click();
  await expect(
    page.getByRole("heading", { name: "February 2028", exact: true }),
  ).toBeVisible();
  await page
    .getByRole("button", { name: "Tuesday 29 February 2028", exact: true })
    .click();
  await page.getByRole("button", { name: "Add an event" }).click();
  await page.getByLabel("Event name").fill("Mia’s birthday dinner");
  await page.getByLabel("Event size").selectOption("Drinks");
  await page.getByRole("button", { name: "Save event", exact: true }).click();
  await expect(
    page.getByRole("button", {
      name: "Tuesday 29 February 2028, planned event",
    }),
  ).toHaveAttribute("aria-pressed", "true");
  await expect(
    page.getByText("plan your journey home", { exact: false }),
  ).toBeVisible();
  expect(events[0].day).toBe("2028-02-29");
  await page.getByRole("button", { name: "Next month", exact: true }).click();
  await expect(page.getByRole("heading", { name: "March 2028", exact: true })).toBeVisible();
  await page
    .getByRole("button", { name: /Mia’s birthday dinner.*Drinks/ })
    .click();
  await expect(
    page.getByRole("heading", { name: "February 2028", exact: true }),
  ).toBeVisible();
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= innerWidth,
    ),
  ).toBe(true);
  await page.locator(".calendar-card").scrollIntoViewIfNeeded();
  await page.screenshot({
    path: "test-results/calendar-phone.png",
    fullPage: true,
  });
  await page
    .getByRole("button", { name: "Remove Mia’s birthday dinner" })
    .click();
  await expect(
    page.getByText("Your calendar is clear.", { exact: false }),
  ).toBeVisible();
  await page
    .getByRole("button", { name: "Previous month", exact: true })
    .click();
  await expect(
    page.getByRole("heading", { name: "January 2028", exact: true }),
  ).toBeVisible();
  await expect(
    page.getByRole("button", { name: "Add an event" }),
  ).not.toBeVisible();
});
