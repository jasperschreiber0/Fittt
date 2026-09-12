import { test, expect } from "@playwright/test";
import { createServerClient } from "@supabase/ssr";
import { readFileSync } from "node:fs";
import { dueReviewEnd, addDays } from "../lib/intelligence";
import { dateInZone, type Profile } from "../lib/engine";
const accounts = JSON.parse(readFileSync(".env.e2e.json", "utf8"));
const url = "https://mhsygkmdfrpkmhohieql.supabase.co",
  key = "sb_publishable_oKevlJ0WHzWlKRxvuzoUFA_rMpURFP0";
test("real private recap is generated, reused and isolated from a second account", async ({
  browser,
  baseURL,
}) => {
  const jar: { name: string; value: string }[] = [];
  const s = createServerClient(url, key, {
    cookies: {
      getAll: () => jar,
      setAll: (values) =>
        values.forEach((v) => {
          const i = jar.findIndex((c) => c.name === v.name);
          if (i >= 0) jar[i] = v;
          else jar.push(v);
        }),
    },
  });
  expect((await s.auth.signInWithPassword(accounts[2])).error).toBeNull();
  const today = dateInZone(),
    end = dueReviewEnd("Australia/Sydney");
  const p: Profile = {
    name: "Taylor",
    age: 35,
    sex: "male",
    height: 180,
    weight: 90,
    goal: "maintain",
    training: 3,
    activity: "moderate",
    difficulty: "balanced",
    alcoholFrequency: 1,
    start: addDays(end, -35),
    timezone: "Australia/Sydney",
    targetWeight: 89,
    waist: null,
    calorieLow: null,
    calorieHigh: null,
    protein: null,
    share: false,
    minimum: "Regular meals",
    reviewReminder: false,
  };
  expect(
    (
      await s
        .from("fittt_profiles")
        .upsert({ user_id: accounts[2].id, data: p })
    ).error,
  ).toBeNull();
  expect(
    (await s.from("fittt_entries").delete().eq("user_id", accounts[2].id))
      .error,
  ).toBeNull();
  const entries = Array.from({ length: 21 }, (_, i) => ({
    id: crypto.randomUUID(),
    user_id: accounts[2].id,
    day: addDays(end, -i),
    source: "text",
    estimate: {
      foods: [
        {
          name: "synthetic meals",
          quantity: "day",
          caloriesLow: 2400,
          caloriesHigh: 2700,
          proteinLow: 145,
          proteinHigh: 165,
          standardDrinks: 0,
        },
      ],
      drinks: [],
      exercise: i % 2 ? ["weights"] : [],
      activity:
        i % 2
          ? [
              {
                kind: "weights",
                description: "weights",
                minutes: 45,
                durationBasis: "reported",
              },
            ]
          : [],
      steps: 9000,
      stepsBasis: "reported",
      confidence: "high",
      assumptions: [],
      clarification: null,
      completeDay: true,
      safetyConcern: false,
    },
  }));
  expect((await s.from("fittt_entries").insert(entries)).error).toBeNull();
  expect(
    (
      await s.from("fittt_weights").upsert(
        [0, 7, 14, 21].map((i) => ({
          user_id: accounts[2].id,
          day: addDays(end, -i),
          weight: 89,
        })),
      )
    ).error,
  ).toBeNull();
  const context = await browser.newContext({
    viewport: { width: 390, height: 844 },
  });
  try {
    await context.addCookies(jar.map((c) => ({ ...c, url: baseURL! })));
    const response = await context.request.post(baseURL + "/api/review");
    expect(response.status()).toBe(200);
    const { data: reviews, error } = await s
      .from("fittt_reviews")
      .select("*")
      .eq("review_end", end);
    expect(error).toBeNull();
    expect(reviews).toHaveLength(1);
    expect(reviews![0].payload.summary.completeDays).toBe(7);
    expect(reviews![0].payload.forecast.projected).toBe(89);
    const stamp = reviews![0].generated_at;
    expect((await context.request.post(baseURL + "/api/review")).status()).toBe(
      200,
    );
    expect(
      (
        await s
          .from("fittt_reviews")
          .select("generated_at")
          .eq("review_end", end)
          .single()
      ).data?.generated_at,
    ).toBe(stamp);
    expect(
      (
        await s.from("fittt_reviews").insert({
          user_id: accounts[2].id,
          review_end: today,
          input_hash: "forged",
          payload: {},
        })
      ).error,
    ).not.toBeNull();
    expect(
      (await s.from("fittt_review_jobs").select("id")).error,
    ).not.toBeNull();
    const page = await context.newPage();
    await page.goto(baseURL!);
    await page.getByRole("button", { name: "Progress", exact: true }).click();
    await expect(
      page.getByText("7/7 complete food days", { exact: true }),
    ).toBeVisible();
    await page.getByText("Your 90-day trajectory", { exact: true }).click();
    await expect(page.getByText("89.0 kg", { exact: true })).toBeVisible();
    await s.auth.signOut({ scope: "local" });
    expect((await s.auth.signInWithPassword(accounts[1])).error).toBeNull();
    const other = await s
      .from("fittt_reviews")
      .select("*")
      .eq("user_id", accounts[2].id);
    expect(other.error).toBeNull();
    expect(other.data).toEqual([]);
    const worker = await context.request.post(
      url + "/functions/v1/fittt-weekly",
      { headers: { "x-fittt-job": crypto.randomUUID() } },
    );
    expect(worker.status()).toBe(401);
  } finally {
    await context.close();
    await s.auth.signOut({ scope: "local" });
  }
});
