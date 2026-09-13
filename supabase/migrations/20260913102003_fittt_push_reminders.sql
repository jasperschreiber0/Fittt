-- FITTT-only, explicitly opted-in device subscriptions. No Kaspr policy changes.
create table public.fittt_push_subscriptions (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.fittt_profiles(user_id) on delete cascade,
  endpoint text not null unique check(length(endpoint) <= 2048 and endpoint ~ '^https://(fcm\.googleapis\.com|updates\.push\.services\.mozilla\.com|[a-z0-9-]+\.push\.apple\.com|[a-z0-9-]+\.notify\.windows\.com)/'),
  p256dh text not null check(p256dh ~ '^[A-Za-z0-9_-]{87}={0,1}$'),
  auth text not null check(auth ~ '^[A-Za-z0-9_-]{22}={0,2}$'),
  timezone text not null check(length(timezone) between 1 and 80),
  lunch boolean not null default true,
  evening boolean not null default true,
  created_at timestamptz not null default now()
);
create index fittt_push_user on public.fittt_push_subscriptions(user_id);
alter table public.fittt_push_subscriptions enable row level security;
revoke all on public.fittt_push_subscriptions from public, anon, authenticated;
grant select, insert, update, delete on public.fittt_push_subscriptions to authenticated;
grant all on public.fittt_push_subscriptions to service_role;
create policy fittt_push_owner on public.fittt_push_subscriptions for all to authenticated
using ((select auth.uid()) = user_id) with check ((select auth.uid()) = user_id);

alter table public.fittt_days add column updated_at timestamptz not null default now();
create function fittt_private.touch_day() returns trigger language plpgsql security invoker set search_path = '' as $$
begin new.updated_at = now(); return new; end $$;
revoke all on function fittt_private.touch_day() from public, anon, authenticated;
create trigger fittt_day_updated before insert or update on public.fittt_days for each row execute function fittt_private.touch_day();

create table public.fittt_push_deliveries (
  subscription_id uuid not null references public.fittt_push_subscriptions(id) on delete cascade,
  day date not null,
  slot text not null check(slot in ('lunch','evening')),
  status text not null check(status in ('claimed','sent','skipped','failed')),
  created_at timestamptz not null default now(),
  primary key(subscription_id,day,slot)
);
create table public.fittt_push_jobs (
  id uuid primary key default gen_random_uuid(), created_at timestamptz not null default now(),
  consumed_at timestamptz, finished_at timestamptz, success boolean, sent integer not null default 0
);
alter table public.fittt_push_deliveries enable row level security;
alter table public.fittt_push_jobs enable row level security;
revoke all on public.fittt_push_deliveries, public.fittt_push_jobs from public, anon, authenticated;
grant all on public.fittt_push_deliveries, public.fittt_push_jobs to service_role;

-- VAPID private key lives encrypted in Vault. Only the authenticated worker can read it.
create function public.fittt_push_keys() returns jsonb language sql security definer set search_path = '' as $$
  select jsonb_object_agg(name, decrypted_secret) from vault.decrypted_secrets
  where name in ('fittt_push_public_key','fittt_push_private_key');
$$;
revoke all on function public.fittt_push_keys() from public, anon, authenticated;
grant execute on function public.fittt_push_keys() to service_role;

create function fittt_private.queue_push_reminders() returns bigint language plpgsql security invoker set search_path = '' as $$
declare token uuid; request_id bigint;
begin
  delete from public.fittt_push_jobs where created_at < now() - interval '7 days';
  delete from public.fittt_push_deliveries where created_at < now() - interval '30 days';
  insert into public.fittt_push_jobs default values returning id into token;
  select net.http_post(url := 'https://mhsygkmdfrpkmhohieql.supabase.co/functions/v1/fittt-reminders',
    headers := jsonb_build_object('Content-Type','application/json','x-fittt-job',token::text),
    body := '{}'::jsonb, timeout_milliseconds := 120000) into request_id;
  return request_id;
end $$;
revoke all on function fittt_private.queue_push_reminders() from public, anon, authenticated;
select cron.schedule('fittt-push-reminders','*/5 * * * *','select fittt_private.queue_push_reminders();');
