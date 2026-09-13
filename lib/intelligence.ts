import {
  dayDiff,
  dateInZone,
  mergeEntries,
  targets,
  weightTrend,
  type Profile,
  type Entry,
  type Fast,
  type Weight,
} from "./engine.ts";

export type Context = {
  profile: Profile;
  entries: Entry[];
  days: { day: string; data: Fast }[];
  weights: Weight[];
  events: { day: string; name: string; size: string }[];
};
export const addDays = (day: string, n: number) =>
  new Date(Date.parse(day + "T12:00:00Z") + n * 86400000)
    .toISOString()
    .slice(0, 10);
const round = (n: number, step = 1) => Math.round(n / step) * step;
const avg = (a: number[]) =>
  a.length ? a.reduce((s, n) => s + n, 0) / a.length : null;
export function dueReviewEnd(zone: string, now = new Date()) {
  const today = dateInZone(zone, now);
  const dow = new Date(today + "T12:00:00Z").getUTCDay();
  const hour = Number(
    new Intl.DateTimeFormat("en-GB", {
      timeZone: zone,
      hour: "2-digit",
      hourCycle: "h23",
    }).format(now),
  );
  return addDays(today, -(dow + 1) - (dow === 0 && hour < 6 ? 7 : 0));
}
export function activitySummary(entries: Entry[], weight: number) {
  const activities = [
    ...new Map(
      entries
        .flatMap((e) => e.estimate.activity || [])
        .map((a) => [
          a.kind + ":" + a.description.toLowerCase() + ":" + a.minutes,
          a,
        ]),
    ).values(),
  ];
  const timed = activities.filter(
    (a) => a.minutes !== null && a.kind !== "other",
  );
  const bands = {
    weights: [3.5, 6],
    cardio: [4, 8],
    walk: [2.8, 4.8],
    other: [1, 1],
  };
  // Net MET estimate above resting expenditure. Never added to TDEE or calorie targets.
  const energy = timed.length
    ? {
        low: round(
          timed.reduce(
            (s, a) => s + ((bands[a.kind][0] - 1) * weight * a.minutes!) / 60,
            0,
          ),
        ),
        high: round(
          timed.reduce(
            (s, a) => s + ((bands[a.kind][1] - 1) * weight * a.minutes!) / 60,
            0,
          ),
        ),
      }
    : null;
  const descriptions = [
    ...new Set(entries.flatMap((e) => e.estimate.exercise)),
  ];
  const training =
    activities.some((a) => a.kind === "weights" || a.kind === "cardio") ||
    descriptions.some((s) =>
      /weights|strength|resistance|gym|run|swim|cycl|cardio|rowing|pilates|yoga/i.test(
        s,
      ),
    );
  return {
    activities,
    descriptions,
    training,
    energy,
    timedCount: timed.length,
  };
}
export function forecast(c: Context, asOf: string) {
  const p = c.profile;
  const finish = addDays(p.start, 89),
    remaining = Math.max(0, dayDiff(finish, asOf));
  const weights = [
    ...new Map(
      c.weights
        .filter((w) => w.day <= asOf && w.day >= p.start)
        .map((w) => [w.day, w]),
    ).values(),
  ];
  const trend = weightTrend(weights).filter((w) => dayDiff(asOf, w.day) <= 28);
  const first = trend[0],
    last = trend.at(-1);
  const empty = {
    remaining,
    finish,
    current: last?.average ?? null,
    projected: null as number | null,
    low: null as number | null,
    high: null as number | null,
    gap: null as number | null,
    rate: null as number | null,
    goal: p.targetWeight,
    status: "Needs more weigh-ins",
    reason:
      "To estimate your finishing weight, add at least four weigh-ins across two weeks, including one in the last seven days. Your weights stay private.",
  };
  if (
    !first ||
    !last ||
    trend.length < 4 ||
    dayDiff(last.day, first.day) < 14 ||
    dayDiff(asOf, last.day) > 7
  )
    return empty;
  const rate = (last.average - first.average) / dayDiff(last.day, first.day);
  if (Math.abs(rate * 7) > last.average * 0.01)
    return {
      ...empty,
      status: "Trend needs care",
      reason:
        "Weight is changing quickly. Keep regular meals and discuss the trend with a qualified professional; FITTT will not tighten your plan.",
    };
  const projected = round(last.average + rate * remaining, 0.1),
    uncertainty = Math.max(0.5, remaining * 0.025);
  const gap =
    p.targetWeight === null ? null : round(projected - p.targetWeight, 0.1);
  let status = "Trend available";
  if (remaining === 0) status = "Challenge complete";
  else if (gap !== null)
    status =
      p.goal === "lose"
        ? gap > uncertainty
          ? "Slightly behind"
          : "On track"
        : p.goal === "gain"
          ? gap < -uncertainty
            ? "Slightly behind"
            : "On track"
          : Math.abs(gap) > uncertainty
            ? "Outside goal range"
            : "On track";
  return {
    ...empty,
    current: round(last.average, 0.1),
    projected,
    low: round(projected - uncertainty, 0.1),
    high: round(projected + uncertainty, 0.1),
    gap,
    rate,
    status,
    reason:
      "A continuation of your recent weight trend, not a guaranteed outcome. The range allows for uncertainty; it is not a medical prediction.",
  };
}
export function dailyIntelligence(c: Context, day: string) {
  const entries = c.entries.filter((e) => e.day === day),
    sum = mergeEntries(entries),
    activity = activitySummary(entries, c.profile.weight);
  const stepsKnown = entries.some((e) => e.estimate.steps !== null);
  const highAlcohol = sum.drinks >= 10;
  const weekStart = addDays(
    day,
    -((new Date(day + "T12:00:00Z").getUTCDay() + 6) % 7),
  );
  const trainingDays = Array.from(
    { length: dayDiff(day, weekStart) + 1 },
    (_, i) => addDays(weekStart, i),
  ).filter(
    (date) =>
      activitySummary(
        c.entries.filter((e) => e.day === date),
        c.profile.weight,
      ).training ||
      c.days.some((d) => d.day === date && d.data.training === "done"),
  ).length;
  return {
    sum,
    activity,
    trainingDays,
    steps: stepsKnown ? sum.steps : null,
    stepsBasis: entries.some(
      (e) =>
        e.estimate.steps === sum.steps && e.estimate.stepsBasis === "estimated",
    )
      ? "estimated"
      : "reported",
    forecast: forecast(c, day),
    confidence: entries.length
      ? entries.some((e) => e.estimate.confidence === "low")
        ? "low"
        : entries.every((e) => e.estimate.confidence === "high")
          ? "high"
          : "medium"
      : "unknown",
    context: entries.map((e) => e.estimate.dayContext).filter(Boolean),
    message: highAlcohol
      ? "That is a high alcohol intake. Keep the log honest; no food restriction or extra exercise to compensate. If someone is hard to wake, confused or breathing slowly, call emergency services (000 in Australia)."
      : sum.unsafe
        ? "Keep regular meals and comfortable movement. FITTT will not recommend restriction or compensatory exercise."
        : !sum.complete
          ? "Saved so far. Rough portions and a complete-day check make the next recommendation more useful."
          : "Day saved. We’ll look at the whole week, including your social plans.",
  };
}
export function buildReview(c: Context, end: string) {
  const p = c.profile,
    start = addDays(end, -6),
    t = targets(p);
  const dates = Array.from({ length: 7 }, (_, i) => addDays(start, i));
  const daily = dates.map((day) => ({
    day,
    ...dailyIntelligence(c, day),
    check: c.days.find((d) => d.day === day)?.data,
  }));
  const complete = daily.filter((d) => d.sum.complete),
    logged = daily.filter(
      (d) => c.entries.some((e) => e.day === d.day) || d.check?.complete,
    );
  const unique = [
    ...new Map(
      c.entries
        .filter((e) => e.day >= start && e.day <= end)
        .map((e) => [e.id, e]),
    ).values(),
  ];
  const sums = mergeEntries(unique);
  const completeLow = complete.reduce((s, d) => s + d.sum.caloriesLow, 0),
    completeHigh = complete.reduce((s, d) => s + d.sum.caloriesHigh, 0);
  const confidence =
    complete.length === 7 &&
    unique.every((e) => e.estimate.confidence === "high")
      ? "high"
      : complete.length >= 5 &&
          !unique.some((e) => e.estimate.confidence === "low")
        ? "moderate"
        : "limited";
  const f = forecast(c, end),
    recentStart = addDays(end, -27);
  const history = Array.from({ length: 28 }, (_, i) =>
    addDays(recentStart, i),
  ).map((day) => ({ day, ...dailyIntelligence(c, day) }));
  const historyComplete = history.filter((d) => d.sum.complete);
  const under = daily.some(
    (d) => d.sum.complete && d.sum.caloriesHigh < t.low * 0.75,
  );
  const safe =
    !sums.unsafe &&
    !under &&
    !daily.some((d) => d.sum.drinks >= 10) &&
    f.status !== "Trend needs care";
  const baseMid = (t.low + t.high) / 2;
  const directionOk =
    p.targetWeight === null ||
    (p.goal === "lose"
      ? p.targetWeight < p.weight
      : p.goal === "gain"
        ? p.targetWeight > p.weight
        : true);
  const goalSafe =
    p.targetWeight === null ||
    (p.targetWeight / (p.height / 100) ** 2 >= 18.5 &&
      (f.current === null ||
        f.remaining === 0 ||
        Math.abs(p.targetWeight - f.current) / (f.remaining / 7) <=
          f.current * 0.0075));
  let adjustment = 0;
  if (
    safe &&
    directionOk &&
    goalSafe &&
    complete.length >= 5 &&
    historyComplete.length >= 10 &&
    f.projected !== null &&
    f.gap !== null &&
    f.remaining >= 14 &&
    f.status === "Slightly behind"
  ) {
    // Small heuristic nudge, never a debt repayment or an exact kcal-to-weight promise.
    const proposed = round((-f.gap * 7700) / f.remaining, 25);
    adjustment =
      p.goal === "lose"
        ? Math.max(-100, Math.min(0, proposed))
        : p.goal === "gain"
          ? Math.min(100, Math.max(0, proposed))
          : 0;
  }
  const floor = Math.max(t.bmr, 1200, t.tdee * 0.8);
  const calories = Math.ceil(Math.max(floor, baseMid + adjustment));
  const stepHistory = history
    .filter((d) => d.steps !== null)
    .map((d) => d.steps!);
  const stepAverage = avg(stepHistory);
  const steps = stepHistory.length >= 5 ? round(stepAverage!, 500) : null;
  const trainingDays = daily.filter(
    (d) => d.activity.training || d.check?.training === "done",
  ).length;
  const weightsDays = history.filter((d) =>
    d.activity.activities.some((a) => a.kind === "weights"),
  ).length;
  const cardioDays = history.filter((d) =>
    d.activity.activities.some((a) => a.kind === "cardio"),
  ).length;
  const trainingSplit =
    weightsDays + cardioDays >= 3
      ? {
          weights: Math.min(
            p.training,
            Math.round((p.training * weightsDays) / (weightsDays + cardioDays)),
          ),
          cardio: 0,
        }
      : null;
  if (trainingSplit) trainingSplit.cardio = p.training - trainingSplit.weights;
  const nextStart = addDays(end, 1),
    nextEnd = addDays(end, 7);
  const upcoming = c.events
    .filter((e) => e.day >= nextStart && e.day <= nextEnd)
    .sort((a, b) => a.day.localeCompare(b.day));
  const eventDays = [...new Set(upcoming.map((e) => e.day))];
  const flexibility =
    safe &&
    goalSafe &&
    directionOk &&
    complete.length >= 5 &&
    f.status === "On track" &&
    eventDays.length
      ? Math.max(
          0,
          Math.min(
            500,
            Math.floor(((t.high - calories) * 7) / eventDays.length / 50) * 50,
          ),
        )
      : null;
  const social = c.events.filter((e) => e.day >= start && e.day <= end);
  const unusual = daily
    .filter((d) => d.context.length)
    .map((d) => ({ day: d.day, notes: d.context }));
  const alcoholDays = daily.filter((d) => d.sum.drinks > 0).length;
  const fullMean = complete.length
    ? {
        low: round(completeLow / complete.length),
        high: round(completeHigh / complete.length),
      }
    : null;
  const close =
    complete.length >= 5 &&
    fullMean !== null &&
    fullMean.low <= t.high &&
    fullMean.high >= t.low;
  const interpretation = !safe
    ? "A recovery-focused week is the priority. Keep regular meals and comfortable movement; the plan will not tighten to compensate."
    : !goalSafe || !directionOk
      ? "The goal and remaining time need a review. Keep your regular routine and choose a sustainable goal; FITTT will not intensify the plan to chase the deadline."
      : complete.length < 5
        ? "There is not enough complete-day information to judge the week's energy balance. Missing days are unknown, not zero. Keep the plan steady while the picture builds."
        : close
          ? "Across the complete logged days, the week's estimated average overlaps your target range. Individual larger days do not decide the whole week."
          : "The complete logged days sit outside your usual target range. This is useful information, not a debt to repay. Your weight trend and repeated patterns guide any small changes.";
  const tips = [
    `Average about ${calories.toLocaleString("en-AU")} kcal/day; keep regular meals.`,
    `Aim for about ${t.protein}g protein/day.`,
    trainingSplit
      ? `Keep your ${p.training} planned training days: about ${trainingSplit.weights} weights and ${trainingSplit.cardio} cardio, based on your recent routine.`
      : `Keep your ${p.training} planned training days; rest days are part of the plan.`,
    steps !== null
      ? `Keep comfortable daily movement around your recent ${steps.toLocaleString("en-AU")}-step baseline.`
      : "Log steps when handy so the next plan can reflect your normal activity.",
  ];
  if (upcoming.length)
    tips.push(
      "Keep the social plans. Eat normally beforehand, choose drinks intentionally, and return to your usual meals afterwards.",
    );
  if (!safe)
    tips[0] =
      "Keep regular, adequate meals. No restriction or extra workouts to compensate; seek qualified support if needed.";
  const pattern = alcoholDays
    ? `${alcoholDays} logged drinking day${alcoholDays === 1 ? "" : "s"}; plan alcohol intentionally rather than treating calories as a drinking allowance.`
    : logged.length < 7
      ? "Alcohol on unlogged days is unknown."
      : "No alcohol appears in the recorded entries; unreported drinks are still unknown.";
  return {
    version: 1,
    start,
    end,
    summary: {
      loggedDays: logged.length,
      completeDays: complete.length,
      confidence,
      recordedCalories: {
        low: round(sums.caloriesLow),
        high: round(sums.caloriesHigh),
      },
      weeklyCalories:
        complete.length === 7
          ? { low: round(completeLow), high: round(completeHigh) }
          : null,
      average: fullMean,
      proteinDays: complete.filter(
        (d) => (d.sum.proteinLow + d.sum.proteinHigh) / 2 >= t.protein,
      ).length,
      trainingDays,
      trainingTarget: p.training,
      stepsAverage: avg(
        daily.filter((d) => d.steps !== null).map((d) => d.steps!),
      ),
      stepsDays: daily.filter((d) => d.steps !== null).length,
      standardDrinks: round(sums.drinks, 0.1),
      alcoholDays,
      social,
      unusual,
      activityEnergy: daily.some((d) => d.activity.energy)
        ? {
            low: daily.reduce((s, d) => s + (d.activity.energy?.low || 0), 0),
            high: daily.reduce((s, d) => s + (d.activity.energy?.high || 0), 0),
          }
        : null,
    },
    interpretation,
    pattern,
    forecast: {
      ...f,
      status: !safe
        ? "Recovery first"
        : !goalSafe || !directionOk
          ? "Review goal & timeframe"
          : f.status,
    },
    plan: {
      start: nextStart,
      end: nextEnd,
      calories,
      protein: t.protein,
      trainingDays: p.training,
      trainingSplit,
      steps,
      adjustment: round(calories - baseMid),
      reason: !safe
        ? "Recovery first; no tightening."
        : !goalSafe || !directionOk
          ? "Review the goal or timeframe before changing targets."
          : adjustment
            ? "One small calorie adjustment across future weeks. This is a bounded estimate, not a promise to close the projected gap. Training does not increase to compensate."
            : "Keep targets steady. More complete logs and a recent weight trend make future adjustments more reliable.",
      tips,
      upcoming,
      flexibility,
      normalDayCalories: calories,
      eventDayHigh: flexibility !== null ? calories + flexibility : null,
    },
    dataNote:
      "All nutrition and activity energy are estimates. Reported quantities, steps and sessions are self-reported, not independently measured. Incomplete logs never count as zero intake. No exercise calories are added back to food targets.",
  };
}
export type Review = ReturnType<typeof buildReview>;
