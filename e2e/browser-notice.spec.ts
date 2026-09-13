import { test, expect } from "@playwright/test";

for (const [platform, agent] of [
  [
    "Safari",
    "Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X) AppleWebKit/605.1.15 Mobile/15E148 [FBAN/MessengerForiOS;FBAV/500.0]",
  ],
  [
    "Chrome",
    "Mozilla/5.0 (Linux; Android 14) AppleWebKit/537.36 Chrome/130.0 Mobile Safari/537.36 [FB_IAB/MESSENGER;FBAV/500.0]",
  ],
]) {
  test(`Messenger notice recommends ${platform} and copies only the public invite`, async ({
    browser,
    baseURL,
  }) => {
    const context = await browser.newContext({
      userAgent: agent,
      viewport: { width: 320, height: 740 },
    });
    await context.addInitScript(() =>
      Object.defineProperty(navigator, "clipboard", {
        value: {
          writeText: async (text: string) =>
            sessionStorage.setItem("test-copied", text),
        },
      }),
    );
    const page = await context.newPage();
    await page.route("**/api/data", (r) => r.fulfill({ json: { user: null } }));
    await page.goto(
      baseURL! + "/?invite=JOIN12&code=test-only&token=test-only",
    );
    const notice = page.getByRole("complementary", {
      name: "Open FITTT in your browser",
    });
    await expect(notice.getByRole("heading")).toContainText(platform);
    await notice.getByRole("button", { name: "Copy FITTT link" }).click();
    await expect(notice.getByRole("status")).toContainText("Link copied");
    expect(
      await page.evaluate(() => sessionStorage.getItem("test-copied")),
    ).toBe(baseURL! + "/?invite=JOIN12");
    expect(
      await page.evaluate(
        () => document.documentElement.scrollWidth <= innerWidth,
      ),
    ).toBe(true);
    await page.screenshot({
      path: `test-results/messenger-${platform.toLowerCase()}.png`,
    });
    await context.close();
  });
}

test("undetected browsers can find instructions and manually copy if clipboard is blocked", async ({
  page,
}) => {
  await page.addInitScript(() =>
    Object.defineProperty(navigator, "clipboard", {
      value: {
        writeText: async () => {
          throw Error("blocked");
        },
      },
    }),
  );
  await page.route("**/api/data", (r) => r.fulfill({ json: { user: null } }));
  await page.goto("/?invite=JOIN12");
  await expect(
    page.getByRole("complementary", { name: "Open FITTT in your browser" }),
  ).toHaveCount(0);
  await page.getByText("Opened from Messenger?", { exact: true }).click();
  await page.getByRole("button", { name: "Copy FITTT link" }).click();
  await expect(page.getByLabel("FITTT link to copy")).toHaveValue(
    /\/?invite=JOIN12$/,
  );
  await expect(page.getByLabel("Email address")).toBeVisible();
});
