import { db } from "@/lib/supabase";
import { NextResponse } from "next/server";
export async function GET(req: Request) {
  const url = new URL(req.url);
  const code = url.searchParams.get("code");
  if (code) {
    const s = await db();
    const { error } = await s.auth.exchangeCodeForSession(code);
    if (!error)
      return NextResponse.redirect(
        new URL("/", process.env.NEXT_PUBLIC_APP_URL || url.origin),
      );
  }
  return NextResponse.redirect(
    new URL("/?authError=1", process.env.NEXT_PUBLIC_APP_URL || url.origin),
  );
}
