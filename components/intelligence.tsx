"use client";
import { useState } from "react";
import {
  buildReview,
  dailyIntelligence,
  dueReviewEnd,
  type Context,
  type Review,
} from "@/lib/intelligence";
const fmt = (v: number) => Math.round(v).toLocaleString();
const range = (v: { low: number; high: number }) =>
  `${fmt(v.low)}–${fmt(v.high)}`;
export type SavedReview = {
  review_end: string;
  payload: Review;
  generated_at: string;
};
export function DailyReadout({
  context,
  day,
}: {
  context: Context;
  day: string;
}) {
  if (!context.entries.some((e) => e.day === day)) return null;
  const d = dailyIntelligence(context, day);
  const hasFood = context.entries.some(
    (e) =>
      e.day === day && (e.estimate.foods.length || e.estimate.drinks.length),
  );
  return (
    <section
      className="card daily-readout"
      aria-label="Today's intelligence"
      aria-live="polite"
    >
      <div className="eyebrow">
        TODAY · {d.sum.complete ? "FULL DAY LOGGED" : "SO FAR"}
      </div>
      <h2>Here’s the picture.</h2>
      <p>
        <strong>
          {hasFood
            ? `Estimated: ${fmt((d.sum.caloriesLow + d.sum.caloriesHigh) / 2)} kcal · ${fmt((d.sum.proteinLow + d.sum.proteinHigh) / 2)}g protein`
            : "Food and drinks: not logged yet"}
        </strong>
      </p>
      <p>
        {d.activity.training ? "✓ Training logged" : "Training: not reported"}
        {d.steps !== null
          ? ` · ${fmt(d.steps)} steps ${d.stepsBasis}`
          : " · Steps: not reported"}
      </p>
      <p>
        Goal trajectory: <strong>{d.forecast.status}</strong>
      </p>
      <p className="small">{d.message}</p>
      <details>
        <summary>Estimates & reported details</summary>
        <p className="small">
          Calories {fmt(d.sum.caloriesLow)}–{fmt(d.sum.caloriesHigh)} kcal ·
          protein {fmt(d.sum.proteinLow)}–{fmt(d.sum.proteinHigh)}g · confidence{" "}
          {d.confidence}.
        </p>
        <p className="small">
          Alcohol: ~{d.sum.drinks.toFixed(1)} Australian standard drinks
          recorded. Unreported drinks are unknown.
        </p>
        {d.activity.descriptions.length > 0 && (
          <p>{d.activity.descriptions.join(" · ")}</p>
        )}
        {d.activity.energy && (
          <p className="small">
            Timed activity: estimated {range(d.activity.energy)} kcal above
            rest. This covers reported timed activities only and is never added
            to your food target; steps may overlap.
          </p>
        )}
        {d.context.map((s, i) => (
          <p key={i}>{s}</p>
        ))}
        <p className="small">
          Quantities, steps and training are what you reported. Nutrition and
          expenditure remain estimates, even after you confirm them. Change a
          saved entry using Adjust below.
        </p>
      </details>
    </section>
  );
}
export function WeeklyIntelligence({
  context,
  reviews,
  onRefresh,
  busy,
}: {
  context: Context;
  reviews: SavedReview[];
  onRefresh: () => void;
  busy: boolean;
}) {
  const [selected, setSelected] = useState("");
  const sorted = [...reviews].sort((a, b) =>
    b.review_end.localeCompare(a.review_end),
  );
  const end = dueReviewEnd(context.profile.timezone);
  const saved = sorted.find((r) => r.review_end === (selected || end));
  const r = saved?.payload || buildReview(context, end);
  const current = !selected || selected === end;
  const plan = current ? buildReview(context, r.end).plan : r.plan;
  return (
    <div className="weekly-intelligence">
      <section className="card">
        <div className="eyebrow">SUNDAY RECAP · PRIVATE</div>
        <h2>Your week</h2>
        <p>
          {r.start} — {r.end}
        </p>
        <p className="small">
          {saved
            ? "Saved automatically. Refresh after correcting an older log."
            : "Preview. Your recap is saved from Sunday morning, including when the app is closed."}
        </p>
        {sorted.length > 1 && (
          <label className="field">
            <span>Previous recaps</span>
            <select
              value={selected || end}
              onChange={(e) => setSelected(e.target.value)}
            >
              <option value={end}>Latest week</option>
              {sorted
                .filter((x) => x.review_end !== end)
                .map((x) => (
                  <option key={x.review_end} value={x.review_end}>
                    Week ending {x.review_end}
                  </option>
                ))}
            </select>
          </label>
        )}
        <p>
          <strong>{r.summary.completeDays}/7 complete food days</strong> ·{" "}
          {r.summary.loggedDays}/7 days with a log or check-in
        </p>
        <p>{r.interpretation}</p>
        <details>
          <summary>What happened this week</summary>
          <dl className="recap-facts">
            <dt>Estimated weekly calories</dt>
            <dd>
              {r.summary.weeklyCalories
                ? `${range(r.summary.weeklyCalories)} kcal`
                : "Unknown — some food days are incomplete"}
            </dd>
            <dt>Recorded food and drinks</dt>
            <dd>
              {range(r.summary.recordedCalories)} kcal{" "}
              {r.summary.completeDays < 7 ? "(partial record)" : ""}
            </dd>
            <dt>Average complete food day</dt>
            <dd>
              {r.summary.average
                ? `${range(r.summary.average)} kcal, over ${r.summary.completeDays} days`
                : "Not enough information yet"}
            </dd>
            <dt>Protein consistency</dt>
            <dd>
              {r.summary.completeDays
                ? `${r.summary.proteinDays}/${r.summary.completeDays} complete days approximately met the protein target`
                : "No complete food days yet"}
            </dd>
            <dt>Training</dt>
            <dd>
              {r.summary.trainingDays}/{r.summary.trainingTarget} planned days
              reported
            </dd>
            <dt>Steps</dt>
            <dd>
              {r.summary.stepsAverage !== null
                ? `${fmt(r.summary.stepsAverage)} daily average over ${r.summary.stepsDays} reported days`
                : "Not reported"}
            </dd>
            <dt>Alcohol</dt>
            <dd>
              ~{r.summary.standardDrinks} Australian standard drinks recorded ·{" "}
              {r.summary.alcoholDays} days
            </dd>
            <dt>Social events</dt>
            <dd>
              {r.summary.social.length
                ? r.summary.social
                    .map((e) => `${e.name} (${e.day})`)
                    .join(" · ")
                : "No planned events recorded"}
            </dd>
            <dt>Other unusual days</dt>
            <dd>
              {r.summary.unusual.length
                ? r.summary.unusual
                    .map((e) => `${e.day}: ${e.notes.join("; ")}`)
                    .join(" · ")
                : "None described"}
            </dd>
            <dt>Logging confidence</dt>
            <dd>
              {r.summary.confidence}. More accurate portions and complete days
              improve the forecast.
            </dd>
          </dl>
          {r.summary.activityEnergy && (
            <p className="small">
              Timed activity expenditure: estimated{" "}
              {range(r.summary.activityEnergy)} kcal above rest. Partial
              activity record; not added to your food target.
            </p>
          )}
          <p className="small">{r.pattern}</p>
          <p className="small">{r.dataNote}</p>
        </details>
        <button className="text-button" disabled={busy} onClick={onRefresh}>
          {busy ? "Updating recap…" : "Refresh latest recap"}
        </button>
      </section>
      <section className="card next-week-plan">
        <div className="eyebrow">
          NEXT WEEK · {plan.start} — {plan.end}
        </div>
        <h2>What to do next.</h2>
        <p>
          Goal trajectory: <strong>{r.forecast.status}</strong> ·{" "}
          {r.forecast.remaining} days remaining
        </p>
        <ul>
          {plan.tips.map((t) => (
            <li key={t}>{t}</li>
          ))}
        </ul>
        <p className="small">
          {plan.reason} Suggestions do not overwrite your personal targets.
        </p>
        {plan.upcoming.length > 0 && (
          <div className="event-plan">
            <h3>Room for your plans</h3>
            {plan.upcoming.map((e, i) => (
              <p key={i}>
                <strong>{e.name}</strong> · {e.day}
              </p>
            ))}
            {plan.flexibility !== null && plan.flexibility > 0 ? (
              <p>
                Illustrative event-day range: {fmt(plan.calories)}–
                {fmt(plan.eventDayHigh!)} kcal, with other days around{" "}
                {fmt(plan.normalDayCalories)} kcal. This allocates up to{" "}
                {fmt(plan.flexibility)} kcal above your usual day within the
                weekly target range. It is not a drinking allowance or a promise
                about weight.
              </p>
            ) : (
              <p>
                Keep regular meals around the event. We won’t invent a calorie
                allowance without enough reliable information.
              </p>
            )}
          </div>
        )}
        {r.forecast.projected !== null ? (
          <details>
            <summary>Your 90-day trajectory</summary>
            <p>
              At current pace:{" "}
              <strong>{r.forecast.projected.toFixed(1)} kg</strong> (rough range{" "}
              {r.forecast.low?.toFixed(1)}–{r.forecast.high?.toFixed(1)} kg)
            </p>
            <p>
              Current rolling trend: {r.forecast.current?.toFixed(1)} kg ·
              finish {r.forecast.finish}
            </p>
            <p>
              Goal:{" "}
              {r.forecast.goal !== null
                ? `${r.forecast.goal} kg`
                : "Set an optional goal weight in your profile"}
              {r.forecast.gap !== null
                ? ` · Projected gap: ${r.forecast.gap > 0 ? "+" : ""}${r.forecast.gap.toFixed(1)} kg`
                : ""}
            </p>
            <p className="small">{r.forecast.reason}</p>
          </details>
        ) : (
          <p className="small">{r.forecast.reason}</p>
        )}
      </section>
    </div>
  );
}
