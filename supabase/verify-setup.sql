-- Run as the project administrator in Supabase's SQL Editor after schema.sql.
-- Read-only metadata checks: no family rows, recordings, secrets or RPC calls.
-- PASS establishes the reported configuration, not a live ownership/login test.
-- Review policy expressions; investigate every MISSING, FAIL or extra-policy
-- row. Scheduler execution history can be checked separately in DATABASE.md.

-- 1. Exactly these eight application tables must exist and have RLS enabled.
with expected(table_name) as (values
  ('profiles'), ('assessments'), ('assessment_sessions'), ('attempts'),
  ('reading_recordings'), ('reading_reviews'), ('learning_sessions'), ('voice_usage')
)
select e.table_name,
  case when c.oid is null then 'MISSING'
       when not c.relrowsecurity then 'FAIL: RLS disabled'
       when has_table_privilege('anon', c.oid, 'SELECT') then 'FAIL: anonymous SELECT granted'
       else 'PASS' end as status,
  c.relrowsecurity as rls_enabled
from expected e
left join pg_namespace n on n.nspname = 'public'
left join pg_class c on c.relnamespace = n.oid and c.relname = e.table_name and c.relkind in ('r', 'p')
order by e.table_name;

-- 2. Named policies must target authenticated users and the intended commands.
with expected(table_name, policy_name, command) as (values
  ('profiles', 'profiles_owner', 'ALL'),
  ('assessments', 'assessments_owner', 'ALL'),
  ('assessment_sessions', 'sessions_owner', 'ALL'),
  ('attempts', 'attempts_owner', 'ALL'),
  ('reading_reviews', 'reading_reviews_owner', 'ALL'),
  ('learning_sessions', 'learning_sessions_owner', 'ALL'),
  ('voice_usage', 'voice_usage_owner', 'SELECT'),
  ('reading_recordings', 'recordings_read', 'SELECT'),
  ('reading_recordings', 'recordings_insert', 'INSERT'),
  ('reading_recordings', 'recordings_update', 'UPDATE'),
  ('reading_recordings', 'recordings_delete', 'DELETE')
)
select e.table_name, e.policy_name,
  case when p.policyname is null then 'MISSING'
       when p.cmd <> e.command or p.roles <> array['authenticated']::name[] then 'FAIL: role/command mismatch'
       else 'PASS: review expressions' end as status,
  p.cmd, p.roles, p.qual as using_expression, p.with_check as check_expression
from expected e
left join pg_policies p on p.schemaname = 'public'
  and p.tablename = e.table_name and p.policyname = e.policy_name
order by e.table_name, e.policy_name;

-- Extra policies on an existing project's tables can widen access by OR-ing
-- with this app's policies. This result should contain no rows after setup.
select tablename, policyname, cmd, roles, qual, with_check
from pg_policies
where schemaname = 'public'
  and tablename = any(array['profiles', 'assessments', 'assessment_sessions', 'attempts',
    'reading_recordings', 'reading_reviews', 'learning_sessions', 'voice_usage'])
  and (tablename, policyname) not in (
    ('profiles', 'profiles_owner'), ('assessments', 'assessments_owner'),
    ('assessment_sessions', 'sessions_owner'), ('attempts', 'attempts_owner'),
    ('reading_reviews', 'reading_reviews_owner'), ('learning_sessions', 'learning_sessions_owner'),
    ('voice_usage', 'voice_usage_owner'), ('reading_recordings', 'recordings_read'),
    ('reading_recordings', 'recordings_insert'), ('reading_recordings', 'recordings_update'),
    ('reading_recordings', 'recordings_delete'))
order by tablename, policyname;

-- 3. Required RPCs must have exact signatures and controlled execution access.
with expected(signature, result_type) as (values
  ('public.record_pin_failure()', 'timestamp with time zone'),
  ('public.reserve_voice_spend(text,integer,uuid,integer)', 'boolean'),
  ('public.save_reading_attempt(uuid,uuid,text,text,integer,text,text,integer,boolean,numeric)', 'uuid')
)
select e.signature,
  case when p.oid is null then 'MISSING'
       when not p.prosecdef or p.prorettype <> to_regtype(e.result_type)
         or not coalesce(p.proconfig @> array['search_path=""'], false)
         or not has_function_privilege('authenticated', p.oid, 'EXECUTE')
         or has_function_privilege('anon', p.oid, 'EXECUTE') then 'FAIL: configuration/grant mismatch'
       else 'PASS' end as status,
  pg_get_function_result(p.oid) as returns,
  p.prosecdef as security_definer, p.proconfig as runtime_configuration
from expected e
left join pg_proc p on p.oid = to_regprocedure(e.signature)
order by e.signature;

-- 4. Dynamic SELECT avoids a missing-cron-schema error. No cron mutation runs.
select case when to_regclass('cron.job') is null then 'MISSING: pg_cron/cron.job'
  else query_to_xml($check$
    select case when count(*) = 1 and bool_and(active)
      and bool_and(schedule = '* * * * *')
      and bool_and(btrim(command) = 'delete from public.reading_recordings where expires_at <= now();')
      then 'PASS' else 'FAIL: missing, inactive or unexpected retention job' end as status
    from cron.job where jobname = 'summer-delete-expired-recordings'
  $check$, false, false, '')::text end as retention_job;
