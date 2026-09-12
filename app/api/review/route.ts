import { db } from "@/lib/supabase";
export async function POST() {
  const s = await db();
  const {
    data: { user },
  } = await s.auth.getUser();
  if (!user) return Response.json({ error: "Please sign in" }, { status: 401 });
  const {
    data: { session },
  } = await s.auth.getSession();
  try {
    const r = await fetch(
      process.env.NEXT_PUBLIC_SUPABASE_URL + "/functions/v1/fittt-weekly",
      {
        method: "POST",
        headers: {
          Authorization: "Bearer " + session!.access_token,
          apikey: process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY!,
        },
        signal: AbortSignal.timeout(25000),
      },
    );
    if (!r.ok) throw Error("Unavailable");
    return Response.json(
      { ok: true },
      { headers: { "Cache-Control": "private, no-store" } },
    );
  } catch {
    return Response.json(
      {
        error: "Your saved recap is still available. Try refreshing it later.",
      },
      { status: 503 },
    );
  }
}
