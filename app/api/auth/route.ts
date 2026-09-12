import { db } from "@/lib/supabase";
import { z } from "zod";
export async function POST(req: Request) {
  const s = await db();
  const parsed = z
    .discriminatedUnion("action", [
      z.object({ action: z.literal("logout") }),
      z.object({
        action: z.literal("login"),
        email: z.string().trim().toLowerCase().pipe(z.email()),
      }),
      z.object({
        action: z.literal("verify"),
        email: z.string().trim().toLowerCase().pipe(z.email()),
        token: z
          .string()
          .trim()
          .regex(/^\d{6,8}$/),
      }),
    ])
    .safeParse(await req.json().catch(() => null));
  if (!parsed.success)
    return Response.json(
      {
        error:
          "Enter a valid email address and the 6–8 digit code from your newest email.",
      },
      { status: 400 },
    );
  const b = parsed.data;
  if (b.action === "logout") {
    const { error } = await s.auth.signOut({ scope: "local" });
    if (error)
      return Response.json(
        { error: "Could not sign out. Please try again." },
        { status: 503 },
      );
    return Response.json({ ok: true });
  }
  const email = b.email;
  if (b.action === "verify") {
    const { error } = await s.auth.verifyOtp({
      email,
      token: b.token,
      type: "email",
    });
    return Response.json(
      error
        ? {
            error:
              error.code === "otp_expired"
                ? "That code is invalid or expired. Use the newest email, or resend a code."
                : error.message,
          }
        : { ok: true },
      {
        status: error ? 400 : 200,
      },
    );
  }
  const { error } = await s.auth.signInWithOtp({
    email,
    options: {
      emailRedirectTo: new URL(
        "/auth/callback",
        process.env.NEXT_PUBLIC_APP_URL || req.url,
      ).toString(),
    },
  });
  return Response.json(error ? { error: error.message } : { ok: true }, {
    status: error ? 400 : 200,
  });
}
