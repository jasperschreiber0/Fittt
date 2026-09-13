export function pushEndpointAllowed(endpoint: string) {
  try {
    const u = new URL(endpoint);
    return (
      u.protocol === "https:" &&
      !u.username &&
      !u.password &&
      !u.port &&
      !u.hash &&
      /^(fcm\.googleapis\.com|updates\.push\.services\.mozilla\.com|[a-z0-9-]+\.push\.apple\.com|[a-z0-9-]+\.notify\.windows\.com)$/.test(
        u.hostname,
      )
    );
  } catch {
    return false;
  }
}
export function reminderDue(
  now: Date,
  timezone: string,
  lunch: boolean,
  evening: boolean,
) {
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: timezone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    hourCycle: "h23",
  }).formatToParts(now);
  const v = Object.fromEntries(parts.map((p) => [p.type, p.value]));
  const slot =
    v.hour === "12" && lunch
      ? "lunch"
      : v.hour === "19" && evening
        ? "evening"
        : null;
  if (!slot || Number(v.minute) >= 15) return null;
  return { day: `${v.year}-${v.month}-${v.day}`, slot };
}
export function reminderPayload(slot: string, day: string) {
  return {
    title: "FITTT",
    body:
      slot === "lunch"
        ? "How’s your day going? A quick voice log is enough."
        : "Anything to add today? Food, drinks, training—tell FITTT about your day.",
    tag: `fittt-${day}-${slot}`,
    url: "/",
  };
}
