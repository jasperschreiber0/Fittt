import { db } from "@/lib/supabase";
import { pushEndpointAllowed } from "@/lib/reminders";
import { z } from "zod";

const json = (b: unknown, status = 200) =>
  Response.json(b, {
    status,
    headers: { "Cache-Control": "private, no-store" },
  });
const endpoint = z.string().max(2048).refine(pushEndpointAllowed);
const timezone = z
  .string()
  .max(80)
  .refine((v) => {
    try {
      new Intl.DateTimeFormat("en", { timeZone: v });
      return true;
    } catch {
      return false;
    }
  });
const schema = z.discriminatedUnion("action", [
  z.object({
    action: z.literal("save"),
    endpoint,
    p256dh: z.string().regex(/^[A-Za-z0-9_-]{87}=?$/),
    auth: z.string().regex(/^[A-Za-z0-9_-]{22}={0,2}$/),
    timezone,
    lunch: z.boolean(),
    evening: z.boolean(),
  }),
  z.object({ action: z.literal("remove"), endpoint }),
]);
export async function GET() {
  const s = await db();
  const {
    data: { user },
  } = await s.auth.getUser();
  if (!user) return json({ error: "Please sign in" }, 401);
  const { data, error } = await s
    .from("fittt_push_subscriptions")
    .select("endpoint,lunch,evening,timezone");
  if (error) return json({ error: "Could not load reminders" }, 503);
  const publicKey = process.env.FITTT_VAPID_PUBLIC_KEY;
  if (!publicKey)
    return json({ error: "Reminders are not available yet" }, 503);
  return json({ publicKey, subscriptions: data });
}
export async function POST(req: Request) {
  const s = await db();
  const {
    data: { user },
  } = await s.auth.getUser();
  if (!user) return json({ error: "Please sign in" }, 401);
  const parsed = schema.safeParse(await req.json().catch(() => null));
  if (!parsed.success)
    return json(
      { error: "Please enable reminders again using a supported browser." },
      400,
    );
  const b = parsed.data;
  if (b.action === "remove") {
    const { error } = await s
      .from("fittt_push_subscriptions")
      .delete()
      .eq("endpoint", b.endpoint);
    return error
      ? json({ error: "Could not switch off reminders. Try again." }, 503)
      : json({ ok: true });
  }
  const { error } = await s
    .from("fittt_push_subscriptions")
    .upsert(
      {
        user_id: user.id,
        endpoint: b.endpoint,
        p256dh: b.p256dh,
        auth: b.auth,
        timezone: b.timezone,
        lunch: b.lunch,
        evening: b.evening,
      },
      { onConflict: "endpoint" },
    );
  return error
    ? json({ error: "Could not save reminders. Try again." }, 503)
    : json({ ok: true });
}
