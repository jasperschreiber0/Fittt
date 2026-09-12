# Production verification — 12 September 2026

Live service: https://fittt-production.up.railway.app

Application commit tested: `6258b499554c9b59650d9adda08f6ad1b574d019`. Railway deployment `85dc1206-1354-4113-b435-48ad179d2d48` reached SUCCESS. Subsequent documentation-only commits do not change the tested application behavior.

## Passed

- ESLint, TypeScript, 13 unit tests, and Next.js production build.
- Three Playwright production tests (1.1 minutes): three independent synthetic users through onboarding, challenge create/join, Fast Mode, Gold Events, leaderboard and private progress; anonymous API denial; real OpenAI interpretation, correction, UUID retry deduplication, multiple-entry merging, complete-day check-in, remembered-food reuse and safety handling.
- Database checks with an authenticated synthetic user denied access to another user's profile, diary and weights. Every existing public Kaspr table returned zero accessible rows or permission denied under that identity. The reusable transaction check is in `supabase/tests/rls.sql`.
- All 12 FITTT tables have RLS. Challenge joining is transactionally capped, private helper functions have fixed search paths, and Gold Events cannot be retrospectively updated.
- Disposable accounts, their sessions and FITTT test records were removed after testing; exact account-ID verification returned zero remaining users. Local fixture credentials were removed.

## Applied database changes

- `20260912063239_fittt_v1.sql`
- `20260912064759_fittt_privacy_refinements.sql`
- `20260912071106_fittt_event_integrity.sql`

Only FITTT-prefixed database objects and `fittt_private` were changed. Edge function `fittt-interpret` version 3 is deployed with explicit user verification and per-user usage reservations. Existing OpenAI configuration was reused through encrypted secrets.

## Supabase advisors

Latest run: 12 September 2026, approximately 07:19 UTC.

Security: no FITTT object findings. Shared-project findings are 22 informational Kaspr tables with RLS and no policies (default deny) and one warning for disabled leaked-password protection. Existing Kaspr policies and shared Auth settings were preserved. Password-warning guidance: https://supabase.com/docs/guides/auth/password-security#password-strength-and-leaked-password-protection

Performance: 23 pre-existing unindexed foreign-key notices, 16 unused-index notices (three for new FITTT indexes), and one shared Auth connection-allocation notice. Retain new FITTT indexes for growing workloads; there are no FITTT unindexed foreign-key findings. Guidance: https://supabase.com/docs/guides/database/database-linter and https://supabase.com/docs/guides/deployment/going-into-prod

## Remaining external setup

Production email signup is not yet verified end to end. The automated tests used disposable preconfirmed users and authenticated sessions; they do not establish email delivery or successful magic-link signup.

1. Completed after explicit user approval: added `https://fittt-production.up.railway.app/auth/callback` to the shared Supabase redirect allowlist and verified it in the dashboard. Kaspr's existing site URL was preserved.
2. Configure a verified production email sender. Supabase currently uses its restricted built-in mailer. Resend is signed out in the connected browser; sender verification/configuration remains pending. Shared SMTP must preserve existing Kaspr email behavior.
3. After those changes, verify actual email signup and callback with pilot accounts.

The Railway service uses its configured Dockerfile, port 3000 and `/api/health`; `railway.json` is a reference because this service uses Railway's current dashboard configuration.
