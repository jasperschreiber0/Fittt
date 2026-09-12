import { chromium, expect } from "@playwright/test";
import { createInterface } from "node:readline/promises";
// Run only with permission to send a sign-in email to this address.
const email = process.env.FITTT_TEST_EMAIL;
if (!email)
  throw new Error("Set FITTT_TEST_EMAIL to the authorized test recipient");
const browser = await chromium.launch();
const context = await browser.newContext();
const page = await context.newPage();
const base =
  process.env.E2E_BASE_URL || "https://fittt-production.up.railway.app";
const input = createInterface({ input: process.stdin, output: process.stdout });
try {
  if (!process.argv.includes("--verify-only")) {
    await page.goto(base);
    await page.getByLabel("Email address").fill(email);
    await page
      .getByRole("button", { name: "Email me a code", exact: true })
      .click();
    await page.getByLabel("Email code").waitFor();
    await page.reload();
    await page.getByLabel("Email code").waitFor();
    console.log(
      "Code requested; entry screen survived reload. Waiting for delivered code.",
    );
  }
  const token = (await input.question("")).trim();
  // Verify in a second clean browser context: no PKCE cookie from the requester.
  const fresh = await browser.newContext();
  const verified = await fresh.request.post(base + "/api/auth", {
    data: { action: "verify", email, token },
  });
  if (!verified.ok())
    throw new Error("Code verification failed: HTTP " + verified.status());
  const checked = await (await fresh.request.get(base + "/api/data")).json();
  console.log(
    JSON.stringify({
      authenticatedAfterCode: !!checked.user,
      hasProfile: !!checked.profiles?.length,
      cookieCount: (await fresh.cookies()).length,
    }),
  );
  const signedIn = await fresh.newPage();
  await signedIn.goto(base);
  await expect(
    signedIn
      .getByRole("heading", { name: "First, the basics." })
      .or(signedIn.getByRole("button", { name: "Log my day", exact: true })),
  ).toBeVisible();
  await signedIn.reload();
  await expect(
    signedIn
      .getByRole("heading", { name: "First, the basics." })
      .or(signedIn.getByRole("button", { name: "Log my day", exact: true })),
  ).toBeVisible();
  const data = await fresh.request.get(base + "/api/data");
  if (!(await data.json()).user) throw new Error("Session did not persist");
  console.log(
    "PASS: delivered code verified in a different browser context; authenticated app and reload persisted.",
  );
  await fresh.close();
} finally {
  input.close();
  await browser.close();
}
