import { test, expect, type Page } from "@playwright/test";

test("the installed service worker displays a delivered push notification", async ({
  page,
  context,
  baseURL,
}) => {
  test.skip(
    !process.env.FITTT_DEVICE_PUSH,
    "Requires a browser environment that grants real notification display permission; this host denies it.",
  );
  await context.grantPermissions(["notifications"], {
    origin: new URL(baseURL!).origin,
  });
  const cdp = await context.newCDPSession(page);
  let registrationId = "";
  cdp.on("ServiceWorker.workerRegistrationUpdated", (event) => {
    const registration = event.registrations.find(
      (r: { scopeURL: string }) => r.scopeURL === baseURL + "/",
    );
    if (registration) registrationId = registration.registrationId;
  });
  await cdp.send("ServiceWorker.enable");
  await page.goto("/");
  await page.evaluate(async () => {
    await navigator.serviceWorker.register("/sw.js");
    await navigator.serviceWorker.ready;
  });
  await expect.poll(() => registrationId).not.toBe("");
  // Ensure the browser can actually display notifications in this environment.
  await page.evaluate(async () => {
    const r = await navigator.serviceWorker.ready;
    await r.showNotification("FITTT test", { tag: "fittt-display-check" });
  });
  await expect
    .poll(() =>
      page.evaluate(async () =>
        (await (await navigator.serviceWorker.ready).getNotifications()).map(
          (n) => n.tag,
        ),
      ),
    )
    .toContain("fittt-display-check");
  await cdp.send("ServiceWorker.deliverPushMessage", {
    origin: new URL(baseURL!).origin,
    registrationId,
    data: JSON.stringify({
      body: "Synthetic FITTT reminder verification",
      tag: "fittt-test",
    }),
  });
  await expect
    .poll(() =>
      page.evaluate(async () => {
        const registration = await navigator.serviceWorker.ready;
        const notifications = await registration.getNotifications();
        return notifications.map((n) => n.tag);
      }),
    )
    .toContain("fittt-test");
  await page.evaluate(async () => {
    const r = await navigator.serviceWorker.ready;
    for (const n of await r.getNotifications()) n.close();
  });
});
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
  start: "2026-09-01",
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
async function app(page: Page) {
  await page.route("**/api/data", (r) =>
    r.fulfill({
      json:
        r.request().method() === "GET"
          ? {
              user: { id: "demo", email: "demo@example.com" },
              profiles: [{ data: profile }],
            }
          : { ok: true },
    }),
  );
  await page.route("**/api/review", (r) => r.fulfill({ json: { ok: true } }));
  await page.goto("/");
  await page.getByRole("button", { name: "More", exact: true }).click();
}
test("notifications require an explicit tap, each time can be switched off, and device can unsubscribe", async ({
  page,
}) => {
  await page.addInitScript(() => {
    Object.defineProperty(navigator, "userAgent", {
      value: "Mozilla/5.0 (Linux; Android 14) Chrome/130 Mobile Safari/537.36",
    });
    Object.defineProperty(window, "PushManager", { value: class {} });
    Object.defineProperty(window, "Notification", {
      value: class {
        static permission = "default";
        static async requestPermission() {
          localStorage.setItem("test-permission-requested", "yes");
          this.permission = "granted";
          return "granted";
        }
      },
    });
    const subscription = {
      endpoint: "https://fcm.googleapis.com/mock",
      toJSON: () => ({ keys: { p256dh: "test", auth: "test" } }),
      unsubscribe: async () => true,
    };
    let subscribed = false;
    const registration = {
      pushManager: {
        getSubscription: async () => (subscribed ? subscription : null),
        subscribe: async () => {
          subscribed = true;
          return subscription;
        },
      },
    };
    Object.defineProperty(navigator, "serviceWorker", {
      value: {
        register: async () => registration,
        ready: Promise.resolve(registration),
      },
    });
  });
  const requests: Record<string, unknown>[] = [];
  await page.route("**/api/push", (r) => {
    if (r.request().method() === "POST") {
      requests.push(r.request().postDataJSON());
      return r.fulfill({ json: { ok: true } });
    }
    return r.fulfill({
      json: {
        publicKey: Buffer.alloc(65, 1).toString("base64url"),
        subscriptions: [],
      },
    });
  });
  await app(page);
  const settings = page.getByRole("region", { name: "Daily reminders" });
  await expect(
    settings.getByRole("button", { name: "Enable reminders" }),
  ).toBeEnabled();
  expect(
    await page.evaluate(() =>
      localStorage.getItem("test-permission-requested"),
    ),
  ).toBeNull();
  await settings.getByRole("button", { name: "Enable reminders" }).click();
  await expect(settings).toContainText("Reminders saved on this device.");
  expect(requests[0]).toMatchObject({
    action: "save",
    lunch: true,
    evening: true,
  });
  await settings.getByLabel("Lunch · 12pm").uncheck();
  await expect(settings.getByRole("status")).toHaveText(
    "Reminder times saved.",
  );
  expect(requests[1]).toMatchObject({ lunch: false, evening: true });
  await settings
    .getByRole("button", { name: "Turn off on this device" })
    .click();
  await expect(settings).toContainText(
    "Reminders switched off on this device.",
  );
  expect(requests[2].action).toBe("remove");
});
test("iPhone browser explains Home Screen installation before requesting permission", async ({
  page,
}) => {
  await page.addInitScript(() =>
    Object.defineProperty(navigator, "userAgent", {
      value:
        "Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X) AppleWebKit/605.1.15 Version/18.0 Mobile Safari/604.1",
    }),
  );
  await app(page);
  const settings = page.getByRole("region", { name: "Daily reminders" });
  await expect(settings).toContainText("Add to Home Screen");
  await expect(
    settings.getByRole("button", { name: "Enable reminders" }),
  ).toHaveCount(0);
});
