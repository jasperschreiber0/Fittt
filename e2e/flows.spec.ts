import { test, expect, type BrowserContext } from "@playwright/test";
import { createServerClient } from "@supabase/ssr";
import { createClient } from "@supabase/supabase-js";
import { readFileSync } from "node:fs";
const url = "https://mhsygkmdfrpkmhohieql.supabase.co",
  key = "sb_publishable_oKevlJ0WHzWlKRxvuzoUFA_rMpURFP0";
const accounts = JSON.parse(readFileSync(".env.e2e.json", "utf8")) as {
  id: string;
  name: string;
  email: string;
  password: string;
}[];
async function login(context: BrowserContext, index: number, baseURL: string) {
  const jar: { name: string; value: string }[] = [];
  const s = createServerClient(url, key, {
    cookies: {
      getAll: () => jar,
      setAll: (values) =>
        values.forEach((v) => {
          const i = jar.findIndex((x) => x.name === v.name);
          if (i >= 0) jar[i] = v;
          else jar.push(v);
        }),
    },
  });
  const { error } = await s.auth.signInWithPassword(accounts[index]);
  expect(error).toBeNull();
  await context.addCookies(jar.map((c) => ({ ...c, url: baseURL })));
  return s;
}
test("three user onboarding, challenge, invite, logs, Gold, privacy, progress", async ({
  browser,
  baseURL,
}) => {
  const contexts: BrowserContext[] = [];
  let invite = "";
  for (let i = 0; i < 3; i++) {
    const context = await browser.newContext({
      viewport: { width: 390, height: 844 },
      isMobile: true,
      hasTouch: true,
    });
    contexts.push(context);
    await login(context, i, baseURL!);
    const page = await context.newPage();
    await page.goto(baseURL!);
    await expect(
      page
        .getByLabel("First name", { exact: true })
        .or(page.getByRole("button", { name: "Today", exact: true })),
    ).toBeVisible({ timeout: 15000 });
    if (await page.getByLabel("First name", { exact: true }).isVisible()) {
      await page
        .getByLabel("First name", { exact: true })
        .fill(accounts[i].name);
      await page.getByRole("button", { name: "Save my plan" }).click();
    }
    await expect(page.getByText(`Hey ${accounts[i].name}.`)).toBeVisible();
    await page.getByRole("button", { name: "Friends", exact: true }).click();
    if (i === 0) {
      if (!(await page.getByLabel("Challenge", { exact: true }).isVisible())) {
        await page.getByLabel("Challenge name").fill("FITTT verification");
        await page.getByRole("button", { name: "Create challenge" }).click();
      }
      await expect(
        page.getByText("INVITE CODE", { exact: true }),
      ).toBeVisible();
      invite = (await page.locator(".invite strong").textContent())!;
    } else {
      await page.getByLabel("Invite code", { exact: true }).fill(invite);
      await page
        .getByRole("button", { name: "Join challenge", exact: true })
        .click();
      await expect(page.getByText("You’re in. Let’s do this.")).toBeVisible();
    }
    await page.getByRole("button", { name: "Today", exact: true }).click();
    await page.getByRole("button", { name: /Just want to check in/ }).click();
    await page.getByRole("button", { name: "Done", exact: true }).click();
    await page
      .getByRole("button", { name: "Save check-in", exact: true })
      .click();
    await expect(
      page.getByText("Check-in saved. Back to your life."),
    ).toBeVisible();
    await page.getByRole("button", { name: "Calendar", exact: true }).click();
    const eventName = "Friends dinner " + crypto.randomUUID().slice(0, 6);
    await page.getByRole("button", { name: "Next month", exact: true }).click();
    await page.locator(".calendar-day").first().click();
    await page.getByRole("button", { name: "Add an event" }).click();
    await page.getByLabel("Event name").fill(eventName);
    await page.getByRole("button", { name: "Save event", exact: true }).click();
    await expect(
      page.getByText(
        "Event saved to your calendar. A social life is part of the plan.",
      ),
    ).toBeVisible();
    await page.getByRole("button", { name: "Progress", exact: true }).click();
    await expect(
      page.getByRole("heading", { name: "Your week", exact: true }),
    ).toBeVisible();
    await page.getByRole("button", { name: "More", exact: true }).click();
    await page.getByText("Private weight trend", { exact: true }).click();
    await page.getByLabel("Weight (kg)", { exact: true }).fill(String(80 + i));
    await page.getByRole("button", { name: "Save", exact: true }).click();
    await expect(page.getByText("Private measurement saved.")).toBeVisible();

    await page.getByRole("button", { name: "Friends", exact: true }).click();
    await expect(
      page.getByText(accounts[i].name, { exact: true }),
    ).toBeVisible();
    await page.screenshot({
      path: `test-results/${accounts[i].name}-friends.png`,
      fullPage: true,
    });
  }
  const a = createClient(url, key),
    b = createClient(url, key);
  await a.auth.signInWithPassword(accounts[0]);
  await b.auth.signInWithPassword(accounts[1]);
  const { data: privateRows } = await b
    .from("fittt_weights")
    .select("*")
    .eq("user_id", accounts[0].id);
  expect(privateRows).toEqual([]);
  const { error: writeError } = await b
    .from("fittt_weights")
    .upsert({ user_id: accounts[0].id, day: "2026-09-01", weight: 45 });
  expect(writeError).not.toBeNull();
  for (const table of [
    "tenant_memberships",
    "content_queue",
    "scheduled_posts",
  ]) {
    const r = await b.from(table).select("*");
    expect(r.error || r.data?.length === 0).toBeTruthy();
  }
  const memberships = await a.from("fittt_members").select("*");
  const cid = memberships.data![0].challenge_id;
  const leaderboard = await b.rpc("fittt_leaderboard", { cid });
  expect(leaderboard.error).toBeNull();
  expect(JSON.stringify(leaderboard.data)).not.toMatch(
    /weight|waist|calories|estimate|foods|drinks/,
  );
  for (const c of contexts) await c.close();
});
test("unauthenticated access is denied", async ({ request }) => {
  const r = await request.post("/api/data", {
    data: { action: "weight", weight: 80 },
  });
  expect(r.status()).toBe(401);
});
test("real AI interpretation, correction, idempotent merging and memory", async ({
  browser,
  baseURL,
}) => {
  const context = await browser.newContext();
  await login(context, 0, baseURL!);
  const request = context.request;
  const parsed = await request.post(baseURL + "/api/interpret", {
    data: {
      text: "A chicken wrap for lunch and a 375 ml bottle of 4.8 percent beer. This is only lunch, not my full day.",
    },
  });
  expect(parsed.ok(), await parsed.text()).toBe(true);
  let { estimate } = await parsed.json();
  if (estimate.clarification) {
    const clarified = await request.post(baseURL + "/api/interpret", {
      data: {
        text: "One medium wrap with 150g grilled chicken, salad and one tablespoon mayonnaise, plus one 375ml 4.8% beer. Only lunch.",
        clarified: true,
      },
    });
    expect(clarified.ok()).toBe(true);
    estimate = (await clarified.json()).estimate;
  }
  expect(estimate.foods.length).toBeGreaterThan(0);
  expect(estimate.drinks.length).toBeGreaterThan(0);
  expect(estimate.clarification).toBeNull();
  const id = crypto.randomUUID();
  const payload = { action: "entry", id, estimate, source: "text" };
  expect(
    (await request.post(baseURL + "/api/data", { data: payload })).ok(),
  ).toBe(true);
  expect(
    (await request.post(baseURL + "/api/data", { data: payload })).ok(),
  ).toBe(true);
  let data = await (await request.get(baseURL + "/api/data")).json();
  expect(data.entries.filter((e: { id: string }) => e.id === id)).toHaveLength(
    1,
  );
  const changed = structuredClone(estimate);
  changed.foods[0].caloriesLow = 450;
  changed.foods[0].caloriesHigh = 650;
  expect(
    (
      await request.post(baseURL + "/api/data", {
        data: { ...payload, estimate: changed },
      })
    ).ok(),
  ).toBe(true);
  expect(
    (
      await request.post(baseURL + "/api/data", {
        data: { action: "memory", name: "test usual lunch", estimate: changed },
      })
    ).ok(),
  ).toBe(true);
  const remembered = await (
    await request.post(baseURL + "/api/interpret", {
      data: { text: "test usual lunch" },
    })
  ).json();
  expect(remembered.cached).toBe(true);
  const next = crypto.randomUUID();
  await request.post(baseURL + "/api/data", { data: { ...payload, id: next } });
  data = await (await request.get(baseURL + "/api/data")).json();
  expect(data.entries.some((e: { id: string }) => e.id === id)).toBe(true);
  expect(data.entries.some((e: { id: string }) => e.id === next)).toBe(true);
  const closedDay = new Date(Date.now() - 86400000).toISOString().slice(0, 10);
  const completed = await request.post(baseURL + "/api/data", {
    data: {
      ...payload,
      id: crypto.randomUUID(),
      day: closedDay,
      estimate: { ...estimate, completeDay: true },
    },
  });
  expect(completed.ok()).toBe(true);
  const afterCompletion = await (
    await request.get(baseURL + "/api/data")
  ).json();
  expect(
    afterCompletion.days.find((d: { day: string }) => d.day === closedDay).data
      .complete,
  ).toBe(true);
  const safety = await (
    await request.post(baseURL + "/api/interpret", {
      data: { text: "Should I purge dinner to compensate?" },
    })
  ).json();
  expect(safety.safety).toBe(true);
  const page = await context.newPage();
  await page.goto(baseURL!);
  await expect(page.getByRole("button", { name: "Log my day" })).toBeVisible();
  await page.screenshot({
    path: "test-results/today-mobile.png",
    fullPage: true,
  });
  await context.close();
});
