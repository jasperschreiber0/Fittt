import { afterEach, expect, test, vi } from "vitest";
import { db } from "../lib/supabase";

const jar = vi.hoisted(
  () => new Map<string, { name: string; value: string; maxAge?: number }>(),
);
vi.mock("next/headers", () => ({
  cookies: async () => ({
    getAll: () => [...jar.values()],
    set: (name: string, value: string, options: { maxAge?: number }) => {
      if (options.maxAge === 0) jar.delete(name);
      else jar.set(name, { name, value, ...options });
    },
  }),
}));
afterEach(() => {
  jar.clear();
  vi.unstubAllEnvs();
  vi.unstubAllGlobals();
});

test("saved sign-in survives a new client and renews an expired access token without an email code", async () => {
  vi.stubEnv("NEXT_PUBLIC_SUPABASE_URL", "https://session-test.supabase.co");
  vi.stubEnv("NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY", "test-publishable-key");
  const user = {
    id: "11111111-1111-4111-8111-111111111111",
    email: "test@example.com",
    aud: "authenticated",
    created_at: "2026-01-01T00:00:00Z",
  };
  const jwt = (seconds: number) =>
    [
      { alg: "HS256", typ: "JWT" },
      {
        sub: user.id,
        exp: Math.floor(Date.now() / 1000) + seconds,
        aud: "authenticated",
      },
    ]
      .map((v) => Buffer.from(JSON.stringify(v)).toString("base64url"))
      .join(".") + ".test-signature";
  const calls: string[] = [];
  vi.stubGlobal(
    "fetch",
    vi.fn(async (input: string | URL | Request) => {
      const url = String(input);
      calls.push(url);
      if (url.endsWith("/verify"))
        return Response.json({
          access_token: jwt(-60),
          refresh_token: "test-refresh-old",
          expires_in: -60,
          token_type: "bearer",
          user,
        });
      if (url.includes("/token?grant_type=refresh_token"))
        return Response.json({
          access_token: jwt(3600),
          refresh_token: "test-refresh-new",
          expires_in: 3600,
          token_type: "bearer",
          user,
        });
      if (url.endsWith("/user")) return Response.json(user);
      if (url.includes("/logout?scope=local"))
        return new Response(null, { status: 204 });
      throw Error("Unexpected auth endpoint: " + url);
    }),
  );
  const first = await db();
  const login = await first.auth.verifyOtp({
    email: user.email,
    token: "12345678",
    type: "email",
  });
  expect(login.error).toBeNull();
  expect(jar.size).toBeGreaterThan(0);
  // A browser restart retains persistent cookies, but discards session cookies.
  for (const [name, cookie] of jar) {
    expect(cookie.maxAge).toBeGreaterThan(86400 * 90);
    if (!cookie.maxAge) jar.delete(name);
  }
  const reopened = await db();
  const restored = await reopened.auth.getUser();
  expect(restored.error).toBeNull();
  expect(restored.data.user?.id).toBe(user.id);
  expect(calls.filter((c) => c.endsWith("/verify"))).toHaveLength(1);
  expect(calls.some((c) => c.includes("grant_type=refresh_token"))).toBe(true);
  expect(calls.some((c) => c.includes("/otp"))).toBe(false);
  const logout = await reopened.auth.signOut({ scope: "local" });
  expect(logout.error).toBeNull();
  expect(calls.some((c) => c.includes("/logout?scope=local"))).toBe(true);
  expect(jar.size).toBe(0);
  expect((await (await db()).auth.getUser()).data.user).toBeNull();
});
