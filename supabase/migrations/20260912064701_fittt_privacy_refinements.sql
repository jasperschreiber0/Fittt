create or replace function fittt_private.leaderboard(cid uuid) returns jsonb language plpgsql security definer set search_path='' as $$
begin
if auth.uid() is null or not exists(select 1 from public.fittt_members where challenge_id=cid and user_id=auth.uid()) then raise exception 'Membership required'; end if;
return coalesce((select jsonb_agg(row) from(
select p.data->>'name' as name,m.user_id,(p.data->>'training')::int as training_target,
coalesce((select jsonb_agg(jsonb_build_object('day',d.day,'nutrition',case when coalesce((d.data->>'safety')::boolean,false) then 0 when d.data->>'food'='on' or exists(select 1 from public.fittt_events e where e.user_id=d.user_id and e.day=d.day) then 35 else 0 end,'alcohol',case when d.data->>'alcohol'='unplanned' then 0 else 25 end,'consistency',case when d.data->>'complete'='true' then 15 else 0 end,'trainingDone',d.data->>'training'='done','gold',exists(select 1 from public.fittt_events e where e.user_id=d.user_id and e.day=d.day))) from public.fittt_days d where d.user_id=m.user_id and d.day>=c.start and d.day<c.start+90),'[]') as days
from public.fittt_members m join public.fittt_profiles p on p.user_id=m.user_id join public.fittt_challenges c on c.id=m.challenge_id where m.challenge_id=cid and coalesce((p.data->>'share')::boolean,false)) row),'[]'); end $$;
-- Restrict valid self-reported day payloads even for direct Data API access.
alter table public.fittt_days add constraint fittt_day_values check(data->>'food' in ('on','off') and data->>'training' in ('done','rest','missed') and data->>'alcohol' in ('none','planned','unplanned'));
-- Same-day events must be created before the day's first check-in.
create function fittt_private.event_before_log() returns trigger language plpgsql security invoker set search_path='' as $$ begin
if new.day < (now() at time zone 'Australia/Sydney')::date then raise exception 'Gold Events must be planned ahead'; end if;
if exists(select 1 from public.fittt_days where user_id=new.user_id and day=new.day) then raise exception 'Plan Gold Events before checking in for the day'; end if; return new; end $$;
revoke all on function fittt_private.event_before_log() from public;
create trigger fittt_event_before_log before insert on public.fittt_events for each row execute function fittt_private.event_before_log();
