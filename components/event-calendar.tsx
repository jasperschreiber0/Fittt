"use client";
import { useState } from "react";
import { ChevronLeft, ChevronRight, Plus, Sparkles, X } from "lucide-react";

type Event = { id: string; name: string; day: string; size: string };
function dateLabel(day: string) {
  return new Date(day + "T12:00:00Z").toLocaleDateString("en-AU", {
    weekday: "long",
    day: "numeric",
    month: "long",
    year: "numeric",
    timeZone: "UTC",
  });
}
export function EventCalendar({
  today,
  events,
  busy,
  onSave,
  onRemove,
}: {
  today: string;
  events: Event[];
  busy: boolean;
  onSave: (event: { name: string; day: string; size: string }) => Promise<void>;
  onRemove: (id: string) => Promise<void>;
}) {
  const [month, setMonth] = useState(today.slice(0, 7));
  const [selected, setSelected] = useState(today);
  const [adding, setAdding] = useState(false);
  const [name, setName] = useState("");
  const [size, setSize] = useState("Dinner");
  const first = new Date(month + "-01T12:00:00Z");
  const offset = (first.getUTCDay() + 6) % 7;
  const count = new Date(
    Date.UTC(first.getUTCFullYear(), first.getUTCMonth() + 1, 0),
  ).getUTCDate();
  const cells = Array.from(
    { length: Math.ceil((offset + count) / 7) * 7 },
    (_, i) =>
      i >= offset && i < offset + count
        ? `${month}-${String(i - offset + 1).padStart(2, "0")}`
        : null,
  );
  const onDay = events.filter((e) => e.day === selected);
  const upcoming = [...events]
    .filter((e) => e.day >= today)
    .sort((a, b) => a.day.localeCompare(b.day) || a.name.localeCompare(b.name));
  function moveMonth(delta: number) {
    const d = new Date(
      Date.UTC(first.getUTCFullYear(), first.getUTCMonth() + delta, 1),
    );
    setMonth(d.toISOString().slice(0, 7));
    setSelected(d.toISOString().slice(0, 10));
    setAdding(false);
  }
  function choose(day: string) {
    setSelected(day);
    setMonth(day.slice(0, 7));
    setAdding(false);
  }
  return (
    <>
      <div className="eyebrow">YOUR SOCIAL CALENDAR</div>
      <h1>Make room for life.</h1>
      <p>
        Dinners, birthdays, weekends away. See what’s coming and plan around it.
      </p>
      <div className="calendar-layout">
        <section className="card calendar-card" aria-label="Social calendar">
          <div className="calendar-toolbar">
            <h2 aria-live="polite">
              {first.toLocaleDateString("en-AU", {
                month: "long",
                year: "numeric",
                timeZone: "UTC",
              })}
            </h2>
            <div>
              <button
                type="button"
                className="icon-button"
                aria-label="Previous month"
                onClick={() => moveMonth(-1)}
              >
                <ChevronLeft size={20} />
              </button>
              <button
                type="button"
                className="icon-button"
                aria-label="Next month"
                onClick={() => moveMonth(1)}
              >
                <ChevronRight size={20} />
              </button>
            </div>
          </div>
          <div className="calendar-weekdays" aria-hidden="true">
            {["M", "T", "W", "T", "F", "S", "S"].map((d, i) => (
              <span key={i}>{d}</span>
            ))}
          </div>
          <div className="calendar-days">
            {cells.map((day, i) =>
              day ? (
                <button
                  type="button"
                  key={day}
                  className={`calendar-day ${day === selected ? "selected" : ""} ${day === today ? "is-today" : ""}`}
                  aria-pressed={day === selected}
                  aria-current={day === today ? "date" : undefined}
                  aria-label={`${dateLabel(day)}${events.some((e) => e.day === day) ? ", planned event" : ""}`}
                  onClick={() => choose(day)}
                >
                  <span>{Number(day.slice(-2))}</span>
                  <span className="calendar-marker" aria-hidden="true">
                    {events.some((e) => e.day === day) ? "●" : ""}
                  </span>
                </button>
              ) : (
                <span key={`blank-${i}`} />
              ),
            )}
          </div>
          <div className="calendar-legend">
            <span>
              <i /> Planned Gold Event
            </span>
            <button
              type="button"
              className="text-button"
              onClick={() => choose(today)}
            >
              Back to today
            </button>
          </div>
          <div className="calendar-selection">
            <h3>{dateLabel(selected)}</h3>
            {onDay.length === 0 ? (
              <p className="small">
                Nothing planned {selected < today ? "on this day" : "yet"}.
              </p>
            ) : (
              onDay.map((e) => (
                <div className="calendar-event" key={e.id}>
                  <Sparkles size={18} />
                  <div>
                    <strong>{e.name}</strong>
                    <p>{e.size} · Gold Event</p>
                  </div>
                  <button
                    type="button"
                    disabled={busy}
                    className="icon-button"
                    aria-label={`Remove ${e.name}`}
                    onClick={() => void onRemove(e.id)}
                  >
                    <X size={17} />
                  </button>
                </div>
              ))
            )}
            {selected >= today && !adding && (
              <button
                type="button"
                className="secondary"
                onClick={() => setAdding(true)}
              >
                <Plus size={18} /> Add an event
              </button>
            )}
            {adding && (
              <form
                className="calendar-form"
                onSubmit={async (e) => {
                  e.preventDefault();
                  try {
                    await onSave({ name: name.trim(), day: selected, size });
                    setName("");
                    setAdding(false);
                  } catch {
                    /* Parent displays the save error; keep the draft. */
                  }
                }}
              >
                <label className="field">
                  <span>Event name</span>
                  <input
                    autoFocus
                    required
                    maxLength={80}
                    value={name}
                    onChange={(e) => setName(e.target.value)}
                    placeholder="Birthday dinner, wedding, weekend away…"
                  />
                </label>
                <label className="field">
                  <span>Event size</span>
                  <select
                    value={size}
                    onChange={(e) => setSize(e.target.value)}
                  >
                    <option>Dinner</option>
                    <option>Drinks</option>
                    <option>Big one</option>
                  </select>
                </label>
                <p className="small">
                  Saved as a planned Gold Event. Your event details stay
                  private. Plan ahead before checking in for that day.
                </p>
                <div className="actions">
                  <button className="primary" disabled={busy || !name.trim()}>
                    {busy ? "Saving…" : "Save event"}
                  </button>
                  <button
                    type="button"
                    className="text-button"
                    disabled={busy}
                    onClick={() => setAdding(false)}
                  >
                    Cancel
                  </button>
                </div>
              </form>
            )}
          </div>
        </section>
        <div>
          <section className="card upcoming-card">
            <div className="eyebrow">LOOKING AHEAD</div>
            <h2>Coming up</h2>
            {upcoming.length === 0 ? (
              <p>Your calendar is clear. Tap a date to add your next plan.</p>
            ) : (
              upcoming.map((e) => (
                <button
                  key={e.id}
                  type="button"
                  className="upcoming-event"
                  onClick={() => choose(e.day)}
                >
                  <span className="event-date">
                    <b>{Number(e.day.slice(-2))}</b>
                    {new Date(e.day + "T12:00:00Z").toLocaleDateString(
                      "en-AU",
                      { month: "short", timeZone: "UTC" },
                    )}
                  </span>
                  <span>
                    <strong>{e.name}</strong>
                    <small>
                      {e.size} · {e.day === today ? "Today" : dateLabel(e.day)}
                    </small>
                  </span>
                  <ChevronRight size={17} />
                </button>
              ))
            )}
          </section>
          <section className="card event-planning">
            <Sparkles size={22} />
            <h3>
              {onDay.length
                ? "A little plan for your plans."
                : "Enjoy it. Keep your rhythm."}
            </h3>
            <p>
              Keep regular meals before and after. Leave room in your schedule
              for the training you actually want to do.
            </p>
            <p>
              {onDay.some((e) => e.size === "Drinks" || e.size === "Big one")
                ? "If you’re drinking, decide what feels intentional beforehand and plan your journey home."
                : "Choose the moments you want to enjoy. You don’t need to earn them."}
            </p>
            <p className="small">
              Log afterwards. No skipped meals or extra exercise to make up for
              it.
            </p>
          </section>
        </div>
      </div>
    </>
  );
}
