import { expect, test } from "vitest";
import {
  AuthApiError,
  AuthSessionMissingError,
  AuthRetryableFetchError,
} from "@supabase/supabase-js";
import { sessionFailure } from "../lib/session-diagnostics";

test("sign-in diagnostics use fixed categories and never include error details", () => {
  expect(sessionFailure(new AuthSessionMissingError(), false)).toBe(
    "missing_cookie",
  );
  expect(sessionFailure(new AuthSessionMissingError(), true)).toBe(
    "invalid_cookie",
  );
  expect(
    sessionFailure(
      new AuthApiError("private detail", 400, "refresh_token_already_used"),
      true,
    ),
  ).toBe("refresh_reused");
  expect(
    sessionFailure(
      new AuthApiError("private detail", 400, "session_not_found"),
      true,
    ),
  ).toBe("session_revoked");
  expect(
    sessionFailure(new AuthRetryableFetchError("private detail", 503), true),
  ).toBe("auth_unavailable");
});
