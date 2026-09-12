import { test, expect } from "@playwright/test";

test.beforeEach(async ({ page }) => {
  await page.route("**/api/data", (route) =>
    route.fulfill({
      json: {
        user: { id: "voice-test", email: "test@example.com" },
        profiles: [
          {
            data: {
              name: "Alex",
              age: 36,
              sex: "male",
              height: 188,
              weight: 90,
              goal: "maintain",
              training: 3,
              activity: "moderate",
              difficulty: "balanced",
              alcoholFrequency: 1,
              start: "2026-09-07",
              timezone: "Australia/Sydney",
              targetWeight: null,
              waist: null,
              calorieLow: null,
              calorieHigh: null,
              protein: null,
              share: true,
              minimum: "Normal meals",
              reviewReminder: false,
            },
          },
        ],
      },
    }),
  );
  await page.addInitScript(() => {
    class MockRecognition {
      interimResults = false;
      continuous = false;
      lang = "";
      onstart?: () => void;
      onend?: () => void;
      onerror?: (event: { error: string }) => void;
      onresult?: (event: { results: { transcript: string }[][] }) => void;
      constructor() {
        Object.assign(window, { testRecognition: this });
      }
      start() {
        this.onstart?.();
      }
      stop() {
        this.onend?.();
      }
      abort() {
        this.onend?.();
      }
    }
    Object.assign(window, { SpeechRecognition: MockRecognition });
  });
});

test("phone dictation displays interim words, replaces hypotheses and appends another recording", async ({
  page,
}) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto("/");
  const draft = page.getByLabel("Describe your food, drinks and movement");
  await page.getByRole("button", { name: "Log my day", exact: true }).click();
  await expect(
    page.getByRole("button", { name: "Done talking" }),
  ).toBeVisible();
  await expect(page.locator(".capture-status")).toContainText("Listening");
  await page.evaluate(() => {
    const r = (
      window as unknown as {
        testRecognition: {
          interimResults: boolean;
          continuous: boolean;
          onresult: (e: unknown) => void;
        };
      }
    ).testRecognition;
    if (!r.interimResults || !r.continuous)
      throw Error("Live recognition disabled");
    r.onresult({ results: [[{ transcript: "chicken" }]] });
  });
  await expect(draft).toHaveValue("chicken");
  await page.evaluate(() =>
    (
      window as unknown as {
        testRecognition: { onresult: (e: unknown) => void };
      }
    ).testRecognition.onresult({
      results: [
        [{ transcript: "chicken wrap for lunch" }],
        [{ transcript: "and a walk" }],
      ],
    }),
  );
  await expect(draft).toHaveValue("chicken wrap for lunch and a walk");
  await expect(
    page.getByRole("button", { name: "Review my day" }),
  ).toBeDisabled();
  await page.screenshot({
    path: "test-results/voice-listening-phone.png",
    fullPage: false,
  });
  await page.getByRole("button", { name: "Done talking" }).click();
  await expect(
    page.getByRole("button", { name: "Review my day" }),
  ).toBeEnabled();
  await page.getByRole("button", { name: "Add more by voice" }).click();
  await page.evaluate(() =>
    (
      window as unknown as {
        testRecognition: { onresult: (e: unknown) => void };
      }
    ).testRecognition.onresult({
      results: [[{ transcript: "two eggs for breakfast" }]],
    }),
  );
  await page.getByRole("button", { name: "Done talking" }).click();
  await expect(draft).toHaveValue(
    "chicken wrap for lunch and a walk\ntwo eggs for breakfast",
  );
  await expect(draft).toBeEditable();
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= innerWidth,
    ),
  ).toBe(true);
  await page.screenshot({
    path: "test-results/voice-draft-phone.png",
    fullPage: false,
  });
});

test("permission failure preserves typed words and supports a narrow phone", async ({
  page,
}) => {
  await page.setViewportSize({ width: 320, height: 740 });
  await page.goto("/");
  const draft = page.getByLabel("Describe your food, drinks and movement");
  await draft.fill("Toast for breakfast");
  await page.getByRole("button", { name: "Add more by voice" }).click();
  await page.evaluate(() =>
    (
      window as unknown as {
        testRecognition: { onerror: (e: unknown) => void };
      }
    ).testRecognition.onerror({ error: "not-allowed" }),
  );
  await expect(page.locator(".capture-status")).toContainText(
    "Microphone access wasn’t allowed",
  );
  await expect(draft).toHaveValue("Toast for breakfast");
  await expect(draft).toBeEditable();
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= innerWidth,
    ),
  ).toBe(true);
});
