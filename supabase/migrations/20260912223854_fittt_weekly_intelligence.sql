-- FITTT-only private recaps. Clients may read/delete their own; only the worker writes.
create table public.fittt_reviews (
  user_id uuid not null references auth.users(id) on delete cascade,
  review_end date not null,
  input_hash text not null,
  payload jsonb not null,
  generated_at timestamptz not null default now(),
  primary key (user_id, review_end)
);
alter table public.fittt_reviews enable row level security;
revoke all on public.fittt_reviews from anon, authenticated;
grant select, delete on public.fittt_reviews to authenticated;
grant all on public.fittt_reviews to service_role;
create policy fittt_reviews_owner_read on public.fittt_reviews for select to authenticated using ((select auth.uid()) = user_id);
create policy fittt_reviews_owner_delete on public.fittt_reviews for delete to authenticated using ((select auth.uid()) = user_id);

-- Short-lived one-use job nonces: no reusable service credential in a cron command.
create table public.fittt_review_jobs (
  id uuid primary key default gen_random_uuid(),
  created_at timestamptz not null default now(),
  consumed_at timestamptz,
  finished_at timestamptz,
  success boolean,
  processed integer not null default 0
);
alter table public.fittt_review_jobs enable row level security;
revoke all on public.fittt_review_jobs from public, anon, authenticated;
grant all on public.fittt_review_jobs to service_role;

create extension if not exists pg_cron with schema pg_catalog;
create extension if not exists pg_net with schema extensions;
create function fittt_private.queue_weekly_reviews() returns bigint
language plpgsql security invoker set search_path = '' as $$
declare token uuid; request_id bigint;
begin
  delete from public.fittt_review_jobs where created_at < now() - interval '14 days';
  insert into public.fittt_review_jobs default values returning id into token;
  select net.http_post(
    url := 'https://mhsygkmdfrpkmhohieql.supabase.co/functions/v1/fittt-weekly',
    headers := jsonb_build_object('Content-Type','application/json','x-fittt-job',token::text),
    body := '{}'::jsonb,
    timeout_milliseconds := 120000
  ) into request_id;
  return request_id;
end $$;
revoke all on function fittt_private.queue_weekly_reviews() from public, anon, authenticated;
-- Hourly delivery handles local Sunday 06:00 and retries/catches up after outages.
select cron.schedule('fittt-weekly-recaps', '12 * * * *', 'select fittt_private.queue_weekly_reviews();');
