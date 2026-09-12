import { test, expect } from "@playwright/test";

test("code entry survives reload; invalid codes can be retried; successful verification opens onboarding", async ({
  page,
}) => {
  let authenticated = false;
  await page.route("**/api/data", (route) =>
    route.fulfill({
      json: {
        user: authenticated
          ? { id: "test-user", email: "test@example.com" }
          : null,
      },
    }),
  );
  await page.route("**/api/auth", async (route) => {
    const body = route.request().postDataJSON();
    if (body.action === "verify" && body.token !== "12345678")
      return route.fulfill({
        status: 400,
        json: { error: "That code is invalid or expired." },
      });
    if (body.action === "verify") authenticated = true;
    await route.fulfill({ json: { ok: true } });
  });
  await page.goto("/");
  await page.getByLabel("Email address").fill("test@example.com");
  await page
    .getByRole("button", { name: "Email me a code", exact: true })
    .click();
  await expect(page.getByLabel("Email code")).toBeVisible();
  await page.reload();
  await expect(page.getByLabel("Email code")).toBeVisible();
  await expect(page.getByLabel("Email address")).toHaveValue(
    "test@example.com",
  );
  await page.getByLabel("Email code").fill("00000000");
  await page.getByRole("button", { name: "Verify code" }).click();
  await expect(page.locator("main").getByRole("alert")).toContainText("invalid or expired");
  await page.getByLabel("Email code").fill("12345678");
  await page.getByRole("button", { name: "Verify code" }).click();
  await expect(
    page.getByRole("heading", { name: "First, the basics." }),
  ).toBeVisible();
});

test("failed old links show recovery and email can be changed", async ({
  page,
}) => {
  await page.route("**/api/data", (route) =>
    route.fulfill({ json: { user: null } }),
  );
  await page.route("**/api/auth", (route) =>
    route.fulfill({ json: { ok: true } }),
  );
  await page.goto("/?authError=1");
  await expect(page.locator("main").getByRole("alert")).toContainText(
    "Request a new email code",
  );
  await page.getByLabel("Email address").fill("wrong@example.com");
  await page
    .getByRole("button", { name: "Email me a code", exact: true })
    .click();
  await page.getByRole("button", { name: "Change email" }).click();
  await expect(page.getByLabel("Email code")).not.toBeVisible();
  await expect(page.getByLabel("Email address")).toBeEditable();
});

test("malformed authentication requests return a useful error, not a server failure", async ({
  request,
}) => {
  const response = await request.post("/api/auth", {
    data: { action: "verify", email: "bad", token: "abc" },
  });
  expect(response.status()).toBe(400);
  expect((await response.json()).error).toContain("valid email");
});
