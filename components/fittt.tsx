"use client";
import { useEffect, useState } from "react";
import { VoiceComposer } from "./voice-composer";
import {
  Mic,
  ArrowUpRight,
  Check,
  Plus,
  Sun,
  ChartNoAxesCombined,
  Users,
  Sparkles,
  Settings,
  ChevronRight,
  MessageCircle,
  Leaf,
  X,
} from "lucide-react";
import {
  targets,
  mergeEntries,
  dayScore,
  weeklyAdherence,
  streak,
  dateInZone,
  dayDiff,
  weekDays,
  weeklyEnergy,
  weightTrend,
  trajectory,
  safeMessage,
  type Profile,
  type Entry,
  type Estimate,
  type Fast,
  type Weight,
} from "@/lib/engine";
type Data = {
  user: { id: string; email: string } | null;
  profiles: { data: Profile }[];
  entries: Entry[];
  days: { day: string; data: Fast }[];
  weights: Weight[];
  events: {
    id: string;
    day: string;
    name: string;
    size: string;
    created_at: string;
  }[];
  memories: { name: string; estimate: Estimate }[];
  ai_usage: { cost_usd: number }[];
  challenges: { id: string; name: string; start: string; code: string }[];
};
type Board = {
  name: string;
  user_id: string;
  training_target: number;
  days: {
    day: string;
    nutrition: number;
    alcohol: number;
    consistency: number;
    trainingDone: boolean;
    gold: boolean;
  }[];
}[];
const empty: Data = {
  user: null,
  profiles: [],
  entries: [],
  days: [],
  weights: [],
  events: [],
  memories: [],
  ai_usage: [],
  challenges: [],
};
const fmt = (n: number) => Math.round(n).toLocaleString();
const range = (l: number, h: number) => `${fmt(l)}–${fmt(h)}`;
const initialFast: Fast = {
  food: "on",
  training: "rest",
  alcohol: "none",
  complete: true,
  minimum: false,
};
async function api(body: unknown, path = "/api/data") {
  const r = await fetch(path, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  const j = await r.json();
  if (!r.ok) throw Error(j.error || "Something went wrong");
  return j;
}
function Field({
  label,
  children,
}: {
  label: string;
  children: React.ReactNode;
}) {
  return (
    <label className="field">
      <span>{label}</span>
      {children}
    </label>
  );
}
function Choices({
  label,
  value,
  options,
  onChange,
}: {
  label: string;
  value: string;
  options: string[][];
  onChange: (s: string) => void;
}) {
  return (
    <fieldset>
      <legend>{label}</legend>
      <div className="choices">
        {options.map(([v, l]) => (
          <button
            type="button"
            key={v}
            aria-pressed={v === value}
            className={v === value ? "selected" : ""}
            onClick={() => onChange(v)}
          >
            {l}
          </button>
        ))}
      </div>
    </fieldset>
  );
}
export default function Fittt() {
  const [data, setData] = useState<Data>(empty),
    [loading, setLoading] = useState(true),
    [tab, setTab] = useState("Today"),
    [error, setError] = useState(""),
    [notice, setNotice] = useState(""),
    [busy, setBusy] = useState(false),
    [email, setEmail] = useState(""),
    [sent, setSent] = useState(false),
    [token, setToken] = useState("");
  const [dayListening, setDayListening] = useState(false);
  const [resendAfter, setResendAfter] = useState(0);
  const [authClock, setAuthClock] = useState(0);
  const [text, setText] = useState(""),
    [estimate, setEstimate] = useState<Estimate | null>(null),
    [clarified, setClarified] = useState(false),
    [question, setQuestion] = useState(""),
    [answer, setAnswer] = useState(""),
    [voice, setVoice] = useState(false),
    [fast, setFast] = useState<Fast>(initialFast),
    [fastOpen, setFastOpen] = useState(false),
    [savedId, setSavedId] = useState<string | null>(null),
    [started, setStarted] = useState(() => performance.now()),
    [board, setBoard] = useState<Board>([]),
    [selectedChallenge, setSelectedChallenge] = useState(""),
    [feedback, setFeedback] = useState(false),
    [feedbackText, setFeedbackText] = useState(""),
    [ask, setAsk] = useState(false),
    [askAnswer, setAskAnswer] = useState(""),
    [adjust, setAdjust] = useState(false),
    [review, setReview] = useState(false),
    [scoreOpen, setScoreOpen] = useState(false),
    [editing, setEditing] = useState(false),
    [invite, setInvite] = useState(""),
    [inputSource, setInputSource] = useState<"text" | "voice">("text");
  const p = data.profiles[0]?.data,
    today = dateInZone(p?.timezone),
    entries = data.entries.filter((e) => e.day === today),
    totals = mergeEntries(entries),
    day = data.days.find((d) => d.day === today),
    gold = data.events.some(
      (e) => e.day === today && e.created_at.slice(0, 10) <= today,
    ),
    t = p ? targets(p) : null,
    energy = p ? weeklyEnergy(data.entries, p, today) : null,
    challenge =
      data.challenges.find((c) => c.id === selectedChallenge) ||
      data.challenges[0],
    challengeDay = challenge
      ? Math.max(0, Math.min(90, dayDiff(today, challenge.start) + 1))
      : 0,
    days = weekDays(today),
    weekLogs = data.days.filter((d) => days.includes(d.day)),
    adherence = p
      ? weeklyAdherence(data.days, data.entries, p, today, data.events)
      : 0;
  async function reload() {
    const r = await fetch("/api/data", { cache: "no-store" });
    const j = await r.json();
    if (!r.ok) throw Error(j.error);
    setData({ ...empty, ...j });
  }
  useEffect(() => {
    if (!sent || data.user) return;
    const timer = window.setInterval(() => setAuthClock(Date.now()), 1000);
    return () => window.clearInterval(timer);
  }, [sent, data.user]);
  useEffect(() => {
    void fetch("/api/data", { cache: "no-store" })
      .then((r) => r.json())
      .then((j) => {
        setData({ ...empty, ...j });
        setInvite(new URLSearchParams(location.search).get("invite") || "");
        if (new URLSearchParams(location.search).has("authError"))
          setError(
            "That sign-in link could not be used. Request a new email code below, then enter it here. You can open the email on any device.",
          );
        try {
          const pending = JSON.parse(
            sessionStorage.getItem("fittt-login") || "null",
          );
          if (!j.user && pending?.email && Date.now() - pending.at < 3600000) {
            setEmail(pending.email);
            setSent(true);
            setResendAfter(pending.at + 60000);
          } else sessionStorage.removeItem("fittt-login");
        } catch {
          /* Storage may be unavailable in private browsing. */
        }
        if (j.user)
          void api({ action: "analytics", event: "active" }).catch(() => {});
      })
      .catch((e) => setError(e.message))
      .finally(() => setLoading(false));
    if ("serviceWorker" in navigator)
      void navigator.serviceWorker.register("/sw.js");
  }, []);
  async function run(fn: () => Promise<void>) {
    setBusy(true);
    setError("");
    setNotice("");
    try {
      await fn();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Please try again");
    } finally {
      setBusy(false);
    }
  }
  function analytics(event: string) {
    void api({
      action: "analytics",
      event,
      // eslint-disable-next-line react-hooks/purity -- This function is only called by user-event handlers.
      seconds: (performance.now() - started) / 1000,
    }).catch(() => {});
  }
  function speak(to: (s: string) => void) {
    type SpeechResult = { results: { transcript: string }[][] };
    type Recognizer = {
      lang: string;
      interimResults: boolean;
      onresult: (e: SpeechResult) => void;
      onerror: () => void;
      onend: () => void;
      start: () => void;
    };
    const w = window as unknown as {
      SpeechRecognition?: new () => Recognizer;
      webkitSpeechRecognition?: new () => Recognizer;
    };
    const C = w.SpeechRecognition || w.webkitSpeechRecognition;
    if (!C) {
      setNotice(
        "Voice isn’t supported in this browser. Type below, or use your keyboard’s microphone.",
      );
      return;
    }
    const r = new C();
    r.lang = "en-AU";
    r.interimResults = false;
    r.onresult = (e) => {
      to(e.results[0][0].transcript);
      setInputSource("voice");
    };
    r.onerror = () => {
      setVoice(false);
      setNotice(
        "Microphone unavailable. You can type or use keyboard dictation.",
      );
    };
    r.onend = () => setVoice(false);
    setVoice(true);
    r.start();
    analytics("voice_start");
  }
  async function interpret(asking = false) {
    const j = await api(
      {
        text: question ? text + "\nClarification: " + answer : text,
        clarified: !!question || clarified,
        ask: asking,
      },
      "/api/interpret",
    );
    if (j.message) {
      setAskAnswer(j.message);
      return;
    }
    setEstimate(j.estimate);
    setSavedId(null);
    if (j.estimate.clarification && !clarified) {
      setQuestion(j.estimate.clarification);
      analytics("clarification");
    } else {
      setQuestion("");
      setClarified(true);
    }
  }
  async function confirmEstimate() {
    if (!estimate) return;
    const id = savedId || crypto.randomUUID();
    setSavedId(id);
    await api({
      action: "entry",
      id,
      day: today,
      estimate,
      source: inputSource,
    });
    analytics("estimate_accept");
    await reload();
    setEstimate(null);
    setQuestion("");
    setText("");
    setClarified(false);
    setNotice("Added to today. You can add more whenever you like.");
  }
  async function showBoard(id: string) {
    setSelectedChallenge(id);
    const j = await api({ action: "leaderboard", id });
    setBoard(j.data || []);
  }
  function navigate(next: string) {
    setTab(next);
    setNotice("");
    if (next === "Friends" && challenge)
      void run(() => showBoard(challenge.id));
    if (next === "Progress") analytics("progress_open");
  }
  if (loading)
    return (
      <main className="loading">
        <b className="wordmark">
          FITTT<span>•</span>
        </b>
        <p>Getting your day ready…</p>
      </main>
    );
  return (
    <>
      <header>
        <button className="wordmark" onClick={() => navigate("Today")}>
          FITTT<span>•</span>
        </button>
        <span className="header-note">A little consistency. A real life.</span>
        <span className="avatar">
          {p?.name.slice(0, 1) || <Leaf size={18} />}
        </span>
      </header>
      <main>
        {error && (
          <div role="alert" className="alert">
            {error}
            <button aria-label="Dismiss error" onClick={() => setError("")}>
              <X size={16} />
            </button>
          </div>
        )}
        {notice && (
          <div role="status" className="notice">
            {notice}
          </div>
        )}
        {!data.user ? (
          <section className="auth">
            <div className="eyebrow">YOUR NEXT 90 DAYS</div>
            <h1>
              Fitness for people
              <br />
              who have a life<span className="lime">.</span>
            </h1>
            <p>
              Show up for yourself. Make room for the good stuff.
              <br />
              Do it with your people.
            </p>
            <form
              onSubmit={(e) => {
                e.preventDefault();
                void run(async () => {
                  await api(
                    { email, action: sent ? "verify" : "login", token },
                    "/api/auth",
                  );
                  if (sent) {
                    try {
                      sessionStorage.removeItem("fittt-login");
                    } catch {}
                    await reload();
                  } else {
                    setSent(true);
                    setResendAfter(Date.now() + 60000);
                    try {
                      sessionStorage.setItem(
                        "fittt-login",
                        JSON.stringify({ email, at: Date.now() }),
                      );
                    } catch {}
                  }
                });
              }}
            >
              <Field label="Email address">
                <input
                  type="email"
                  required
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  placeholder="you@example.com"
                  autoComplete="email"
                  readOnly={sent}
                />
              </Field>
              {sent && (
                <>
                  <p>
                    Enter the code sent to <strong>{email}</strong>. Look for
                    “Your FITTT sign-in code” from Kaspr Accounts, including in
                    spam. Use the newest code. You can read the email on any
                    device.
                  </p>
                  <Field label="Email code">
                    <input
                      value={token}
                      onChange={(e) =>
                        setToken(e.target.value.replace(/\s/g, ""))
                      }
                      required
                      pattern="[0-9]{6,8}"
                      minLength={6}
                      maxLength={8}
                      inputMode="numeric"
                      autoComplete="one-time-code"
                    />
                  </Field>
                </>
              )}
              <button className="primary" disabled={busy}>
                {busy
                  ? "One moment…"
                  : sent
                    ? "Verify code"
                    : "Email me a code"}
                <ArrowUpRight size={18} />
              </button>
              {sent && (
                <div className="choices">
                  <button
                    type="button"
                    disabled={busy || authClock < resendAfter}
                    onClick={() =>
                      void run(async () => {
                        await api({ email, action: "login" }, "/api/auth");
                        setToken("");
                        setResendAfter(Date.now() + 60000);
                        setNotice(
                          "A new code has been sent. Use the newest email.",
                        );
                        try {
                          sessionStorage.setItem(
                            "fittt-login",
                            JSON.stringify({ email, at: Date.now() }),
                          );
                        } catch {}
                      })
                    }
                  >
                    {authClock < resendAfter
                      ? `Resend in ${Math.min(60, Math.ceil((resendAfter - authClock) / 1000))}s`
                      : "Resend code"}
                  </button>
                  <button
                    type="button"
                    disabled={busy}
                    onClick={() => {
                      setSent(false);
                      setToken("");
                      setError("");
                      setNotice("");
                      try {
                        sessionStorage.removeItem("fittt-login");
                      } catch {}
                    }}
                  >
                    Change email
                  </button>
                </div>
              )}
            </form>
            <p className="small">
              Private body metrics. Shared consistency.
              <br />
              For adults 18+. Estimates are a guide, not a prescription.
            </p>
          </section>
        ) : !p || editing ? (
          <Onboarding
            initial={p}
            busy={busy}
            onCancel={p ? () => setEditing(false) : undefined}
            onSave={(profile) =>
              run(async () => {
                await api({ action: "profile", data: profile });
                await reload();
                setEditing(false);
                setNotice(
                  "Your plan is ready. Refine it whenever life changes.",
                );
              })
            }
          />
        ) : (
          <>
            {tab === "Today" && (
              <>
                <div className="page-title">
                  <div>
                    <div className="eyebrow">
                      <section className="card log-card">
                        <div className="between">
                          <h2>Just tell us about your day.</h2>
                          <span className="tag">YOUR DAILY CHECK-IN</span>
                        </div>
                        <p>
                          Meals, movement, a drink with mates. Tell it like it
                          was.
                        </p>
                        <VoiceComposer
                          value={text}
                          disabled={busy}
                          onActive={setDayListening}
                          onStart={() => {
                            setStarted(performance.now());
                            analytics("voice_start");
                          }}
                          onChange={(value, source) => {
                            setText(value);
                            setInputSource(source);
                            setEstimate(null);
                            setQuestion("");
                            setClarified(false);
                          }}
                        />
                        {question && (
                          <Field label={question}>
                            <input
                              value={answer}
                              onChange={(e) => setAnswer(e.target.value)}
                              placeholder="One quick detail…"
                            />
                          </Field>
                        )}
                        {estimate && !question ? (
                          <div className="estimate">
                            <div className="between">
                              <h3>Your estimate</h3>
                              <span className="tag">
                                {estimate.confidence} confidence
                              </span>
                            </div>
                            <strong>
                              {range(
                                mergeEntries([
                                  {
                                    id: "preview",
                                    day: today,
                                    estimate,
                                    source: "text",
                                  },
                                ]).caloriesLow,
                                mergeEntries([
                                  {
                                    id: "preview",
                                    day: today,
                                    estimate,
                                    source: "text",
                                  },
                                ]).caloriesHigh,
                              )}{" "}
                              kcal
                            </strong>
                            <p>
                              {[...estimate.foods, ...estimate.drinks]
                                .map((i) => i.name)
                                .join(" · ") || "Movement update"}
                            </p>
                            <p>
                              {range(
                                [...estimate.foods, ...estimate.drinks].reduce(
                                  (s, i) => s + i.proteinLow,
                                  0,
                                ),
                                [...estimate.foods, ...estimate.drinks].reduce(
                                  (s, i) => s + i.proteinHigh,
                                  0,
                                ),
                              )}{" "}
                              g protein ·{" "}
                              {[...estimate.drinks, ...estimate.foods]
                                .reduce((s, i) => s + i.standardDrinks, 0)
                                .toFixed(1)}{" "}
                              standard drinks
                            </p>
                            {estimate.assumptions.map((a) => (
                              <p className="small" key={a}>
                                {a}
                              </p>
                            ))}
                            {estimate.safetyConcern && <p>{safeMessage}</p>}
                            {adjust && (
                              <>
                                {[...estimate.foods, ...estimate.drinks].map(
                                  (item, i) => (
                                    <div className="adjust" key={i}>
                                      <b>{item.name}</b>
                                      {(
                                        [
                                          "caloriesLow",
                                          "caloriesHigh",
                                          "proteinLow",
                                          "proteinHigh",
                                          "standardDrinks",
                                        ] as const
                                      ).map((k) => (
                                        <Field key={k} label={k}>
                                          <input
                                            type="number"
                                            min="0"
                                            value={item[k]}
                                            onChange={(e) => {
                                              const copy =
                                                structuredClone(estimate);
                                              const list =
                                                i < copy.foods.length
                                                  ? copy.foods
                                                  : copy.drinks;
                                              list[
                                                i < copy.foods.length
                                                  ? i
                                                  : i - copy.foods.length
                                              ][k] = Number(e.target.value);
                                              setEstimate(copy);
                                            }}
                                          />
                                        </Field>
                                      ))}
                                    </div>
                                  ),
                                )}
                              </>
                            )}
                            <label className="check">
                              <input
                                type="checkbox"
                                checked={estimate.completeDay}
                                onChange={(e) =>
                                  setEstimate({
                                    ...estimate,
                                    completeDay: e.target.checked,
                                  })
                                }
                              />
                              This includes everything I ate today
                            </label>
                            <div className="actions">
                              <button
                                className="primary"
                                disabled={busy}
                                onClick={() => void run(confirmEstimate)}
                              >
                                Looks right <Check size={17} />
                              </button>
                              <button
                                className="secondary"
                                onClick={() => {
                                  setAdjust(!adjust);
                                  analytics("estimate_adjust");
                                }}
                              >
                                Adjust
                              </button>
                            </div>
                          </div>
                        ) : (
                          <button
                            className="primary"
                            disabled={
                              busy ||
                              dayListening ||
                              !text.trim() ||
                              (!!question && !answer)
                            }
                            onClick={() => void run(() => interpret(false))}
                          >
                            {busy
                              ? "Making sense of it…"
                              : question
                                ? "Use this detail"
                                : "Review my day"}
                            <ArrowUpRight size={17} />
                          </button>
                        )}
                        <button
                          className="text-button"
                          onClick={() => {
                            setFastOpen(!fastOpen);
                            setStarted(performance.now());
                            analytics("fast_start");
                          }}
                        >
                          Short on time? Fast Mode <ChevronRight size={16} />
                        </button>
                        {fastOpen && (
                          <div className="fast">
                            <Choices
                              label="Food"
                              value={fast.food}
                              options={[
                                ["on", "On plan"],
                                ["off", "Off plan"],
                              ]}
                              onChange={(s) =>
                                setFast({ ...fast, food: s as Fast["food"] })
                              }
                            />
                            <Choices
                              label="Training"
                              value={fast.training}
                              options={[
                                ["done", "Done"],
                                ["rest", "Rest"],
                                ["missed", "Missed"],
                              ]}
                              onChange={(s) =>
                                setFast({
                                  ...fast,
                                  training: s as Fast["training"],
                                })
                              }
                            />
                            <Choices
                              label="Alcohol"
                              value={fast.alcohol}
                              options={[
                                ["none", "None"],
                                ["planned", "Planned"],
                                ["unplanned", "Unplanned"],
                              ]}
                              onChange={(s) =>
                                setFast({
                                  ...fast,
                                  alcohol: s as Fast["alcohol"],
                                })
                              }
                            />
                            <button
                              className="primary"
                              disabled={busy}
                              onClick={() =>
                                void run(async () => {
                                  await api({
                                    action: "day",
                                    day: today,
                                    data: fast,
                                  });
                                  analytics("checkin");
                                  await reload();
                                  setFastOpen(false);
                                  setNotice(
                                    "Check-in saved. Back to your life.",
                                  );
                                })
                              }
                            >
                              Save check-in <Check size={18} />
                            </button>
                            <p className="small">
                              Rest counts. More exercise earns no extra points.
                              Fast Mode doesn’t invent calorie estimates.
                            </p>
                          </div>
                        )}
                      </section>
                      <section className="status-card">
                        <div className="between">
                          <span className="pill">
                            {challenge
                              ? `DAY ${challengeDay} / 90`
                              : "YOUR DAILY RHYTHM"}
                          </span>
                          <span className="small">
                            {challenge?.name || "One day at a time"}
                          </span>
                        </div>
                        <h2>
                          {gold
                            ? "Life is on the plan."
                            : day
                              ? "You showed up. That counts."
                              : "A good day starts with a check-in."}
                        </h2>
                        <p>
                          {gold
                            ? "Enjoy your Gold Event. Keep normal meals and log it afterwards."
                            : day
                              ? "Consistency over perfection. There’s always another good choice."
                              : "No perfect meals. No perfect numbers. Just a little consistency."}
                        </p>
                        <div className="week-strip">
                          {days.map((d) => {
                            const saved = data.days.find((x) => x.day === d),
                              g = data.events.some((e) => e.day === d),
                              status = saved
                                ? dayScore(
                                    saved.data,
                                    data.entries.filter((e) => e.day === d),
                                    p,
                                    g,
                                  ).status
                                : "";
                            return (
                              <div key={d}>
                                <span>
                                  {new Date(
                                    d + "T12:00:00Z",
                                  ).toLocaleDateString("en", {
                                    weekday: "narrow",
                                    timeZone: "UTC",
                                  })}
                                </span>
                                <span
                                  className={`day-dot ${d === today ? "current" : ""} ${status === "Green" ? "green" : g ? "gold" : ""}`}
                                >
                                  {saved ? (
                                    <Check size={17} />
                                  ) : g ? (
                                    <Sparkles size={15} />
                                  ) : (
                                    d.slice(-2)
                                  )}
                                </span>
                              </div>
                            );
                          })}
                        </div>
                      </section>
                      {new Date(today + "T12:00:00").toLocaleDateString(
                        "en-AU",
                        { weekday: "long", day: "numeric", month: "long" },
                      )}
                    </div>
                    <h1>
                      Hey {p.name}.<br />
                      Let’s keep it simple.
                    </h1>
                  </div>
                  <Sun className="sun" size={46} strokeWidth={1.1} />
                </div>
                {new Date(today + "T12:00:00Z").getUTCDay() === 0 && (
                  <button
                    className="notice"
                    onClick={() => {
                      navigate("Progress");
                      setReview(true);
                      analytics("review_open");
                    }}
                  >
                    Your Sunday reset is ready. Take a look →
                  </button>
                )}
                <div className="grid">
                  <section className="card">
                    <div className="eyebrow">THIS WEEK · ESTIMATED</div>
                    <h2>Room for real life.</h2>
                    <div className="big-number">
                      {energy?.loggedDays
                        ? range(energy.intakeLow, energy.intakeHigh)
                        : "Still taking shape"}
                      <small>{energy?.loggedDays ? " kcal logged" : ""}</small>
                    </div>
                    <p>
                      {energy?.loggedDays} complete food days of{" "}
                      {energy?.elapsedDays} elapsed. Missing days stay unknown.
                    </p>
                    {!!energy?.loggedDays && (
                      <p>
                        Position for logged days:{" "}
                        {range(energy.positionLow, energy.positionHigh)} kcal{" "}
                        {energy.positionHigh < 0
                          ? "(negative = above target)"
                          : "(positive = below target)"}
                      </p>
                    )}
                    <div className="divider" />
                    <p className="small">
                      Full-week target:{" "}
                      {range(energy!.weeklyLow, energy!.weeklyHigh)} kcal. This
                      is context, not a balance to spend. Keep normal meals
                      before events.
                    </p>
                    <button
                      className="text-button"
                      onClick={() => {
                        setAsk(!ask);
                        setAskAnswer("");
                      }}
                    >
                      Where am I at? <MessageCircle size={17} />
                    </button>
                    {ask && (
                      <>
                        <textarea
                          aria-label="Ask about your week"
                          placeholder="I have dinner and drinks tonight. Where am I sitting?"
                          value={text}
                          onChange={(e) => setText(e.target.value)}
                        />
                        <button
                          className="secondary"
                          disabled={busy || !text}
                          onClick={() => void run(() => interpret(true))}
                        >
                          Ask
                        </button>
                      </>
                    )}
                    {askAnswer && <p className="notice">{askAnswer}</p>}
                  </section>
                  <section className="card soft">
                    <Leaf size={25} />
                    <h2>Save the day.</h2>
                    <p>Chaotic day? Your minimum is enough.</p>
                    <p className="minimum">{p.minimum}</p>
                    <button
                      className="secondary"
                      onClick={() => {
                        setFastOpen(true);
                        setFast({ ...fast, minimum: true });
                        setNotice(
                          "Keep your check-in honest. Your minimum keeps momentum; it does not add bonus points.",
                        );
                      }}
                    >
                      Use my minimum day
                    </button>
                  </section>
                </div>
                {!!entries.length && (
                  <section className="card">
                    <div className="between">
                      <h2>Today, so far</h2>
                      <span className="tag">
                        {totals.complete ? "FULL DAY" : "PARTIAL DAY"}
                      </span>
                    </div>
                    <p>
                      {range(totals.caloriesLow, totals.caloriesHigh)} kcal ·{" "}
                      {range(totals.proteinLow, totals.proteinHigh)} g protein ·{" "}
                      {totals.drinks.toFixed(1)} standard drinks
                    </p>
                    {entries.map((e) => (
                      <div className="entry" key={e.id}>
                        <div>
                          <strong>
                            {[...e.estimate.foods, ...e.estimate.drinks]
                              .map((i) => i.name)
                              .join(", ") || e.estimate.exercise.join(", ")}
                          </strong>
                          <p className="small">
                            {e.estimate.confidence} confidence
                          </p>
                        </div>
                        <button
                          className="icon-button"
                          aria-label="Remove entry"
                          onClick={() =>
                            void run(async () => {
                              await api({ action: "deleteEntry", id: e.id });
                              await reload();
                            })
                          }
                        >
                          <X size={17} />
                        </button>
                        <button
                          className="text-button"
                          onClick={() => {
                            setEstimate(e.estimate);
                            setSavedId(e.id);
                            setAdjust(true);
                          }}
                        >
                          Adjust
                        </button>
                        <button
                          className="text-button"
                          onClick={() => {
                            const name = prompt(
                              "A short name for this meal, e.g. my usual breakfast",
                            );
                            if (name)
                              void run(async () => {
                                await api({
                                  action: "memory",
                                  name,
                                  estimate: {
                                    ...e.estimate,
                                    completeDay: false,
                                  },
                                });
                                await reload();
                                setNotice("Remembered for next time.");
                              });
                          }}
                        >
                          Remember
                        </button>
                      </div>
                    ))}
                  </section>
                )}
              </>
            )}
            {tab === "Progress" && (
              <>
                <div className="eyebrow">PRIVATE TO YOU</div>
                <h1>Your bigger picture.</h1>
                <div className="grid">
                  <section className="card">
                    <div className="eyebrow">WEEKLY ADHERENCE</div>
                    <button
                      className="score"
                      onClick={() => setScoreOpen(!scoreOpen)}
                    >
                      {adherence}
                      <small>%</small>
                    </button>
                    <p>
                      {streak(data.days, today)} day check-in streak ·{" "}
                      {weekLogs.filter((d) => d.data.alcohol === "none").length}{" "}
                      alcohol-free days this week.
                    </p>
                    <p>
                      85%+ is a successful rhythm. Unlogged elapsed days count
                      toward consistency.
                    </p>
                    {scoreOpen && (
                      <p>
                        Nutrition 35 · Personal weekly training target 25 ·
                        Alcohol intentionality 25 · Check-in 15. Training credit
                        is capped at your target and prorated through the week;
                        rest needs no extra workout. Gold allows flexibility. No
                        bonus for low calories or extra exercise. A clearly
                        inadequate completed day receives no nutrition points.
                      </p>
                    )}
                    <button
                      className="text-button"
                      onClick={() => {
                        setReview(!review);
                        analytics("review_open");
                      }}
                    >
                      Sunday reset <ArrowUpRight size={17} />
                    </button>
                    {review && (
                      <div className="notice">
                        <h3>Your week, without the guilt.</h3>
                        <p>
                          {
                            data.events.filter((e) => days.includes(e.day))
                              .length
                          }{" "}
                          Gold Events · {adherence}% adherence.
                        </p>
                        <p>
                          {energy?.loggedDays
                            ? `${range(energy.intakeLow, energy.intakeHigh)} kcal across ${energy.loggedDays} complete food days. Position against target: ${range(energy.positionLow, energy.positionHigh)} kcal (positive = below target).`
                            : "No complete food days yet. Fast check-ins still count; energy stays unknown."}
                        </p>
                        {data.weights.length > 0 && (
                          <p>
                            Latest private seven-day weight mean:{" "}
                            {weightTrend(data.weights)
                              .at(-1)!
                              .average.toFixed(1)}{" "}
                            kg.
                          </p>
                        )}
                        <p>
                          {
                            weekLogs.filter((d) => d.data.training === "done")
                              .length
                          }
                          /{p.training} training sessions ·{" "}
                          {weekLogs.filter((d) => d.data.food === "on").length}{" "}
                          on-plan days ·{" "}
                          {
                            weekLogs.filter((d) => d.data.alcohol === "none")
                              .length
                          }{" "}
                          alcohol-free days ·{" "}
                          {
                            weekLogs.filter(
                              (d) => d.data.alcohol === "unplanned",
                            ).length
                          }{" "}
                          unplanned drinking days.
                        </p>
                        <p>
                          Next week:{" "}
                          {weekLogs.length <
                          days.filter((d) => d <= today).length
                            ? "Make one quick daily check-in your focus."
                            : "Keep your usual rhythm and plan social events ahead."}{" "}
                          Return to normal meals after a big night. Never miss
                          twice.
                        </p>
                      </div>
                    )}
                  </section>
                  <section className="card">
                    <div className="eyebrow">DAY 90 · ESTIMATED</div>
                    <h2>
                      {(() => {
                        const tr = trajectory(data.weights, p.start, today);
                        return tr
                          ? `${tr.low.toFixed(1)}–${tr.high.toFixed(1)} kg`
                          : "A trend takes time.";
                      })()}
                    </h2>
                    <p>
                      Uses your rolling weight trend, not AI. Needs at least
                      four weigh-ins spanning 14 days. It’s a rough projection,
                      not a promise.
                    </p>
                    {p.targetWeight && (
                      <p>Your private target: {p.targetWeight} kg</p>
                    )}
                  </section>
                </div>
                <section className="card">
                  <h2>A trend, not a verdict.</h2>
                  <p>Your weight and waist are always private.</p>
                  <form
                    className="inline-form"
                    onSubmit={(e) => {
                      e.preventDefault();
                      const f = new FormData(e.currentTarget);
                      void run(async () => {
                        await api({
                          action: "weight",
                          day: f.get("day"),
                          weight: Number(f.get("weight")),
                          waist: Number(f.get("waist")) || null,
                        });
                        await reload();
                        setNotice("Private measurement saved.");
                      });
                    }}
                  >
                    <Field label="Date">
                      <input
                        name="day"
                        type="date"
                        defaultValue={today}
                        max={today}
                        required
                      />
                    </Field>
                    <Field label="Weight (kg)">
                      <input
                        name="weight"
                        type="number"
                        min="40"
                        max="250"
                        step="0.1"
                        required
                      />
                    </Field>
                    <Field label="Waist (cm, optional)">
                      <input
                        name="waist"
                        type="number"
                        min="40"
                        max="200"
                        step="0.1"
                      />
                    </Field>
                    <button className="primary" disabled={busy}>
                      Save
                    </button>
                  </form>
                  {weightTrend(data.weights)
                    .slice(-14)
                    .map((w) => (
                      <div className="between measurement" key={w.day}>
                        <span>{w.day}</span>
                        <b>{w.weight} kg</b>
                        <span>7-day mean {w.average.toFixed(1)} kg</span>
                      </div>
                    ))}
                </section>
              </>
            )}
            {tab === "Friends" && (
              <>
                <div className="eyebrow">YOUR PEOPLE. YOUR PACE.</div>
                <h1>Better together.</h1>
                <p>
                  Share showing up. Your body metrics and food diary stay yours.
                </p>
                {data.challenges.length > 0 && (
                  <section className="card">
                    <Field label="Challenge">
                      <select
                        value={challenge?.id}
                        onChange={(e) =>
                          void run(() => showBoard(e.target.value))
                        }
                      >
                        {data.challenges.map((c) => (
                          <option key={c.id} value={c.id}>
                            {c.name}
                          </option>
                        ))}
                      </select>
                    </Field>
                    <div className="invite">
                      <div>
                        <span className="eyebrow">INVITE CODE</span>
                        <strong>{challenge?.code}</strong>
                      </div>
                      <button
                        className="secondary"
                        onClick={() =>
                          void run(async () => {
                            await navigator.clipboard.writeText(
                              location.origin + "/?invite=" + challenge?.code,
                            );
                            setNotice("Invite link copied.");
                          })
                        }
                      >
                        Copy link
                      </button>
                    </div>
                    <p className="small">
                      Up to 10 friends · 90 days · Personal targets · Adherence
                      only
                    </p>
                    {[...board]
                      .map((b) => {
                        const elapsed = Math.max(
                          1,
                          Math.min(
                            90,
                            dayDiff(today, challenge?.start || today) + 1,
                          ),
                        );
                        return {
                          ...b,
                          total: Math.round(
                            b.days.reduce(
                              (s, d) =>
                                s + d.nutrition + d.alcohol + d.consistency,
                              0,
                            ) /
                              elapsed +
                              25 *
                                Math.min(
                                  1,
                                  b.training_target === 0
                                    ? 1
                                    : b.days.filter((d) => d.trainingDone)
                                        .length /
                                        ((b.training_target * elapsed) / 7),
                                ),
                          ),
                        };
                      })
                      .sort((a, b) => b.total - a.total)
                      .map((b, i) => (
                        <div className="leader" key={b.user_id}>
                          <span className="rank">{i + 1}</span>
                          <span className="avatar">{b.name.slice(0, 1)}</span>
                          <b>{b.name}</b>
                          <strong>{b.total}%</strong>
                        </div>
                      ))}
                    {!board.length && (
                      <p>
                        No shared check-ins yet. Sharing can be changed in
                        Settings.
                      </p>
                    )}
                    <div className="notice">
                      <Sparkles size={19} />
                      <b> Group moments</b>
                      <p>
                        {board.length >= 2 &&
                        board.every(
                          (b) =>
                            b.days.filter(
                              (d) => days.includes(d.day) && d.trainingDone,
                            ).length >= b.training_target,
                        )
                          ? "Training sweep!"
                          : "Your next milestone: 30 Green days together."}
                      </p>
                      <p>
                        {board.reduce(
                          (s, b) =>
                            s +
                            b.days.filter(
                              (d) =>
                                d.nutrition === 35 &&
                                d.alcohol === 25 &&
                                !d.gold,
                            ).length,
                          0,
                        )}{" "}
                        shared Green days so far.
                      </p>
                    </div>
                  </section>
                )}
                <div className="grid">
                  <section className="card">
                    <h2>Start something good.</h2>
                    <form
                      onSubmit={(e) => {
                        e.preventDefault();
                        const f = new FormData(e.currentTarget);
                        void run(async () => {
                          const j = await api({
                            action: "challenge",
                            mode: "create",
                            name: f.get("name"),
                            start: f.get("start"),
                          });
                          await reload();
                          await showBoard(j.data.id);
                        });
                      }}
                    >
                      <Field label="Challenge name">
                        <input
                          name="name"
                          defaultValue="The next 90"
                          maxLength={60}
                          required
                        />
                      </Field>
                      <Field label="Start date">
                        <input
                          name="start"
                          type="date"
                          defaultValue={today}
                          required
                        />
                      </Field>
                      <button className="primary" disabled={busy}>
                        Create challenge <Plus size={18} />
                      </button>
                    </form>
                  </section>
                  <section className="card">
                    <h2>Got an invite?</h2>
                    <form
                      onSubmit={(e) => {
                        e.preventDefault();
                        void run(async () => {
                          const j = await api({
                            action: "challenge",
                            mode: "join",
                            code: invite,
                          });
                          await reload();
                          await showBoard(j.data.id);
                          setNotice("You’re in. Let’s do this.");
                        });
                      }}
                    >
                      <Field label="Invite code">
                        <input
                          value={invite}
                          onChange={(e) => setInvite(e.target.value)}
                          required
                        />
                      </Field>
                      <button className="secondary" disabled={busy}>
                        Join challenge
                      </button>
                    </form>
                  </section>
                </div>
              </>
            )}
            {tab === "Events" && (
              <>
                <div className="eyebrow">INTENTIONAL FLEXIBILITY</div>
                <h1>The good stuff belongs.</h1>
                <section className="card gold-card">
                  <Sparkles size={30} />
                  <h2>A social life is part of the plan.</h2>
                  <p>
                    Plan it. Enjoy it. Log it. No starving beforehand, no
                    punishment afterwards.
                  </p>
                  <form
                    onSubmit={(e) => {
                      e.preventDefault();
                      const f = new FormData(e.currentTarget);
                      void run(async () => {
                        await api({
                          action: "event",
                          name: f.get("name"),
                          day: f.get("day"),
                          size: f.get("size"),
                        });
                        analytics("gold_created");
                        await reload();
                        setNotice(
                          "Gold Event planned. Keep your regular meals.",
                        );
                      });
                    }}
                  >
                    <Field label="Event name">
                      <input
                        name="name"
                        placeholder="Dinner with the crew"
                        maxLength={80}
                        required
                      />
                    </Field>
                    <div className="form-grid">
                      <Field label="Date">
                        <input
                          type="date"
                          name="day"
                          min={today}
                          defaultValue={today}
                          required
                        />
                      </Field>
                      <Field label="Event size">
                        <select name="size">
                          <option>Dinner</option>
                          <option>Drinks</option>
                          <option>Big one</option>
                        </select>
                      </Field>
                    </div>
                    <button className="primary" disabled={busy}>
                      Add Gold Event <Plus size={18} />
                    </button>
                  </form>
                </section>
                {[...data.events]
                  .sort((a, b) => a.day.localeCompare(b.day))
                  .map((e) => (
                    <section className="card between" key={e.id}>
                      <Sparkles />
                      <div className="grow">
                        <h3>{e.name}</h3>
                        <p>
                          {e.day} · {e.size}
                        </p>
                      </div>
                      <button
                        className="text-button"
                        onClick={() => navigate("Today")}
                      >
                        Log afterwards
                      </button>
                      <button
                        aria-label="Remove event"
                        className="icon-button"
                        onClick={() =>
                          void run(async () => {
                            await api({ action: "deleteEvent", id: e.id });
                            await reload();
                          })
                        }
                      >
                        <X size={17} />
                      </button>
                    </section>
                  ))}
              </>
            )}
            {tab === "Settings" && (
              <>
                <div className="eyebrow">MAKE IT YOURS</div>
                <h1>Your plan. Your privacy.</h1>
                <section className="card">
                  <h2>Personal targets</h2>
                  <p>
                    Estimated BMR {fmt(t!.bmr)} kcal · TDEE {fmt(t!.tdee)} kcal
                  </p>
                  <p>
                    Maintenance {range(t!.maintenanceLow, t!.maintenanceHigh)}{" "}
                    kcal
                  </p>
                  <p>
                    Target {range(t!.low, t!.high)} kcal · Protein ~{t!.protein}{" "}
                    g
                  </p>
                  <button
                    className="secondary"
                    onClick={() => setEditing(true)}
                  >
                    Edit profile & targets
                  </button>
                  <p className="small">
                    Activity is already included in TDEE. Workouts don’t create
                    extra calorie credit. Targets below estimated resting needs
                    are raised.
                  </p>
                </section>
                <section className="card">
                  <h2>Privacy comes first.</h2>
                  <label className="check">
                    <input
                      type="checkbox"
                      checked={p.share}
                      onChange={(e) =>
                        void run(async () => {
                          await api({
                            action: "profile",
                            data: { ...p, share: e.target.checked },
                          });
                          await reload();
                        })
                      }
                    />
                    Share my name and adherence with challenge friends
                  </label>
                  <p>
                    Weight, waist, exact calories, drinks and your food diary
                    are never on the leaderboard.
                  </p>
                  <p className="small">
                    Food descriptions are sent to OpenAI when you request
                    interpretation. Voice uses your browser/device speech
                    service. We store confirmed estimates, not audio. Analytics
                    record actions and duration, not diary text.
                  </p>
                  <button
                    className="text-button"
                    onClick={() => {
                      const blob = new Blob([JSON.stringify(data, null, 2)], {
                        type: "application/json",
                      });
                      const a = document.createElement("a");
                      a.href = URL.createObjectURL(blob);
                      a.download = "fittt-private-export.json";
                      a.click();
                      URL.revokeObjectURL(a.href);
                    }}
                  >
                    Export my data
                  </button>
                  <button
                    className="text-button"
                    onClick={() => {
                      if (
                        confirm(
                          "Permanently delete your FITTT diary, measurements, events and food memories?",
                        )
                      )
                        void run(async () => {
                          await api({ action: "deleteDiary" });
                          await reload();
                          setNotice("Your private diary has been cleared.");
                        });
                    }}
                  >
                    Delete my private diary
                  </button>
                </section>
                <section className="card">
                  <h2>Food memory</h2>
                  <p>
                    Confirmed meals you’ve asked FITTT to remember. Use their
                    name to log again.
                  </p>
                  {data.memories.map((m) => (
                    <div className="between" key={m.name}>
                      <b>{m.name}</b>
                      <button
                        className="text-button"
                        onClick={() =>
                          void run(async () => {
                            await api({
                              action: "entry",
                              id: crypto.randomUUID(),
                              day: today,
                              estimate: m.estimate,
                              source: "memory",
                            });
                            await reload();
                            setNotice("Meal added to today.");
                          })
                        }
                      >
                        Log again
                      </button>
                      <button
                        className="icon-button"
                        aria-label={"Forget " + m.name}
                        onClick={() =>
                          void run(async () => {
                            await api({ action: "deleteMemory", name: m.name });
                            await reload();
                          })
                        }
                      >
                        <X size={16} />
                      </button>
                    </div>
                  ))}
                </section>
                <section className="card">
                  <h2>Keep it lightweight.</h2>
                  <p>
                    Your recorded AI cost: US$
                    {data.ai_usage
                      .reduce((s, u) => s + Number(u.cost_usd), 0)
                      .toFixed(4)}
                    . Cached meals and Fast Mode use no AI.
                  </p>
                  <p className="small">
                    Sunday review is available in Progress. This V1 does not
                    send push notifications.
                  </p>
                  <button
                    className="secondary"
                    onClick={() =>
                      void run(async () => {
                        await api({ action: "logout" }, "/api/auth");
                        setData(empty);
                      })
                    }
                  >
                    Sign out
                  </button>
                </section>
              </>
            )}
            <button
              className="feedback-trigger"
              onClick={() => setFeedback(true)}
            >
              <MessageCircle size={17} /> Something annoying?
            </button>
            {feedback && (
              <section
                className="modal"
                role="dialog"
                aria-modal="true"
                aria-label="Send feedback"
              >
                <div className="card">
                  <div className="between">
                    <h2>Make FITTT better.</h2>
                    <button
                      aria-label="Close feedback"
                      onClick={() => setFeedback(false)}
                    >
                      <X />
                    </button>
                  </div>
                  <textarea
                    aria-label="Feedback"
                    placeholder="What got in your way?"
                    value={feedbackText}
                    onChange={(e) => setFeedbackText(e.target.value)}
                  />
                  <div className="actions">
                    <button
                      className="secondary"
                      onClick={() => speak(setFeedbackText)}
                      disabled={voice}
                    >
                      <Mic size={18} />
                      {voice ? "Listening…" : "Speak"}
                    </button>
                    <button
                      className="primary"
                      disabled={busy || !feedbackText}
                      onClick={() =>
                        void run(async () => {
                          await api({
                            action: "feedback",
                            message: feedbackText,
                          });
                          setFeedback(false);
                          setFeedbackText("");
                          setNotice("Feedback saved. Thank you.");
                        })
                      }
                    >
                      Send feedback
                    </button>
                  </div>
                </div>
              </section>
            )}
          </>
        )}
      </main>
      {data.user && p && !editing && (
        <nav aria-label="Main navigation">
          {[
            [Sun, "Today"],
            [ChartNoAxesCombined, "Progress"],
            [Users, "Friends"],
            [Sparkles, "Events"],
            [Settings, "Settings"],
          ].map(([Icon, label]) => {
            const I = Icon as typeof Sun;
            return (
              <button
                key={label as string}
                className={tab === label ? "active" : ""}
                onClick={() => navigate(label as string)}
              >
                <I size={21} />
                <span>{label as string}</span>
              </button>
            );
          })}
        </nav>
      )}
    </>
  );
}
function Onboarding({
  initial,
  busy,
  onSave,
  onCancel,
}: {
  initial?: Profile;
  busy: boolean;
  onSave: (p: Profile) => void;
  onCancel?: () => void;
}) {
  return (
    <section className="onboarding">
      <div className="eyebrow">A PLAN THAT FITS YOU</div>
      <h1>{initial ? "A little fine-tuning." : "First, the basics."}</h1>
      <p>
        About a minute. Estimates, not a prescription. You can refine these
        later.
      </p>
      <form
        className="card"
        onSubmit={(e) => {
          e.preventDefault();
          const f = new FormData(e.currentTarget);
          const num = (k: string) => Number(f.get(k));
          const optional = (k: string) => (f.get(k) ? num(k) : null);
          onSave({
            name: String(f.get("name")),
            age: num("age"),
            sex: f.get("sex") as Profile["sex"],
            height: num("height"),
            weight: num("weight"),
            goal: f.get("goal") as Profile["goal"],
            training: num("training"),
            activity: f.get("activity") as Profile["activity"],
            difficulty: f.get("difficulty") as Profile["difficulty"],
            alcoholFrequency: num("alcoholFrequency"),
            start: String(f.get("start")),
            timezone: Intl.DateTimeFormat().resolvedOptions().timeZone,
            targetWeight: optional("targetWeight"),
            waist: optional("waist"),
            calorieLow: optional("calorieLow"),
            calorieHigh: optional("calorieHigh"),
            protein: optional("protein"),
            share: f.get("share") === "on",
            minimum: String(f.get("minimum")),
            reviewReminder: false,
          });
        }}
      >
        <Field label="First name">
          <input
            name="name"
            autoComplete="given-name"
            defaultValue={initial?.name}
            maxLength={40}
            required
          />
        </Field>
        <div className="form-grid">
          <Field label="Age (18+)">
            <input
              name="age"
              type="number"
              min={18}
              max={100}
              defaultValue={initial?.age || 30}
              required
            />
          </Field>
          <Field label="Sex for energy estimate">
            <select name="sex" defaultValue={initial?.sex || "unspecified"}>
              <option value="unspecified">Prefer not to say</option>
              <option value="male">Male</option>
              <option value="female">Female</option>
            </select>
          </Field>
          <Field label="Height (cm)">
            <input
              name="height"
              type="number"
              min={120}
              max={230}
              defaultValue={initial?.height || 175}
              required
            />
          </Field>
          <Field label="Current weight (kg, private)">
            <input
              name="weight"
              type="number"
              step="0.1"
              min={40}
              max={250}
              defaultValue={initial?.weight || 80}
              required
            />
          </Field>
          <Field label="Goal">
            <select name="goal" defaultValue={initial?.goal || "maintain"}>
              <option value="maintain">Maintain</option>
              <option value="lose">Lose fat</option>
              <option value="gain">Gain</option>
            </select>
          </Field>
          <Field label="Training days / week">
            <input
              name="training"
              type="number"
              min={0}
              max={7}
              defaultValue={initial?.training ?? 3}
            />
          </Field>
          <Field label="Daily activity">
            <select
              name="activity"
              defaultValue={initial?.activity || "moderate"}
            >
              <option value="low">Mostly seated / under 5k steps</option>
              <option value="moderate">Mixed / around 5–10k steps</option>
              <option value="high">Active / usually over 10k steps</option>
            </select>
          </Field>
          <Field label="Drinking days / week">
            <input
              name="alcoholFrequency"
              type="number"
              min={0}
              max={7}
              defaultValue={initial?.alcoholFrequency ?? 1}
            />
          </Field>
          <Field label="Your pace">
            <select
              name="difficulty"
              defaultValue={initial?.difficulty || "balanced"}
            >
              <option value="gentle">Gentle</option>
              <option value="balanced">Balanced</option>
              <option value="focused">Focused</option>
            </select>
          </Field>
          <Field label="Start date">
            <input
              name="start"
              type="date"
              defaultValue={initial?.start || dateInZone()}
              required
            />
          </Field>
        </div>
        <details>
          <summary>Optional measurements & target refinements</summary>
          <div className="form-grid">
            {[
              ["waist", "Waist (cm)"],
              ["targetWeight", "Target weight (kg)"],
              ["calorieLow", "Calorie target low"],
              ["calorieHigh", "Calorie target high"],
              ["protein", "Protein target (g)"],
            ].map(([key, label]) => (
              <Field key={key} label={label}>
                <input
                  name={key}
                  type="number"
                  step="0.1"
                  defaultValue={
                    (initial?.[key as keyof Profile] as number) || ""
                  }
                />
              </Field>
            ))}
          </div>
        </details>
        <Field label="My minimum on a chaotic day">
          <textarea
            name="minimum"
            maxLength={300}
            defaultValue={
              initial?.minimum ||
              "Regular meals with protein, some fruit or vegetables, a comfortable walk, and no unplanned alcohol."
            }
          />
        </Field>
        <label className="check">
          <input
            type="checkbox"
            name="share"
            defaultChecked={initial?.share ?? true}
          />
          Share my name and adherence with challenge friends
        </label>
        <p className="small">
          Body measurements and diary stay private. If pregnant, breastfeeding,
          managing an eating disorder or a condition affecting nutrition, use a
          clinician’s targets.
        </p>
        <button className="primary" disabled={busy}>
          Save my plan <ArrowUpRight size={18} />
        </button>
        {onCancel && (
          <button type="button" className="text-button" onClick={onCancel}>
            Cancel
          </button>
        )}
      </form>
    </section>
  );
}
