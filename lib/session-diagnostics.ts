import {
  isAuthSessionMissingError,
  type AuthError,
} from "@supabase/supabase-js";

export function sessionFailure(error: AuthError | null, hasCookie: boolean) {
  if (!hasCookie) return "missing_cookie";
  if (error?.code === "refresh_token_already_used") return "refresh_reused";
  if (
    ["session_not_found", "refresh_token_not_found"].includes(error?.code || "")
  )
    return "session_revoked";
  if (error?.code === "bad_jwt" || isAuthSessionMissingError(error))
    return "invalid_cookie";
  return "auth_unavailable";
}
