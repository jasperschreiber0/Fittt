# FITTT

Fitness for people who have a life.

Mobile-first 90-day challenges for 2–10 friends. Today is the default; Progress, Friends, Events and Settings are the only main navigation destinations.

## Stack and deployment

Next.js 16.3.5, React, TypeScript, Supabase Auth/Postgres, a private authenticated Supabase Edge Function for OpenAI structured interpretation, and Railway Docker deployment. All dependencies are pinned in package.json and package-lock.json.

Repository: https://github.com/jasperschreiber0/Fittt

Production service: https://fittt-production.up.railway.app

Railway project `turing`, service `fittt`; no Kaspr Railway service is changed. The app server uses only a Supabase publishable key. OpenAI runs in `fittt-interpret`, using the existing key copied into Supabase's encrypted secret configuration. No OpenAI or service-role secret belongs in the browser, repository, or Railway frontend environment.

## Local development

Copy `.env.example` to `.env.local`, fill the public Supabase URL/key and app URL, then run `npm ci` and `npm run dev`. Use a separate Supabase project for independent development when possible. This configured MVP shares the approved Kaspr Social project `mhsygkmdfrpkmhohieql`.

Run `npm run lint`, `npm run typecheck`, `npm test`, and `npm run build`. Docker is the production entry point. It runs the Next.js standalone server as a non-root user. Railway supplies PORT; `/api/health` is its health check.

## Database and isolation

Migrations in `supabase/migrations` create only `fittt_*` tables/functions and the `fittt_private` schema. They do not change any Kaspr table, policy, function, trigger or record.

Private owner-scoped tables: profiles, entries (food/drink/exercise estimates), days (one per user/date), weights/waist, events, food memories, feedback, analytics and cached AI results. Every table has RLS; ownership cannot be transferred by an update. Foreign keys are indexed. AI usage is owner-readable but only the edge function can update recorded costs. Server-authenticated RPCs handle challenge creation/join and enforce a ten-person limit under a row lock. Invite codes have 72 bits of randomness.

Privileged functions live in the non-exposed `fittt_private` schema, have fixed empty search paths, revoke PUBLIC execution, and authenticate their callers. Public entry points are security-invoker wrappers. Leaderboard results include name, opaque member ID and adherence components only, with opt-out enforced in the database. Weight, waist, foods, calories, drinks, exercise descriptions and event names never appear in shared results.

Kaspr and FITTT share an Auth user directory and infrastructure. They are logically isolated, not separate Supabase tenants. Kaspr access continues to require its own existing tenant membership; FITTT never creates those memberships. The app must not claim separate authentication infrastructure. Existing accounts can use both products when independently authorized.

## Calculations and safety

`lib/engine.ts` owns Mifflin–St Jeor BMR, activity-based TDEE, calorie/protein ranges, Australian 10g standard-drink conversion, weekly energy, scoring, seven-day rolling weight means, streaks and Day-90 projections. AI never supplies scores or body-weight projections.

Weekly energy includes only days explicitly marked as complete food logs. Fast Mode never fabricates calorie intake. Missing days are unknown, not zero. Positive target position means below target, not permission to restrict or drink. Activity is included in TDEE; workouts never add calorie credit.

Scoring weights: nutrition 35%, personal training adherence 25%, alcohol intentionality 25%, completed check-ins 15%. Weekly training credit is capped and prorated over elapsed days. Daily rest is legitimate. Gold Events allow planned flexibility, but a clearly inadequate complete-day estimate cannot earn nutrition credit. Safety guidance rejects starvation, purging, punishment exercise and extreme compensation. Difficulty is a preference, never a multiplier rewarding restriction. Body metrics remain private; there is no weight-loss ranking.

Weight projection needs four measurements spanning at least 14 days, uses up to 28 days of recent rolling observations, and suppresses projections for extreme rates. The uncertainty band is a conservative product heuristic, not a clinical prediction interval. Individual medical needs are outside this MVP's estimation model; users can edit targets within guarded bounds.

## Low-friction logging and AI cost

Browser/device speech recognition with typed/keyboard-dictation fallback. No audio recordings are retained. Confirmed estimates preserve ranges, confidence and assumptions. One material clarification is allowed, followed by reasonable stated assumptions. Entries merge by local day; idempotent UUIDs prevent retry duplicates. Adjust updates the original entry. Users explicitly save named personal meals and can reuse or forget them.

The authenticated edge function reserves usage before model calls, with a database-serialized limit of 30 requests per user per rolling 24 hours. Structured results are validated again on the app server. Model usage is recorded per user; gpt-4.1-mini cost estimates use $0.40 input / $1.60 output per million tokens and must be reviewed when changing model/pricing. Cached interpretation and remembered meals avoid model calls.

## Product analytics

`fittt_analytics` stores action names, duration and timestamps without diary text. `fittt_ai_usage` stores tokens and estimated cost by user. Check-in rows support D7/D30/D60/D90 retention, weekly logging consistency, streaks and training completion. Acceptance, adjustments, clarifications, voice starts, Fast Mode starts, reviews, progress and Gold Events are instrumented. The owner can analyze these tables through the database connector; no broad analytics dashboard is exposed to app users.

Sunday reset is available in Progress. Push/email reminder delivery and progress-photo uploads are not included in this V1; the UI does not pretend those are active. PWA caches no health data and displays an honest offline reconnect screen instead of acknowledging unsaved writes. Personal data export and diary deletion are available in Settings.

## Verification

Unit tests cover calculations, safety scoring, Australian alcohol units, uncertain/incomplete days, deduplication, schema validation and trend sufficiency. Playwright verifies three independent synthetic accounts through onboarding, challenge creation/join, Fast Mode, Gold Events, leaderboard and private progress, plus API authentication and cross-user RLS denial.

`scripts/create-test-fixtures.mjs` creates ignored synthetic fixture credentials and SQL. Apply that SQL only to an explicitly authorized test destination. `npm run test:e2e` reads `.env.e2e.json`; use `E2E_BASE_URL` for production smoke tests. Fixtures must be removed after verification: sign out their sessions, remove only their FITTT challenges, then delete the exact synthetic Auth user IDs. Never run broad deletes or modify real Kaspr users.

The security/performance advisor is project-wide. Existing Kaspr findings must be reported separately, not “fixed” as part of FITTT. New unused-index notices are expected immediately after creating tables.

## Authentication setup

Production uses email codes for FITTT signup and returning-user login. Both Supabase templates condition on the exact FITTT redirect and include `{{ .Token }}`; the original Kaspr content and subjects are preserved in the fallback branches. Bodies are stored in `supabase/templates` and must also be applied in the hosted dashboard. FITTT's conditional subject is `Your FITTT sign-in code`; fallback subjects remain `Confirm Your Signup` and `Your Magic Link` respectively.

The app verifies the code with the email address and establishes SSR cookies without depending on the browser that requested the code. The pending email survives a same-tab refresh for up to one hour. Codes are never stored locally. Resend has a 60-second cooldown and Change email clears the pending state. Invalid codes and old callback-link failures display recovery guidance. The allowlisted `https://fittt-production.up.railway.app/auth/callback` remains for legacy links; Kaspr's site URL is preserved.

Shared Auth SMTP uses Resend at `smtp.resend.com:465`, username `resend`, and `Kaspr Accounts <noreply@kaspr.com.au>`. Its encrypted key has sending-only access restricted to `kaspr.com.au`; it is not in this repository or the app environment. This sender applies to FITTT and Kaspr authentication emails. Current limits are 30 auth emails/hour and a 60-second per-user interval. Actual delivered-code authentication in a fresh browser and session persistence were verified; see `VERIFICATION.md`.

Run `npx playwright test e2e/auth.spec.ts` for login regression tests without sending email. For an explicitly authorized real recipient, set `FITTT_TEST_EMAIL` and run `node scripts/verify-email-login.mjs` in an interactive terminal, entering the newest delivered code at its prompt. It checks authentication in a separate browser context and a subsequent reload, without saving personal data. `--verify-only` uses an already-requested code.
