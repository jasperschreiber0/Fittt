"use client";
import { useEffect, useRef, useState } from "react";
import { Mic, Square, Keyboard } from "lucide-react";

type Recognition = {
  lang: string;
  continuous: boolean;
  interimResults: boolean;
  onstart: (() => void) | null;
  onresult:
    | ((event: {
        results: ArrayLike<ArrayLike<{ transcript: string }>>;
      }) => void)
    | null;
  onerror: ((event: { error: string }) => void) | null;
  onend: (() => void) | null;
  start(): void;
  stop(): void;
  abort(): void;
};

export function VoiceComposer({
  value,
  onChange,
  onActive,
  onStart,
  disabled,
}: {
  value: string;
  onChange: (value: string, source: "text" | "voice") => void;
  onActive: (active: boolean) => void;
  onStart: () => void;
  disabled: boolean;
}) {
  const [state, setState] = useState<
    "idle" | "starting" | "listening" | "stopping"
  >("idle");
  const [message, setMessage] = useState(
    "Speak naturally, or type below. You’ll review before saving.",
  );
  const recognition = useRef<Recognition | null>(null);
  const editor = useRef<HTMLTextAreaElement>(null);
  const panel = useRef<HTMLDivElement>(null);
  const stopTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const active = state !== "idle";
  useEffect(
    () => () => {
      const r = recognition.current;
      if (r) {
        r.onend = null;
        r.onresult = null;
        r.onerror = null;
        r.onstart = null;
        r.abort();
      }
      if (stopTimer.current) clearTimeout(stopTimer.current);
    },
    [],
  );
  useEffect(() => {
    onActive(active);
    return () => onActive(false);
  }, [active, onActive]);

  function start() {
    const w = window as unknown as {
      SpeechRecognition?: new () => Recognition;
      webkitSpeechRecognition?: new () => Recognition;
    };
    const C = w.SpeechRecognition || w.webkitSpeechRecognition;
    if (!C) {
      setMessage(
        "Use the microphone on your phone’s keyboard to dictate here, or type your day.",
      );
      editor.current?.focus();
      return;
    }
    const r = new C();
    recognition.current = r;
    const before = value.trim();
    let heard = false,
      failed = false;
    r.lang = "en-AU";
    r.continuous = true;
    r.interimResults = true;
    const finish = () => {
      if (recognition.current !== r) return;
      recognition.current = null;
      if (stopTimer.current) clearTimeout(stopTimer.current);
      setState("idle");
      if (!failed)
        setMessage(
          heard
            ? "Words captured. Edit anything, then review your day. Not saved yet."
            : "No words heard yet. Try again, or use your keyboard’s microphone.",
        );
    };
    r.onstart = () => {
      if (recognition.current !== r) return;
      setState("listening");
      setMessage("Listening — your words appear below as you speak.");
      if (window.matchMedia("(max-width: 600px)").matches)
        requestAnimationFrame(() =>
          panel.current?.scrollIntoView({
            block: "start",
            behavior: "instant",
          }),
        );
    };
    r.onresult = (event) => {
      if (recognition.current !== r) return;
      // Rebuild this session's results: interim hypotheses replace themselves.
      const spoken = Array.from(event.results)
        .map((result) => result[0]?.transcript || "")
        .join(" ")
        .trim();
      heard = !!spoken;
      onChange([before, spoken].filter(Boolean).join("\n"), "voice");
      requestAnimationFrame(() => {
        if (editor.current)
          editor.current.scrollTop = editor.current.scrollHeight;
      });
    };
    r.onerror = (event) => {
      failed = true;
      setMessage(
        event.error === "not-allowed" || event.error === "service-not-allowed"
          ? "Microphone access wasn’t allowed. Enable it in browser settings, or use keyboard dictation below."
          : "Listening stopped. Your words are still here — try again or type the rest.",
      );
      finish();
      r.abort();
    };
    r.onend = finish;
    setState("starting");
    setMessage("Allow microphone access if asked. Connecting your microphone…");
    try {
      r.start();
      onStart();
    } catch {
      failed = true;
      setMessage(
        "Couldn’t start the microphone. Try again or use keyboard dictation.",
      );
      finish();
    }
  }
  function stop() {
    const r = recognition.current;
    if (!r) return;
    setState("stopping");
    setMessage("Finishing your words…");
    try {
      r.stop();
    } catch {
      r.abort();
      r.onend?.();
      return;
    }
    stopTimer.current = setTimeout(() => {
      if (recognition.current !== r) return;
      r.abort();
      r.onend?.();
    }, 2000);
  }
  return (
    <div
      ref={panel}
      className={`voice-composer ${active ? "is-listening" : ""}`}
    >
      <button
        type="button"
        className="voice"
        disabled={disabled || state === "stopping"}
        aria-pressed={active}
        onClick={active ? stop : start}
      >
        {active ? <Square size={20} fill="currentColor" /> : <Mic size={24} />}
        {state === "starting"
          ? "Cancel microphone"
          : state === "stopping"
            ? "Finishing…"
            : active
              ? "Done talking"
              : value
                ? "Add more by voice"
                : "Log my day"}
      </button>
      <div className="capture-status" role="status" aria-live="polite">
        {state === "listening" && (
          <span className="listening-dot" aria-hidden="true" />
        )}
        {message}
      </div>
      <label className="draft-label" htmlFor="day-draft">
        {active ? "Your words, live" : "Your day, in your words"}
        <span>Draft · not saved</span>
      </label>
      <textarea
        id="day-draft"
        ref={editor}
        aria-label="Describe your food, drinks and movement"
        readOnly={active}
        disabled={disabled}
        placeholder="Eggs on toast, chicken wrap for lunch, a walk after work…"
        value={value}
        onChange={(event) => onChange(event.target.value, "text")}
      />
      {active ? (
        <p className="small">
          Keep going. Tap Done talking when you’re ready to review.
        </p>
      ) : (
        <button
          type="button"
          className="text-button"
          onClick={() => editor.current?.focus()}
        >
          <Keyboard size={17} /> Prefer to type? Tap here
        </button>
      )}
    </div>
  );
}
