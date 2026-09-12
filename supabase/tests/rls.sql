-- Run in a transaction after setting fittt.test_user_a and fittt.test_user_b
-- to synthetic users from scripts/create-test-fixtures.mjs. Always roll back.
set local role authenticated;
select set_config('request.jwt.claim.sub',current_setting('fittt.test_user_b'),true);
do $$ declare t record; n bigint; begin
  for t in select c.relname from pg_class c join pg_namespace ns on ns.oid=c.relnamespace
    where ns.nspname='public' and c.relkind='r' and c.relname not like 'fittt_%'
  loop
    begin
      execute format('select count(*) from public.%I',t.relname) into n;
      if n<>0 then raise exception 'Kaspr isolation failed on %',t.relname; end if;
    exception when insufficient_privilege then null;
    end;
  end loop;
  if exists(select 1 from public.fittt_profiles where user_id=current_setting('fittt.test_user_a')::uuid)
     or exists(select 1 from public.fittt_entries where user_id=current_setting('fittt.test_user_a')::uuid)
     or exists(select 1 from public.fittt_weights where user_id=current_setting('fittt.test_user_a')::uuid)
     or exists(select 1 from public.fittt_reviews where user_id=current_setting('fittt.test_user_a')::uuid)
  then raise exception 'Private FITTT data exposed'; end if;
end $$;
do $$ begin
  begin
    perform 1 from public.fittt_review_jobs;
    raise exception 'Scheduler jobs exposed';
  exception when insufficient_privilege then null;
  end;
  if has_table_privilege('authenticated','public.fittt_reviews','INSERT')
    or has_table_privilege('authenticated','public.fittt_reviews','UPDATE')
    or has_function_privilege('authenticated','fittt_private.queue_weekly_reviews()','EXECUTE')
  then raise exception 'Review worker privileges exposed'; end if;
end $$;
