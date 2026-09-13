"use client";
import { useEffect, useState, useSyncExternalStore } from "react";
import { Bell } from "lucide-react";
const subscribe = () => () => {};
function deviceState() {
  if (/FBAN|FBAV|FB_IAB|Messenger/i.test(navigator.userAgent))
    return "messenger";
  const ios =
    /iPhone|iPad|iPod/i.test(navigator.userAgent) ||
    (navigator.platform === "MacIntel" && navigator.maxTouchPoints > 1);
  if (
    ios &&
    !matchMedia("(display-mode: standalone)").matches &&
    !(navigator as Navigator & { standalone?: boolean }).standalone
  )
    return "install";
  if (
    !("serviceWorker" in navigator) ||
    !("PushManager" in window) ||
    !("Notification" in window)
  )
    return "unsupported";
  return Notification.permission === "denied" ? "blocked" : "ready";
}
async function save(body: unknown) {
  const r = await fetch("/api/push", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  const j = await r.json();
  if (!r.ok) throw Error(j.error || "Please try again.");
}
export function ReminderSettings() {
  const device = useSyncExternalStore(subscribe, deviceState, () => "loading");
  const [publicKey, setPublicKey] = useState("");
  const [enabled, setEnabled] = useState(false);
  const [lunch, setLunch] = useState(true),
    [evening, setEvening] = useState(true);
  const [busy, setBusy] = useState(false),
    [message, setMessage] = useState("");
  const [loaded, setLoaded] = useState(false);
  useEffect(() => {
    let cancelled = false;
    if (device !== "ready") return;
    void (async () => {
      const r = await fetch("/api/push", { cache: "no-store" });
      const j = await r.json();
      if (!r.ok) throw Error(j.error);
      await navigator.serviceWorker.register("/sw.js");
      const registration = await navigator.serviceWorker.ready;
      const sub = await registration.pushManager.getSubscription();
      const pref = j.subscriptions.find(
        (v: { endpoint: string }) => v.endpoint === sub?.endpoint,
      );
      if (cancelled) return;
      setPublicKey(j.publicKey);
      setEnabled(!!pref);
      if (pref) {
        setLunch(pref.lunch);
        setEvening(pref.evening);
      }
      setLoaded(true);
    })().catch((e) => {
      if (!cancelled) setMessage(e.message);
    });
    return () => {
      cancelled = true;
    };
  }, [device]);
  async function enable() {
    setBusy(true);
    setMessage("");
    try {
      // Permission is requested directly from the user's tap, never on page load.
      const permission = await Notification.requestPermission();
      if (permission !== "granted") {
        setMessage(
          "Notifications weren’t enabled. You can keep logging as usual.",
        );
        return;
      }
      const registration = await navigator.serviceWorker.ready;
      let sub = await registration.pushManager.getSubscription();
      if (sub && !enabled) {
        // A previous account may own this device endpoint; obtain a fresh one.
        await sub.unsubscribe();
        sub = null;
      }
      if (!sub) {
        const raw = atob(publicKey.replace(/-/g, "+").replace(/_/g, "/"));
        sub = await registration.pushManager.subscribe({
          userVisibleOnly: true,
          applicationServerKey: Uint8Array.from(raw, (c) => c.charCodeAt(0)),
        });
      }
      const data = sub.toJSON();
      await save({
        action: "save",
        endpoint: sub.endpoint,
        ...data.keys,
        timezone: Intl.DateTimeFormat().resolvedOptions().timeZone,
        lunch,
        evening,
      });
      setEnabled(true);
      setMessage("Reminders saved on this device.");
    } catch {
      setMessage(
        "Couldn’t enable reminders. Check notification settings and try again.",
      );
    } finally {
      setBusy(false);
    }
  }
  async function update(nextLunch: boolean, nextEvening: boolean) {
    const previous = { lunch, evening };
    setLunch(nextLunch);
    setEvening(nextEvening);
    setBusy(true);
    setMessage("");
    try {
      const sub = await (
        await navigator.serviceWorker.ready
      ).pushManager.getSubscription();
      if (!sub) throw Error("Please enable reminders again.");
      await save({
        action: "save",
        endpoint: sub.endpoint,
        ...sub.toJSON().keys,
        timezone: Intl.DateTimeFormat().resolvedOptions().timeZone,
        lunch: nextLunch,
        evening: nextEvening,
      });
      setLunch(nextLunch);
      setEvening(nextEvening);
      setMessage("Reminder times saved.");
    } catch (e) {
      setLunch(previous.lunch);
      setEvening(previous.evening);
      setMessage(e instanceof Error ? e.message : "Please try again.");
    } finally {
      setBusy(false);
    }
  }
  async function disable() {
    setBusy(true);
    setMessage("");
    try {
      const sub = await (
        await navigator.serviceWorker.ready
      ).pushManager.getSubscription();
      if (sub) {
        await save({ action: "remove", endpoint: sub.endpoint });
        await sub.unsubscribe();
      }
      setEnabled(false);
      setMessage("Reminders switched off on this device.");
    } catch {
      setMessage("Couldn’t switch off reminders. Please try again.");
    } finally {
      setBusy(false);
    }
  }
  return (
    <section className="card reminder-settings" aria-label="Daily reminders">
      <h2>
        <Bell size={20} aria-hidden="true" /> A gentle nudge.
      </h2>
      <p>
        12pm and 7pm, in your local time. We’ll skip a reminder if you’ve logged
        in the last hour.
      </p>
      {device === "install" ? (
        <p>
          On iPhone or iPad: open FITTT in Safari, tap Share → Add to Home
          Screen, then open the FITTT icon and enable reminders here.
        </p>
      ) : device === "messenger" ? (
        <p>
          Open FITTT in Safari or Chrome first. On iPhone, add it to your Home
          Screen too.
        </p>
      ) : device === "unsupported" ? (
        <p>
          This browser doesn’t support phone reminders. Try an updated Safari or
          Chrome.
        </p>
      ) : device === "blocked" ? (
        <p>
          Notifications are blocked. Allow them for FITTT in your browser or
          phone settings, then reopen the app.
        </p>
      ) : device === "ready" ? (
        <>
          <label className="check">
            <input
              type="checkbox"
              checked={lunch}
              disabled={busy}
              onChange={(e) =>
                enabled
                  ? void update(e.target.checked, evening)
                  : setLunch(e.target.checked)
              }
            />{" "}
            Lunch · 12pm
          </label>
          <label className="check">
            <input
              type="checkbox"
              checked={evening}
              disabled={busy}
              onChange={(e) =>
                enabled
                  ? void update(lunch, e.target.checked)
                  : setEvening(e.target.checked)
              }
            />{" "}
            Evening · 7pm
          </label>
          {enabled ? (
            <button
              className="secondary"
              disabled={busy}
              onClick={() => void disable()}
            >
              Turn off on this device
            </button>
          ) : (
            <button
              className="primary"
              disabled={busy || !loaded || (!lunch && !evening)}
              onClick={() => void enable()}
            >
              {busy ? "Setting up…" : "Enable reminders"}
            </button>
          )}
          {enabled && (
            <p className="small">
              {lunch || evening
                ? "Enabled on this device. Tap a notification to open Today."
                : "Both reminders are paused."}
            </p>
          )}
        </>
      ) : (
        <p>Checking this browser…</p>
      )}
      <p className="small" role="status">
        {message}
      </p>
    </section>
  );
}
