"use client";
import { useState, useSyncExternalStore } from "react";
import { Copy, ExternalLink } from "lucide-react";

const subscribe = () => () => {};
const browserAgent = () => navigator.userAgent;
const serverAgent = () => "";

export function BrowserNotice({ signedIn }: { signedIn: boolean }) {
  const agent = useSyncExternalStore(subscribe, browserAgent, serverAgent);
  const embedded = /FBAN|FBAV|FB_IAB|Messenger/i.test(agent);
  const browser = /iPhone|iPad|iPod/i.test(agent)
    ? "Safari"
    : /Android/i.test(agent)
      ? "Chrome"
      : "Safari or Chrome";
  const [copied, setCopied] = useState(false);
  const [manualLink, setManualLink] = useState("");
  if (!embedded && signedIn) return null;

  async function copyLink() {
    // Carry the public challenge invite, never a sign-in code or auth token.
    const link = new URL("/", window.location.origin);
    const invite = new URLSearchParams(window.location.search).get("invite");
    if (invite) link.searchParams.set("invite", invite);
    try {
      await navigator.clipboard.writeText(link.toString());
      setCopied(true);
      setManualLink("");
    } catch {
      setManualLink(link.toString());
    }
  }
  const help = (
    <>
      <p>
        Messenger’s browser may ask you to sign in again. Open FITTT in{" "}
        {browser} to keep using the same saved sign-in.
      </p>
      <ol>
        <li>
          Look for the link menu (⋯ or the share icon), then an option to open
          in your browser.
        </li>
        <li>
          If that option isn’t there, copy this link and paste it into {browser}
          .
        </li>
      </ol>
      <button className="secondary" onClick={() => void copyLink()}>
        <Copy size={16} /> Copy FITTT link
      </button>
      <p className="small" role="status">
        {copied
          ? `Link copied. Paste it into ${browser}.`
          : manualLink
            ? "Copy the link below, then paste it into your browser."
            : "You may need a code once in that browser. Then reopen FITTT there."}
      </p>
      {manualLink && (
        <input
          aria-label="FITTT link to copy"
          readOnly
          value={manualLink}
          onFocus={(e) => e.currentTarget.select()}
        />
      )}
    </>
  );
  return embedded ? (
    <aside className="browser-notice" aria-label="Open FITTT in your browser">
      <h2>
        <ExternalLink size={20} aria-hidden="true" /> Keep your sign-in in{" "}
        {browser}.
      </h2>
      {help}
    </aside>
  ) : (
    <details className="browser-help">
      <summary>Opened from Messenger?</summary>
      {help}
    </details>
  );
}
