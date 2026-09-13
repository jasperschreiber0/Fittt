import { expect, test, vi } from "vitest";
import {
  AuthRetryableFetchError,
  AuthSessionMissingError,
  AuthApiError,
} from "@supabase/supabase-js";
import { GET } from "../app/api/data/route";

const getUser = vi.hoisted(() => vi.fn());
vi.mock("next/headers", () => ({ headers: async () => new Headers() }));
vi.mock("@/lib/supabase", () => ({ db: async () => ({ auth: { getUser } }) }));

test("an unavailable auth service cannot masquerade as a signed-out account", async () => {
  getUser.mockResolvedValue({
    data: { user: null },
    error: new AuthRetryableFetchError("offline", 503),
  });
  const response = await GET();
  expect(response.status).toBe(503);
  expect(await response.json()).not.toHaveProperty("user");
  expect(response.headers.get("cache-control")).toContain("no-store");
});

test.each([
  new AuthSessionMissingError(),
  new AuthApiError("Revoked session", 400, "session_not_found"),
])(
  "a genuinely missing or revoked session still opens sign-in",
  async (error) => {
    getUser.mockResolvedValue({ data: { user: null }, error });
    const response = await GET();
    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({ user: null });
    expect(response.headers.get("cache-control")).toContain("no-store");
  },
);
