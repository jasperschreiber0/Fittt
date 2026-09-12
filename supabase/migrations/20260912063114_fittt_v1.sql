-- FITTT owns only fittt_* objects and fittt_private. No Kaspr objects modified.
create schema fittt_private;
revoke all on schema fittt_private from public;
grant usage on schema fittt_private to authenticated;
create table public.fittt_profiles(user_id uuid primary key references auth.users(id) on delete cascade, data jsonb not null, created_at timestamptz not null default now());
create table public.fittt_entries(id uuid primary key default gen_random_uuid(), user_id uuid not null references auth.users(id) on delete cascade, day date not null, estimate jsonb not null, source text not null check(source in ('voice','text','memory')), created_at timestamptz not null default now());
create index fittt_entries_user_day on public.fittt_entries(user_id,day);
create table public.fittt_days(user_id uuid not null references auth.users(id) on delete cascade, day date not null, data jsonb not null, primary key(user_id,day));
create table public.fittt_weights(user_id uuid not null references auth.users(id) on delete cascade, day date not null, weight numeric not null check(weight between 40 and 250), waist numeric check(waist between 40 and 200), primary key(user_id,day));
create table public.fittt_events(id uuid primary key default gen_random_uuid(),user_id uuid not null references auth.users(id) on delete cascade, day date not null, name text not null check(length(name) between 1 and 80), size text not null check(size in ('Dinner','Drinks','Big one')), created_at timestamptz not null default now());
create index fittt_events_user_day on public.fittt_events(user_id,day);
create table public.fittt_memories(user_id uuid not null references auth.users(id) on delete cascade, name text not null check(length(name) between 1 and 80), estimate jsonb not null, updated_at timestamptz not null default now(),primary key(user_id,name));
create table public.fittt_analytics(id uuid primary key default gen_random_uuid(),user_id uuid not null references auth.users(id) on delete cascade,event text not null check(length(event)<80),seconds integer check(seconds between 0 and 86400),created_at timestamptz not null default now());
create index fittt_analytics_user_created on public.fittt_analytics(user_id,created_at);
create table public.fittt_feedback(id uuid primary key default gen_random_uuid(),user_id uuid not null references auth.users(id) on delete cascade,message text not null check(length(message) between 1 and 2000),created_at timestamptz not null default now());
create index fittt_feedback_user on public.fittt_feedback(user_id);
create table public.fittt_ai_cache(user_id uuid not null references auth.users(id) on delete cascade,key text not null,result jsonb not null,created_at timestamptz not null default now(),primary key(user_id,key));
create table public.fittt_ai_usage(id uuid primary key default gen_random_uuid(),user_id uuid not null references auth.users(id) on delete cascade,input_tokens integer not null default 0,output_tokens integer not null default 0,cost_usd numeric not null default 0,created_at timestamptz not null default now());
create index fittt_ai_usage_user_created on public.fittt_ai_usage(user_id,created_at);
create table public.fittt_challenges(id uuid primary key default gen_random_uuid(),owner_id uuid not null references auth.users(id),name text not null check(length(name) between 1 and 60),start date not null,code text unique not null default encode(extensions.gen_random_bytes(9),'hex'),created_at timestamptz not null default now());
create index fittt_challenges_owner on public.fittt_challenges(owner_id);
create table public.fittt_members(challenge_id uuid not null references public.fittt_challenges(id) on delete cascade,user_id uuid not null references auth.users(id) on delete cascade,joined_at timestamptz not null default now(),primary key(challenge_id,user_id));
create index fittt_members_user on public.fittt_members(user_id);
do $$ declare t text; begin
foreach t in array array['profiles','entries','days','weights','events','memories','analytics','feedback','ai_cache'] loop
execute format('alter table public.fittt_%I enable row level security',t);
execute format('grant select,insert,update,delete on public.fittt_%I to authenticated',t);
execute format('create policy owner_only on public.fittt_%I for all to authenticated using ((select auth.uid())=user_id) with check ((select auth.uid())=user_id)',t);
end loop; end $$;
alter table public.fittt_ai_usage enable row level security;
grant select on public.fittt_ai_usage to authenticated;
create policy own_usage on public.fittt_ai_usage for select to authenticated using((select auth.uid())=user_id);
alter table public.fittt_challenges enable row level security;
alter table public.fittt_members enable row level security;
grant select on public.fittt_challenges,public.fittt_members to authenticated;
create policy own_membership on public.fittt_members for select to authenticated using((select auth.uid())=user_id);
create policy joined_challenge on public.fittt_challenges for select to authenticated using(id in(select challenge_id from public.fittt_members where user_id=(select auth.uid())));
-- Narrow privileged operations live in a non-exposed schema and authenticate every call.
create function fittt_private.challenge(action text,title text,starts date,invite text) returns jsonb language plpgsql security definer set search_path='' as $$
declare uid uuid:=auth.uid(); c public.fittt_challenges; begin
if uid is null or not exists(select 1 from public.fittt_profiles where user_id=uid) then raise exception 'Onboarding required'; end if;
if action='create' then
if (select count(*) from public.fittt_members where user_id=uid)>=5 then raise exception 'Maximum five challenges'; end if;
insert into public.fittt_challenges(owner_id,name,start) values(uid,title,starts) returning * into c;
elsif action='join' then
select * into c from public.fittt_challenges where code=lower(trim(invite)) for update;
if c.id is null then raise exception 'Invite not found'; end if;
if current_date>=c.start+90 then raise exception 'Challenge finished'; end if;
if not exists(select 1 from public.fittt_members where challenge_id=c.id and user_id=uid) and (select count(*) from public.fittt_members where challenge_id=c.id)>=10 then raise exception 'Challenge is full'; end if;
else raise exception 'Invalid action'; end if;
insert into public.fittt_members(challenge_id,user_id) values(c.id,uid) on conflict do nothing;
return to_jsonb(c); end $$;
revoke all on function fittt_private.challenge(text,text,date,text) from public;
grant execute on function fittt_private.challenge(text,text,date,text) to authenticated;
create function public.fittt_challenge(action text,title text default null,starts date default null,invite text default null) returns jsonb language sql security invoker set search_path='' as $$select fittt_private.challenge(action,title,starts,invite)$$;
revoke all on function public.fittt_challenge(text,text,date,text) from public;
grant execute on function public.fittt_challenge(text,text,date,text) to authenticated;
-- Only adherence fields leave the private diary; body metrics and foods are never selected.
create function fittt_private.leaderboard(cid uuid) returns jsonb language plpgsql security definer set search_path='' as $$
begin
if auth.uid() is null or not exists(select 1 from public.fittt_members where challenge_id=cid and user_id=auth.uid()) then raise exception 'Membership required'; end if;
return coalesce((select jsonb_agg(row) from(
select p.data->>'name' as name,m.user_id,
coalesce((select jsonb_agg(jsonb_build_object('day',d.day,'food',d.data->>'food','training',d.data->>'training','alcohol',d.data->>'alcohol','complete',d.data->'complete'))
from public.fittt_days d where d.user_id=m.user_id and d.day>=c.start and d.day<c.start+90),'[]') as days
from public.fittt_members m join public.fittt_profiles p on p.user_id=m.user_id join public.fittt_challenges c on c.id=m.challenge_id
where m.challenge_id=cid and coalesce((p.data->>'share')::boolean,false)) row),'[]');
end $$;
revoke all on function fittt_private.leaderboard(uuid) from public;
grant execute on function fittt_private.leaderboard(uuid) to authenticated;
create function public.fittt_leaderboard(cid uuid) returns jsonb language sql security invoker set search_path='' as $$select fittt_private.leaderboard(cid)$$;
revoke all on function public.fittt_leaderboard(uuid) from public;
grant execute on function public.fittt_leaderboard(uuid) to authenticated;
-- Reserve before a model request. Only the edge function service role can record costs.
create function fittt_private.reserve_ai() returns uuid language plpgsql security definer set search_path='' as $$
declare uid uuid:=auth.uid(); result uuid; begin
if uid is null or not exists(select 1 from public.fittt_profiles where user_id=uid) then raise exception 'Onboarding required'; end if;
perform pg_advisory_xact_lock(hashtext(uid::text));
if (select count(*) from public.fittt_ai_usage where user_id=uid and created_at>now()-interval '1 day')>=30 then raise exception 'Daily AI limit reached; Fast Mode is available'; end if;
insert into public.fittt_ai_usage(user_id) values(uid) returning id into result; return result;
end $$;
revoke all on function fittt_private.reserve_ai() from public;
grant execute on function fittt_private.reserve_ai() to authenticated;
create function public.fittt_reserve_ai() returns uuid language sql security invoker set search_path='' as $$select fittt_private.reserve_ai()$$;
revoke all on function public.fittt_reserve_ai() from public;
grant execute on function public.fittt_reserve_ai() to authenticated;
grant all on public.fittt_ai_usage to service_role;
