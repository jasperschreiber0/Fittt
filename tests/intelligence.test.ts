import { describe, it, expect } from "vitest";
import {
  activitySummary,
  addDays,
  buildReview,
  dueReviewEnd,
  forecast,
  dailyIntelligence,
  type Context,
} from "../lib/intelligence";
import {
  estimateSchema,
  interpretationSchema,
  targets,
  type Entry,
  type Profile,
} from "../lib/engine";
const p: Profile = {
  name: "Test",
  age: 35,
  sex: "male",
  height: 180,
  weight: 90,
  goal: "lose",
  training: 3,
  activity: "moderate",
  difficulty: "balanced",
  alcoholFrequency: 1,
  start: "2026-08-01",
  timezone: "Australia/Sydney",
  targetWeight: 87,
  waist: null,
  calorieLow: null,
  calorieHigh: null,
  protein: null,
  share: false,
  minimum: "Normal meals",
  reviewReminder: false,
};
const end = "2026-09-12";
function entry(day: string, calories = 2400): Entry {
  return {
    id: day,
    day,
    source: "text",
    estimate: {
      foods: [
        {
          name: "day food",
          quantity: "reported day",
          caloriesLow: calories - 100,
          caloriesHigh: calories + 100,
          proteinLow: 145,
          proteinHigh: 155,
          standardDrinks: 0,
        },
      ],
      drinks: [],
      exercise: [],
      steps: 9000,
      confidence: "high",
      assumptions: [],
      clarification: null,
      safetyConcern: false,
      completeDay: true,
    },
  };
}
const context = (): Context => ({
  profile: { ...p },
  entries: Array.from({ length: 28 }, (_, i) => entry(addDays(end, -i))),
  days: [],
  weights: [
    { day: "2026-08-22", weight: 89.5 },
    { day: "2026-08-29", weight: 89.2 },
    { day: "2026-09-05", weight: 89 },
    { day: "2026-09-12", weight: 88.8 },
  ],
  events: [],
});
describe("daily and weekly intelligence", () => {
  it("uses seven completed local days, across DST and Sunday morning boundary", () => {
    expect(
      dueReviewEnd("Australia/Sydney", new Date("2026-09-12T19:59:00Z")),
    ).toBe("2026-09-05");
    expect(
      dueReviewEnd("Australia/Sydney", new Date("2026-09-12T20:00:00Z")),
    ).toBe("2026-09-12");
    expect(
      dueReviewEnd("Australia/Sydney", new Date("2026-10-03T19:00:00Z")),
    ).toBe("2026-10-03");
  });
  it("does not extrapolate partial logs to a full week or count Fast Mode as calories", () => {
    const c = context();
    c.entries = [entry(end)];
    c.entries[0].estimate.completeDay = false;
    c.days = [
      {
        day: end,
        data: {
          food: "on",
          training: "rest",
          alcohol: "none",
          complete: true,
          minimum: true,
        },
      },
    ];
    const r = buildReview(c, end);
    expect(r.summary.weeklyCalories).toBeNull();
    expect(r.summary.average).toBeNull();
    expect(r.summary.completeDays).toBe(0);
    expect(r.summary.loggedDays).toBe(1);
    expect(r.plan.flexibility).toBeNull();
    expect(r.interpretation).toContain("unknown, not zero");
  });
  it("uses daily step maximum rather than adding cumulative readings and deduplicates retries", () => {
    const c = context();
    const a = entry(end),
      b = { ...entry(end), id: "second" };
    a.estimate.steps = 5000;
    b.estimate.steps = 9200;
    c.entries = [a, a, b];
    expect(dailyIntelligence(c, end).steps).toBe(9200);
    expect(dailyIntelligence(c, end).sum.caloriesLow).toBe(4600);
  });
  it("keeps exercise burn informational and never increases food allowance", () => {
    const c = context(),
      before = buildReview(c, end).plan.calories;
    c.entries[0].estimate.activity = [
      {
        kind: "weights",
        description: "weights",
        minutes: 45,
        durationBasis: "reported",
      },
    ];
    const a = activitySummary([c.entries[0]], 90);
    expect(a.energy).toEqual({ low: 169, high: 338 });
    expect(a.training).toBe(true);
    expect(buildReview(c, end).plan.calories).toBe(before);
  });
  it("does not count a normal walk as a training session or invent minutes", () => {
    const e = entry(end);
    e.estimate.exercise = ["walk"];
    e.estimate.activity = [
      {
        kind: "walk",
        description: "walk",
        minutes: null,
        durationBasis: "unknown",
      },
    ];
    expect(activitySummary([e], 90).training).toBe(false);
    expect(activitySummary([e], 90).energy).toBeNull();
  });
  it("summarises whole-week ranges and high confidence", () => {
    const r = buildReview(context(), end);
    expect(r.summary.weeklyCalories).toEqual({ low: 16100, high: 17500 });
    expect(r.summary.average).toEqual({ low: 2300, high: 2500 });
    expect(r.summary.confidence).toBe("high");
    expect(r.summary.proteinDays).toBe(7);
  });
  it("withholds forecasts for sparse, stale, future-only or extreme weight changes", () => {
    const c = context();
    c.weights = c.weights.slice(0, 2);
    expect(forecast(c, end).projected).toBeNull();
    c.weights = [{ day: addDays(end, 1), weight: 80 }];
    expect(forecast(c, end).projected).toBeNull();
    c.weights = context().weights.map((w) => ({
      ...w,
      day: addDays(w.day, -10),
    }));
    expect(forecast(c, end).projected).toBeNull();
    c.weights = context().weights.map((w, i) => ({
      ...w,
      weight: 100 - i * 4,
    }));
    expect(forecast(c, end).projected).toBeNull();
  });
  it("bounds changes to one small adjustment and keeps training at the chosen target", () => {
    const c = context();
    c.profile.targetWeight = 86;
    c.weights = c.weights.map((w) => ({ ...w, weight: 89 }));
    const r = buildReview(c, end);
    const t = targets(c.profile);
    expect(r.plan.adjustment).toBeGreaterThanOrEqual(-100);
    expect(r.plan.calories).toBeGreaterThanOrEqual(t.bmr);
    expect(r.plan.trainingDays).toBe(3);
    expect(r.plan.steps).toBe(9000);
  });
  it("does not tighten after a large drinking day or reward inadequate intake", () => {
    const c = context();
    c.entries[0].estimate.drinks = [
      {
        name: "beer",
        quantity: "15",
        caloriesLow: 2100,
        caloriesHigh: 3000,
        proteinLow: 0,
        proteinHigh: 0,
        standardDrinks: 21,
      },
    ];
    const r = buildReview(c, end);
    expect(r.forecast.status).toBe("Recovery first");
    expect(r.plan.flexibility).toBeNull();
    expect(dailyIntelligence(c, end).message).toContain("000");
    c.entries[0] = entry(end, 500);
    expect(buildReview(c, end).plan.reason).toContain("Recovery");
  });
  it("never chases an implausible goal deadline", () => {
    const c = context();
    c.profile.targetWeight = 50;
    const r = buildReview(c, end);
    expect(r.forecast.status).toBe("Review goal & timeframe");
    expect(r.plan.reason).toContain("timeframe");
  });
  it("incorporates events without inventing flexibility from incomplete data", () => {
    const c = context();
    c.events = [{ day: addDays(end, 5), name: "Wedding", size: "Big one" }];
    c.entries = [];
    const r = buildReview(c, end);
    expect(r.plan.upcoming[0].name).toBe("Wedding");
    expect(r.plan.flexibility).toBeNull();
    expect(r.plan.tips.join(" ")).toContain("Eat normally");
  });
  it("event allocation stays inside the weekly range without reducing normal meals", () => {
    const c = context();
    c.profile.goal = "maintain";
    c.profile.targetWeight = 89;
    c.weights = c.weights.map((w) => ({ ...w, weight: 89 }));
    c.events = [{ day: addDays(end, 5), name: "Dinner", size: "Dinner" }];
    const r = buildReview(c, end);
    expect(r.plan.flexibility).not.toBeNull();
    expect(
      r.plan.eventDayHigh! + 6 * r.plan.normalDayCalories,
    ).toBeLessThanOrEqual(targets(c.profile).high * 7);
    expect(r.plan.normalDayCalories).toBeGreaterThanOrEqual(
      targets(c.profile).low,
    );
  });
  it("accepts older saved estimates but requires structured fields from new AI responses", () => {
    const e = entry(end).estimate;
    expect(estimateSchema.safeParse(e).success).toBe(true);
    expect(interpretationSchema.safeParse(e).success).toBe(false);
  });
});
