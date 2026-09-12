import { db } from "@/lib/supabase";
import {
  estimateSchema,
  estimateBase,
  unsafeText,
  safeMessage,
  targets,
  weeklyEnergy,
  dateInZone,
  type Entry,
} from "@/lib/engine";
import { z } from "zod";
import { createHash } from "node:crypto";
export async function POST(req: Request) {
  try {
    const s = await db();
    const {
      data: { user },
    } = await s.auth.getUser();
    if (!user)
      return Response.json({ error: "Please sign in" }, { status: 401 });
    const b = await req.json();
    const text = z.string().trim().min(1).max(2000).parse(b.text);
    if (unsafeText(text))
      return Response.json({ message: safeMessage, safety: true });
    const { data: p } = await s.from("fittt_profiles").select("data").single();
    if (!p)
      return Response.json(
        { error: "Finish onboarding first" },
        { status: 400 },
      );
    const { data: memories } = await s.from("fittt_memories").select("*");
    const memory = memories?.find((m) => m.name === text.toLowerCase());
    if (memory && !b.ask)
      return Response.json({
        estimate: estimateSchema.parse(memory.estimate),
        cached: true,
      });
    const { data: entries } = await s
      .from("fittt_entries")
      .select("*")
      .order("day", { ascending: false })
      .limit(100);
    const context = b.ask
      ? {
          targets: targets(p.data),
          week: weeklyEnergy(
            (entries ?? []) as Entry[],
            p.data,
            dateInZone(p.data.timezone),
          ),
        }
      : {
          memories: memories?.map((m) => ({
            name: m.name,
            estimate: m.estimate,
          })),
          recentEntries: entries
            ?.slice(0, 8)
            .map((e) => ({ day: e.day, estimate: e.estimate })),
        };
    const key = createHash("sha256")
      .update(
        JSON.stringify({
          text,
          ask: !!b.ask,
          clarified: !!b.clarified,
          context,
        }),
      )
      .digest("hex");
    const { data: cache } = await s
      .from("fittt_ai_cache")
      .select("result")
      .eq("key", key)
      .maybeSingle();
    if (cache) return Response.json({ ...cache.result, cached: true });
    const { data: session } = await s.auth.getSession();
    const response = await fetch(
      process.env.NEXT_PUBLIC_SUPABASE_URL + "/functions/v1/fittt-interpret",
      {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: "Bearer " + session.session!.access_token,
          apikey: process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY!,
        },
        body: JSON.stringify({
          text,
          ask: !!b.ask,
          clarified: !!b.clarified,
          context,
          schema: z.toJSONSchema(estimateBase),
        }),
      },
    );
    const raw = await response.json();
    if (!response.ok)
      return Response.json(
        {
          error: raw.error || "Interpretation unavailable. Fast Mode is ready.",
        },
        { status: 503 },
      );
    let result;
    if (b.ask) {
      result = { message: z.string().max(1500).parse(raw.message) };
      if (unsafeText(result.message)) result = { message: safeMessage };
    } else {
      const estimate = estimateSchema.parse(raw.estimate);
      if (b.clarified) estimate.clarification = null;
      result = { estimate };
    }
    await s.from("fittt_ai_cache").upsert({ user_id: user.id, key, result });
    return Response.json(result);
  } catch {
    return Response.json(
      {
        error:
          "Could not interpret that safely. Try a shorter description or Fast Mode.",
      },
      { status: 400 },
    );
  }
}
