import { test, expect, chromium } from "@playwright/test";
import { createServerClient, createChunks } from "@supabase/ssr";
import { readFileSync, mkdirSync } from "node:fs";

// Run with disposable fixtures. Never capture authentication cookies in traces.
test.use({ trace: "off" });
test("real session renews and survives closing and reopening the browser", async ({
  baseURL,
}, info) => {
  const [account] = JSON.parse(readFileSync(".env.e2e.json", "utf8"));
  let jar: { name: string; value: string; options: { maxAge?: number } }[] = [];
  const client = createServerClient(
    "https://mhsygkmdfrpkmhohieql.supabase.co",
    "sb_publishable_oKevlJ0WHzWlKRxvuzoUFA_rMpURFP0",
    {
      cookies: {
        getAll: () => jar,
        setAll: (values) => {
          jar = values;
        },
      },
    },
  );
  const { error } = await client.auth.signInWithPassword(account);
  expect(error).toBeNull();
  const name = "sb-mhsygkmdfrpkmhohieql-auth-token";
  const stored = jar
    .filter((c) => c.name.startsWith(name))
    .sort((a, b) => a.name.localeCompare(b.name))
    .map((c) => c.value)
    .join("");
  const session = JSON.parse(
    Buffer.from(stored.slice(7), "base64url").toString(),
  );
  // Expire the local freshness timestamp, preserving the genuine signed token
  // and refresh credential. The production server must renew with Supabase.
  session.expires_at = Math.floor(Date.now() / 1000) - 60;
  const chunks = createChunks(
    name,
    "base64-" + Buffer.from(JSON.stringify(session)).toString("base64url"),
  );
  const profile = info.outputPath("browser-profile");
  mkdirSync(profile, { recursive: true });
  const options = { headless: true, viewport: { width: 390, height: 844 } };
  let context = await chromium.launchPersistentContext(profile, options);
  try {
    await context.addCookies(
      chunks.map((c) => ({
        ...c,
        url: baseURL!,
        expires: Date.now() / 1000 + 86400 * 400,
        sameSite: "Lax" as const,
      })),
    );
    const response = await context.request
      .get(baseURL! + "/api/data")
      .catch(() => {
        // Playwright request errors include Cookie headers. Never print them.
        throw new Error("Session check could not reach the application server");
      });
    expect(response.status()).toBe(200);
    expect((await response.json()).user?.id).toBe(account.id);
    const renewed = response
      .headersArray()
      .filter((h) => h.name.toLowerCase() === "set-cookie");
    expect(renewed.length).toBeGreaterThan(0);
    expect(renewed.some((h) => /Max-Age=34560000/i.test(h.value))).toBe(true);
    expect(response.headers()["cache-control"]).toContain("no-store");
    await context.close();
    context = await chromium.launchPersistentContext(profile, options);
    const page = await context.newPage();
    let codeRequests = 0;
    page.on("request", (r) => {
      if (r.url().endsWith("/api/auth")) codeRequests++;
    });
    await page.goto(baseURL!);
    await expect(
      page.getByRole("heading", { name: "First, the basics." }),
    ).toBeVisible();
    expect(codeRequests).toBe(0);
    expect(
      (await context.cookies())
        .filter((c) => c.name.startsWith(name))
        .every((c) => c.expires > Date.now() / 1000 + 86400 * 90),
    ).toBe(true);
  } finally {
    await context.close();
    await client.auth.signOut({ scope: "local" });
  }
});
