# Production verification — 12 September 2026

## Focused mobile polish — 13 September 2026

Shortened the phone header and logging introduction, removed duplicate typing instructions, and kept voice/text/review controls above navigation at 320×740, 360×640 and 390×844. Saving focuses and scrolls to the saved daily result. Tab navigation resets scroll position so users start at the top of the chosen screen. Progress now presents concise next-week actions before the recap, with full reasoning expandable and safety guidance retained. Profile/expand controls have at least 44px touch height. Navigation clears a detected software keyboard and returns when it closes or focus leaves the field.

Twelve targeted browser tests passed against the local production build, including new viewport/keyboard/save-feedback checks and existing login, calendar, voice, recap and profile regressions. Lint and production build/typechecking passed. Phone screenshots were inspected. Keyboard and voice checks simulate browser events; physical iPhone/Android verification and 7 pm push reminders remain separate unfinished work. No calculations, authentication rules, data or scheduler configuration changed.

## Daily intelligence and Sunday recap — 13 September 2026

Added shared deterministic daily/weekly intelligence, reported-versus-estimated activity fields, compact Today feedback, a saved private Sunday recap and a next-seven-day plan with upcoming events. Optional goal weight is editable again. Forecasts require fresh sufficient weights; missing food days remain unknown, adjustments are bounded, and exercise expenditure never creates food credit. Sunday delivery uses a FITTT-only hourly pg_cron/pg_net job, an authenticated edge worker and one-use job nonces. The worker completed a scheduled-path test successfully; anonymous/forged requests were denied. No recap AI calls, email or push notifications.

27 unit/integration tests passed, including local-time/DST boundaries, cumulative steps, weekly ranges, missing days, stale/extreme trends, bounded recommendations, alcohol safety, event allocation and older saved schemas. Lint, typecheck and production build passed. Phone UI tests covered the daily readout, saved recap, incomplete-week labels, upcoming event plan, refresh and overflow. Real synthetic-user tests verified AI interpretation, correction, retry deduplication, multi-entry merging, challenge create/join and three-user privacy, plus recap generation, hash reuse and rejection of client-forged recaps/job access. The transactional RLS audit also denied access to other users' recaps and existing Kaspr tables.

Applied migration `20260912223854_fittt_weekly_intelligence.sql`. Security/performance advisors found no FITTT warnings/errors. The scheduler nonce table deliberately has RLS with no user policy and no user grants ([service-only table notice](https://supabase.com/docs/guides/database/database-linter?lint=0008_rls_enabled_no_policy)); existing shared-project password-protection warning and Kaspr informational notices were left unchanged. See [password protection guidance](https://supabase.com/docs/guides/auth/password-security#password-strength-and-leaked-password-protection). New tables and worker are isolated from Kaspr.

## Returning without a new code — 13 September 2026

Confirmed the existing Supabase SSR cookies are persistent (400-day browser lifetime), with refresh-token renewal on return. Added a regression using the real SSR adapter and mocked Auth responses: verify once, retain only persistent cookies, create a new client, renew an expired access token, restore the user without another OTP, and clear cookies on local logout. This models browser cookie retention; it does not test a physical phone restart or override browser clearing/private-mode settings. Logout now explicitly affects only the current session, rather than revoking the user's other devices. Shared Supabase session settings are unchanged. The login screen explains that sign-in is remembered. All 14 unit/integration tests, lint, typecheck and production build passed.

## Simplified interface — 13 September 2026

Four main destinations: Today, Calendar, Friends and Progress. More is accessed through the profile button and contains private weight history, editable targets, saved meals and privacy/export/delete controls. Nutrition details are expandable; Progress presents a short weekly summary. Removed the separate Sunday review, Ask-AI chat, difficulty preference, prediction, waist entry, achievement display and detailed energy dashboard. Minimum-day guidance is incorporated into Fast Mode. No database migration or historical-data cleanup was performed.

Seven targeted browser tests passed against the local production build, covering the four-tab phone layout, More controls, preservation of retired profile values when editing targets, calendar add/remove, authentication recovery and simulated live speech. Lint and production build passed. Physical microphone capture remains dependent on device/browser support.

## Social calendar — 13 September 2026

Events now presents a Monday-first monthly calendar, today/selected-date styling, private Gold Event markers, date-specific add/remove controls and an upcoming-event list. Selecting an upcoming event opens its month and date. Simple planning reminders retain regular meals and avoid compensatory exercise. Existing FITTT event storage, RLS and Gold Event integrity rules remain unchanged; no database migration was needed.

Lint, typecheck and production build passed. A phone browser test covers leap-day selection, event save, date marker, month navigation, upcoming-event navigation and deletion using intercepted test data; five login/voice regression tests also passed. The 390px screenshot was inspected and checked for horizontal overflow. No real user events were created or removed during automated verification.

## Phone logging update — 13 September 2026

Today now leads with the logging composer, before adherence and Sunday review. Browser dictation requests continuous interim results, renders words during speech, replaces evolving hypotheses without duplication, and appends new recording sessions to the draft. Listening has a visible status and stop control; the app does not claim microphone activity until the browser start event. Review is disabled during capture. Draft/not-saved messaging distinguishes capture from confirmation. Unsupported or denied microphones retain typed text and offer keyboard dictation.

Phone refinements include 16px minimum form text, larger capture controls, safe-area spacing, narrow-screen forms and navigation, and scrolling the transcript into view when listening starts. Five browser regressions passed (three login, two simulated-speech/mobile tests), plus lint, typecheck, 13 unit tests and production build. Screenshots were inspected at phone size; layouts were checked for overflow at 320px and 390px. Speech tests simulate browser recognition events, not physical microphone audio or every iOS/Android recognition provider.

## Login regression corrected

After the owner reported a loop, inspection found a code-entry UI paired with link-only emails and a PKCE callback whose failure was not surfaced. Earlier verification covered a same-browser signup link, which did not cover this returning-user/cross-browser problem.

Application fix `ebeb32e` deployed successfully. Signup and returning-user email templates now send an explicit code only for the exact FITTT callback destination, preserving the original Kaspr fallback body and subject. Login UI now retains the pending email across refreshes, offers resend/change-email, validates codes and displays recovery for legacy callback failures.

Validation: lint, typecheck, 13 unit tests, production build, and three new login browser regressions passed locally and in production. A real code email was Delivered (record `ff0f85f9-6cdd-414d-bbee-4b1d1e8b389f`). The delivered eight-digit code authenticated in a separate browser context with no original PKCE cookie, returned an authenticated API response, opened the existing plan and remained authenticated after reload. No private profile values were changed. The test code was consumed; users should request a new code rather than reuse test emails.

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

Security: no FITTT object findings. Shared-project findings are 22 informational Kaspr tables with RLS and no policies (default deny) and one warning for disabled leaked-password protection. Existing Kaspr policies were preserved; the explicitly approved shared Auth email and callback changes are recorded below. Password-warning guidance: https://supabase.com/docs/guides/auth/password-security#password-strength-and-leaked-password-protection

Performance: 23 pre-existing unindexed foreign-key notices, 16 unused-index notices (three for new FITTT indexes), and one shared Auth connection-allocation notice. Retain new FITTT indexes for growing workloads; there are no FITTT unindexed foreign-key findings. Guidance: https://supabase.com/docs/guides/database/database-linter and https://supabase.com/docs/guides/deployment/going-into-prod

## Production authentication completed

The automated tests used disposable preconfirmed users. Separately, actual production email signup was verified on 12 September 2026 with the owner's explicitly approved email address: FITTT submitted signup, Resend reported Delivered, the delivered confirmation link exchanged through the production callback, and FITTT displayed its authenticated onboarding form. No invented body measurements were saved to the owner's account.

1. Completed after explicit user approval: added `https://fittt-production.up.railway.app/auth/callback` to the shared Supabase redirect allowlist and verified it in the dashboard. Kaspr's existing site URL was preserved.
2. After specific user approval, created the Resend key `FITTT Supabase Auth`, with Sending access restricted to the verified `kaspr.com.au` domain. Stored it only in Supabase's encrypted SMTP configuration. Existing Resend and Railway application keys were not changed.
3. Enabled shared SMTP with `smtp.resend.com`, port 465, username `resend`, sender `Kaspr Accounts <noreply@kaspr.com.au>`, and a 60-second per-user interval. Supabase's UI sets 30 authentication emails/hour on activation. This shared sender applies to both FITTT and Kaspr Auth; existing templates and site URL were preserved.
4. Verified delivery record `5b15be21-4c4e-437c-8c0e-c252c31a315a`, correct sender and FITTT callback, and successful authenticated onboarding. No external setup blocker remains. The owner can enter their own personal onboarding details.

The Railway service uses its configured Dockerfile, port 3000 and `/api/health`; `railway.json` is a reference because this service uses Railway's current dashboard configuration.

## Browser-return investigation — 13 September 2026

Confirmed and corrected a false sign-out path: initial account loading ignored HTTP errors, and temporary Supabase Auth errors were returned as `user: null`. These now produce retry/reconnect behavior. The proxy also preserves the cache-prevention headers supplied by Supabase when rotating session cookies.

The existing live deployment successfully renewed a genuine disposable session and restored it after closing and reopening a persistent Chromium browser profile. The same check passes against the updated production build. This does not reproduce the reported failure on friends' phones and does not establish its exact cause. Physical Safari and overnight persistence have not been verified. The real test uses password-authenticated disposable fixtures to obtain a valid session, then expires only its local freshness timestamp to force renewal; it does not repeat email delivery.

Validation: 30 unit tests, five authentication browser tests, four mobile regressions, real browser restart/renewal, lint, typecheck and production build passed. A local renewal attempt initially lacked network permission; it passed after restarting the server with network access. No database migration or shared Kaspr Auth configuration change is required.

## Daily clarity and continued sign-in investigation

Training is shown by its reported description during review and after save, with distinct training days counted against the current Monday–Sunday target. Multiple workouts and a tap check-in on the same date count once. The check-in shortcut replaces the ambiguous Fast Mode label and explains that it supplies no calorie estimates. The empty weight forecast now says “Needs more weigh-ins” with the required frequency and privacy explanation. The saved card has a subtle green tint, training summary and reduced-motion-aware confirmation tick.

The owner reported another code prompt. Dashboard inspection confirmed single-session enforcement is off, time-box and inactivity limits are both zero, access tokens last 3600 seconds, and refresh reuse protection uses the recommended 10 seconds. These shared settings were not changed. Existing runtime logs did not identify the cause. A non-identifying local flag now marks returning-browser requests so fixed-category diagnostics can distinguish missing cookies, invalid cookies, revoked/reused refresh sessions and temporary auth failures. No credentials, email, user IDs or diary data are logged by these diagnostics. This is observability, not a claim that the reported sign-out is resolved.

The updated daily layout was inspected at phone size. Twelve browser regressions covering voice, auth, mobile layout and intelligence passed locally; unit coverage includes distinct training-day counting and safe diagnostic categories.

## Messenger browser guidance

The user identified Messenger as the entry point for the repeated code prompt. FITTT now detects common Facebook/Messenger user-agent markers and shows a Safari/Chrome notice above the app, including for signed-in users. A collapsed “Opened from Messenger?” help section remains available on sign-in when detection is unavailable. Copying the link keeps only the public challenge invite, excluding authentication query parameters; denied clipboard access exposes a selectable link. This guides people into a consistent browser and does not transfer credentials between browsers or change Supabase session policies.

Twelve browser tests passed locally: three new notice/copy regressions (simulated iOS and Android Messenger agents plus blocked clipboard), five auth regressions and four mobile layout checks. Lint, typecheck and production build passed. Phone screenshot inspected at 320px; actual Messenger UI was not automated, so instructions account for menu differences.

## Lunch and evening reminders

Applied FITTT-only migration `fittt_push_reminders` (local file `20260913101540_fittt_push_reminders.sql`), deployed `fittt-reminders` v2, installed the active five-minute cron, and configured VAPID using encrypted Vault storage plus the public Railway variable. Scheduler authentication was verified with a real one-use nonce. A disposable subscription with a recent check-in produced `skipped: 1`, `sent: 0`, HTTP 200; normal scheduled jobs also completed successfully.

Real Supabase tests passed for subscription creation, cross-user read/update denial, private-key RPC denial, job-table denial and rejection of private-network endpoints. Web Push request encryption was verified without transmitting it. Security advisors report only intentional RLS-with-no-client-policy information for worker-only FITTT tables and the pre-existing shared leaked-password warning; no new FITTT security warning. Performance flags the new unused subscription-owner index, which is retained for growth. Shared settings were preserved. Existing warning guidance: https://supabase.com/docs/guides/auth/password-security#password-strength-and-leaked-password-protection

Thirty-five unit tests passed, including local schedule/DST and service-worker payload/click behavior. Reminder control tests verify no automatic permission prompt, enabling both slots, changing one slot, disabling the device, and iPhone installation guidance. A real display test could not obtain notification permission in this automated host even with a scoped test permission grant; it is optional, not counted as passed. Physical push receipt remains to be checked on an opted-in phone.
