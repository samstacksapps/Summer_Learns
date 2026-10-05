-- Summer Learns: daily Year 1–2 tutoring, separate from the starting test.
-- Run once in the existing project's SQL editor. Safe to run again.
-- This transaction preserves assessment evidence, reading recordings and reviews.
-- Parent access tokens remain the app's credentials; no service-role key is used.
begin;

alter table public.learning_sessions add column if not exists subject text not null default 'maths';
alter table public.learning_sessions add column if not exists status text not null default 'stopped';
alter table public.learning_sessions add column if not exists plan jsonb;
alter table public.learning_sessions add column if not exists revision integer not null default 0;
alter table public.learning_sessions add column if not exists tutor_state jsonb not null
  default '{"index":0,"correct":0,"incorrectStreak":0,"helped":false,"observations":[]}'::jsonb;
alter table public.learning_sessions add column if not exists summary jsonb;
-- Only legacy completed rows need a status backfill; their timestamps survive.
update public.learning_sessions set status = 'completed'
  where completed_at is not null and status = 'stopped' and plan is null;

create or replace function public.valid_tutor_state(p_state jsonb)
returns boolean language sql immutable set search_path = '' as $$
  select coalesce(
    jsonb_typeof(p_state) = 'object'
    and p_state - array['index','correct','incorrectStreak','helped','observations']::text[] = '{}'::jsonb
    and jsonb_typeof(p_state->'index') = 'number'
    and (p_state->>'index') ~ '^[0-5]$'
    and jsonb_typeof(p_state->'correct') = 'number'
    and (p_state->>'correct') ~ '^[0-5]$'
    and (p_state->>'correct')::integer <= (p_state->>'index')::integer
    and jsonb_typeof(p_state->'incorrectStreak') = 'number'
    and (p_state->>'incorrectStreak') ~ '^[0-5]$'
    and jsonb_typeof(p_state->'helped') = 'boolean'
    and jsonb_typeof(p_state->'observations') = 'array'
    and jsonb_array_length(p_state->'observations') <= 8
    and not exists (
      select 1 from jsonb_array_elements(p_state->'observations') as observations(value)
      where jsonb_typeof(value) <> 'string' or value #>> '{}' not in (
        'tens-and-ones','counting-on','equal-groups','drawing-a-model',
        'rereading-clues','checking-word-parts','explaining-a-reason','trying-another-way'
      )
    ), false
  );
$$;
-- This validator is needed by a CHECK constraint for authenticated inserts.
revoke all on function public.valid_tutor_state(jsonb) from public, anon;
grant execute on function public.valid_tutor_state(jsonb) to authenticated;

alter table public.learning_sessions drop constraint if exists learning_sessions_tutor_subject;
alter table public.learning_sessions add constraint learning_sessions_tutor_subject
  check (subject in ('maths','english'));
alter table public.learning_sessions drop constraint if exists learning_sessions_tutor_status;
alter table public.learning_sessions add constraint learning_sessions_tutor_status
  check (status in ('in_progress','completed','stopped'));
alter table public.learning_sessions drop constraint if exists learning_sessions_tutor_revision;
alter table public.learning_sessions add constraint learning_sessions_tutor_revision check (revision >= 0);
alter table public.learning_sessions drop constraint if exists learning_sessions_tutor_state;
alter table public.learning_sessions add constraint learning_sessions_tutor_state check (public.valid_tutor_state(tutor_state));
alter table public.learning_sessions drop constraint if exists learning_sessions_tutor_completion;
alter table public.learning_sessions add constraint learning_sessions_tutor_completion
  check ((status = 'completed' and completed_at is not null)
      or (status <> 'completed' and completed_at is null));
alter table public.learning_sessions drop constraint if exists learning_sessions_tutor_plan;
alter table public.learning_sessions add constraint learning_sessions_tutor_plan check (coalesce(
  (plan is null and status <> 'in_progress')
  or (plan is not null and jsonb_typeof(plan) = 'object'
    and plan->>'version' = '1'
    and plan->>'subject' = subject
    and jsonb_typeof(plan->'items') = 'array'
    and jsonb_array_length(plan->'items') = 5
    and octet_length(plan::text) <= 100000), false)
);
do $owner_pair$
begin
  if not exists (select 1 from pg_constraint where conrelid = 'public.learning_sessions'::regclass
      and conname = 'learning_sessions_tutor_owner_pair') then
    alter table public.learning_sessions add constraint learning_sessions_tutor_owner_pair unique (id, owner_id);
  end if;
end;
$owner_pair$;
create unique index if not exists one_active_learning_session_per_owner
  on public.learning_sessions(owner_id) where status = 'in_progress';

create table if not exists public.learning_attempts (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null references auth.users(id) on delete cascade,
  session_id uuid not null,
  item_id text not null check (length(item_id) between 1 and 120),
  skill_id text not null check (length(skill_id) between 1 and 120),
  year_level integer not null check (year_level between 1 and 2),
  correct boolean not null,
  assisted boolean not null default false,
  response_ms integer not null check (response_ms between 0 and 720000),
  created_at timestamptz not null default now(),
  unique (session_id, item_id),
  foreign key (session_id, owner_id) references public.learning_sessions(id, owner_id) on delete cascade
);
create index if not exists learning_attempts_owner_started
  on public.learning_attempts(owner_id, created_at);

-- An expiring reply receipt makes retries safe without keeping a chat transcript.
-- A reply may quote a short part of Summer's answer; all receipts expire in 24h.
create table if not exists public.tutor_turns (
  request_id uuid primary key,
  owner_id uuid not null references auth.users(id) on delete cascade,
  session_id uuid not null,
  expected_revision integer not null check (expected_revision >= 0),
  action text not null,
  status text not null default 'pending' check (status in ('pending','completed','failed')),
  response jsonb check (response is null or octet_length(response::text) <= 12288),
  created_at timestamptz not null default now(),
  pending_until timestamptz not null default (now() + interval '120 seconds'),
  expires_at timestamptz not null default (now() + interval '24 hours'),
  foreign key (session_id, owner_id) references public.learning_sessions(id, owner_id) on delete cascade
);
create index if not exists tutor_turns_owner_session on public.tutor_turns(owner_id, session_id);
create index if not exists tutor_turns_expiration on public.tutor_turns(expires_at);
create unique index if not exists one_pending_tutor_turn_per_session
  on public.tutor_turns(session_id) where status = 'pending';

alter table public.learning_attempts enable row level security;
alter table public.tutor_turns enable row level security;
revoke all on public.learning_attempts, public.tutor_turns from public, anon, authenticated;
grant select on public.learning_attempts, public.tutor_turns to authenticated;
drop policy if exists learning_attempts_owner on public.learning_attempts;
create policy learning_attempts_owner on public.learning_attempts for select to authenticated
  using (owner_id = (select auth.uid()));
drop policy if exists tutor_turns_owner on public.tutor_turns;
create policy tutor_turns_owner on public.tutor_turns for select to authenticated
  using (owner_id = (select auth.uid()) and expires_at > now());
-- Lesson creation stays available to the parent-token server. Subsequent changes,
-- evidence and receipts go through the atomic ownership-checked RPCs below.
revoke all on public.learning_sessions from public, anon, authenticated;
grant select on public.learning_sessions to authenticated;
grant insert (id,owner_id,subject,status,plan,revision,tutor_state)
  on public.learning_sessions to authenticated;

alter table public.voice_usage drop constraint if exists voice_usage_kind_check;
alter table public.voice_usage add constraint voice_usage_kind_check
  check (kind in ('tts','transcription','tutor'));
create or replace function public.reserve_voice_spend(
  p_kind text, p_amount_cents integer, p_request_id uuid, p_monthly_limit_cents integer default 1500
) returns boolean language plpgsql security definer set search_path = '' as $$
declare
  v_owner uuid := auth.uid();
  v_month timestamptz := date_trunc('month', now() at time zone 'UTC') at time zone 'UTC';
  v_limit integer := least(coalesce(p_monthly_limit_cents, 1500), 1500);
  v_reserved bigint;
begin
  if v_owner is null then raise exception 'Sign-in required.' using errcode = '42501'; end if;
  if p_kind is null or p_kind not in ('tts','transcription','tutor')
      or p_amount_cents is null or p_amount_cents not between 1 and 200
      or p_request_id is null or v_limit < 1 then
    raise exception 'Invalid AI reservation.' using errcode = '22023';
  end if;
  perform pg_advisory_xact_lock(hashtextextended(
    v_owner::text || to_char(v_month at time zone 'UTC', 'YYYY-MM'), 0
  ));
  if exists (select 1 from public.voice_usage where request_id = p_request_id) then return false; end if;
  select coalesce(sum(amount_cents), 0) into v_reserved from public.voice_usage
    where owner_id = v_owner and created_at >= v_month and created_at < v_month + interval '1 month';
  if v_reserved + p_amount_cents > v_limit then return false; end if;
  insert into public.voice_usage(owner_id,kind,amount_cents,request_id)
    values (v_owner,p_kind,p_amount_cents,p_request_id);
  return true;
end;
$$;
revoke all on function public.reserve_voice_spend(text, integer, uuid, integer) from public, anon;
grant execute on function public.reserve_voice_spend(text, integer, uuid, integer) to authenticated;

create or replace function public.claim_tutor_turn(
  p_session_id uuid, p_request_id uuid, p_expected_revision integer, p_action text, p_cost_cents integer
) returns jsonb language plpgsql security definer set search_path = '' as $$
declare
  v_owner uuid := auth.uid();
  v_session public.learning_sessions%rowtype;
  v_turn public.tutor_turns%rowtype;
  v_retry boolean := false;
begin
  if v_owner is null then raise exception 'Sign-in required.' using errcode = '42501'; end if;
  select * into v_session from public.learning_sessions where id = p_session_id and owner_id = v_owner for update;
  if not found then raise exception 'Lesson not found.' using errcode = '42501'; end if;
  if p_request_id is null or p_expected_revision is null or p_expected_revision < 0
      or p_action is null or p_action not in ('start','respond','message','finish','stop')
      or p_cost_cents is null or p_cost_cents not between 0 and 3
      or (p_action in ('finish','stop') and p_cost_cents <> 0)
      or (p_action not in ('finish','stop') and p_cost_cents <> 3) then
    raise exception 'Invalid tutor request.' using errcode = '22023';
  end if;
  select * into v_turn from public.tutor_turns where request_id = p_request_id;
  if found then
    if v_turn.owner_id <> v_owner or v_turn.session_id <> p_session_id or v_turn.action <> p_action then
      raise exception 'Request does not belong to this lesson.' using errcode = '42501';
    end if;
    if v_turn.status = 'completed' and v_turn.expires_at > now() then
      return jsonb_build_object('response',v_turn.response);
    end if;
    if v_turn.status = 'pending' and v_turn.pending_until > clock_timestamp() then
      raise exception 'TUTOR_BUSY' using errcode = 'P0001';
    end if;
    if v_turn.status = 'completed' then
      raise exception 'TUTOR_EXPIRED' using errcode = 'P0001';
    end if;
    v_retry := true;
  end if;
  if v_session.status <> 'in_progress' then raise exception 'TUTOR_INACTIVE' using errcode = '23514'; end if;
  -- Stop wins over an unfinished provider call. Its late commit will be rejected.
  update public.tutor_turns set status = 'failed'
    where session_id = p_session_id and status = 'pending'
      and (p_action = 'stop' or pending_until <= clock_timestamp());
  if exists (select 1 from public.tutor_turns where session_id = p_session_id and status = 'pending') then
    raise exception 'TUTOR_BUSY' using errcode = 'P0001';
  end if;
  if (v_retry and v_session.revision <> v_turn.expected_revision)
      or (p_action <> 'stop' and v_session.revision <> p_expected_revision) then
    raise exception 'TUTOR_STALE' using errcode = 'P0001';
  end if;
  if p_action = 'finish' and (v_session.tutor_state->>'index')::integer < 5 then
    raise exception 'Lesson is not finished.' using errcode = '23514';
  end if;
  -- Retrying a failed/expired provider call needs another conservative spend
  -- reservation. The previous reservation remains, even when a timeout hid billing.
  if p_cost_cents > 0 and not public.reserve_voice_spend('tutor',p_cost_cents,
      case when v_retry then gen_random_uuid() else p_request_id end,1500) then
    raise exception 'TUTOR_BUDGET' using errcode = 'P0001';
  end if;
  if v_retry then
    update public.tutor_turns set status = 'pending', response = null,
      pending_until = clock_timestamp() + interval '120 seconds',
      expires_at = clock_timestamp() + interval '24 hours', expected_revision = v_session.revision
      where request_id = p_request_id;
  else
    insert into public.tutor_turns(request_id,owner_id,session_id,expected_revision,action)
      values (p_request_id,v_owner,p_session_id,v_session.revision,p_action);
  end if;
  return jsonb_build_object('claimed',true,'revision',v_session.revision);
end;
$$;
revoke all on function public.claim_tutor_turn(uuid, uuid, integer, text, integer) from public, anon;
grant execute on function public.claim_tutor_turn(uuid, uuid, integer, text, integer) to authenticated;

create or replace function public.commit_tutor_turn(
  p_session_id uuid, p_request_id uuid, p_state jsonb, p_response jsonb,
  p_attempt jsonb default null, p_finish boolean default false, p_stop boolean default false
) returns jsonb language plpgsql security definer set search_path = '' as $$
declare
  v_owner uuid := auth.uid();
  v_session public.learning_sessions%rowtype;
  v_turn public.tutor_turns%rowtype;
  v_item jsonb;
  v_index integer;
  v_correct integer;
  v_total integer;
begin
  if v_owner is null then raise exception 'Sign-in required.' using errcode = '42501'; end if;
  select * into v_session from public.learning_sessions where id = p_session_id and owner_id = v_owner for update;
  if not found then raise exception 'Lesson not found.' using errcode = '42501'; end if;
  select * into v_turn from public.tutor_turns
    where request_id = p_request_id and session_id = p_session_id and owner_id = v_owner for update;
  if not found then raise exception 'Request not found.' using errcode = '42501'; end if;
  if v_turn.status = 'completed' and v_turn.expires_at > now() then return v_turn.response; end if;
  if v_turn.status <> 'pending' or v_turn.pending_until <= clock_timestamp() then
    raise exception 'TUTOR_EXPIRED' using errcode = 'P0001';
  end if;
  if v_session.status <> 'in_progress' or v_session.revision <> v_turn.expected_revision then
    raise exception 'TUTOR_STALE' using errcode = 'P0001';
  end if;
  if p_finish is null or p_stop is null or (p_finish and p_stop)
      or not public.valid_tutor_state(p_state) or jsonb_typeof(p_response) is distinct from 'object'
      or octet_length(p_response::text) > 12288 then
    raise exception 'Invalid tutor result.' using errcode = '23514';
  end if;
  v_index := (v_session.tutor_state->>'index')::integer;
  v_correct := (v_session.tutor_state->>'correct')::integer;
  v_total := jsonb_array_length(v_session.plan->'items');
  if p_response->>'sessionId' is distinct from p_session_id::text
      or p_response->>'revision' is distinct from (v_session.revision + 1)::text
      or p_response->>'subject' is distinct from v_session.subject
      or p_response->'progress'->>'answered' is distinct from p_state->>'index'
      or p_response->'progress'->>'correct' is distinct from p_state->>'correct'
      or p_response->'progress'->>'total' is distinct from v_total::text
      or p_response->>'complete' is distinct from p_finish::text then
    raise exception 'Result does not match the lesson.' using errcode = '23514';
  end if;
  if p_stop then
    if v_turn.action <> 'stop' or p_attempt is not null or p_state <> v_session.tutor_state
        or p_response->>'stopped' is distinct from 'true' then
      raise exception 'Invalid stopped result.' using errcode = '23514';
    end if;
  elsif p_attempt is not null then
    if v_turn.action <> 'respond' or v_index >= v_total
        or (p_state->>'index')::integer <> v_index + 1
        or jsonb_typeof(p_attempt->'correct') is distinct from 'boolean'
        or jsonb_typeof(p_attempt->'assisted') is distinct from 'boolean'
        or (p_attempt->>'year_level') not in ('1','2')
        or (p_attempt->>'response_ms') !~ '^[0-9]{1,6}$'
        or (p_attempt->>'response_ms')::integer > 720000 then
      raise exception 'Invalid learning evidence.' using errcode = '23514';
    end if;
    v_item := v_session.plan->'items'->v_index->('year' || (p_attempt->>'year_level'));
    if v_item is null
        or p_attempt->>'year_level' is distinct from (case when (v_session.tutor_state->>'incorrectStreak')::integer >= 2 then '1' else '2' end)
        or p_attempt->>'item_id' is distinct from v_item->>'id'
        or p_attempt->>'skill_id' is distinct from v_item->>'skillId'
        or (p_state->>'correct')::integer <> v_correct + (case when (p_attempt->>'correct')::boolean then 1 else 0 end)
        or p_state->>'helped' is distinct from 'false'
        or p_attempt->>'assisted' is distinct from v_session.tutor_state->>'helped'
        or (p_state->>'incorrectStreak')::integer <> (case when (p_attempt->>'correct')::boolean then 0
          else (v_session.tutor_state->>'incorrectStreak')::integer + 1 end) then
      raise exception 'Evidence does not match the planned question.' using errcode = '23514';
    end if;
    insert into public.learning_attempts(owner_id,session_id,item_id,skill_id,year_level,correct,assisted,response_ms)
      values (v_owner,p_session_id,p_attempt->>'item_id',p_attempt->>'skill_id',
        (p_attempt->>'year_level')::integer,(p_attempt->>'correct')::boolean,
        (p_attempt->>'assisted')::boolean,(p_attempt->>'response_ms')::integer);
  elsif v_turn.action = 'respond' or (p_state->>'index')::integer <> v_index
      or (p_state->>'correct')::integer <> v_correct
      or p_state->>'incorrectStreak' is distinct from v_session.tutor_state->>'incorrectStreak'
      or (v_turn.action = 'message' and v_session.tutor_state->>'helped' = 'true'
        and p_state->>'helped' is distinct from 'true')
      or (v_turn.action <> 'message' and p_state->>'helped' is distinct from v_session.tutor_state->>'helped') then
    raise exception 'A question needs matching learning evidence.' using errcode = '23514';
  end if;
  if p_finish and ((p_state->>'index')::integer <> v_total or
      (select count(*) from public.learning_attempts where session_id = p_session_id and owner_id = v_owner) <> v_total) then
    raise exception 'Complete all five questions before finishing.' using errcode = '23514';
  end if;
  update public.learning_sessions set tutor_state = p_state, revision = revision + 1,
    status = case when p_stop then 'stopped' when p_finish then 'completed' else 'in_progress' end,
    completed_at = case when p_finish then clock_timestamp() else null end,
    summary = case when p_finish then jsonb_build_object('answered',v_total,'total',v_total,
      'correct',(p_state->>'correct')::integer,'observations',p_state->'observations') else summary end
    where id = p_session_id;
  update public.tutor_turns set status = 'completed', response = p_response
    where request_id = p_request_id;
  return p_response;
end;
$$;
revoke all on function public.commit_tutor_turn(uuid, uuid, jsonb, jsonb, jsonb, boolean, boolean) from public, anon;
grant execute on function public.commit_tutor_turn(uuid, uuid, jsonb, jsonb, jsonb, boolean, boolean) to authenticated;

create or replace function public.fail_tutor_turn(p_session_id uuid, p_request_id uuid)
returns void language plpgsql security definer set search_path = '' as $$
declare v_owner uuid := auth.uid();
begin
  if v_owner is null then raise exception 'Sign-in required.' using errcode = '42501'; end if;
  perform 1 from public.learning_sessions where id = p_session_id and owner_id = v_owner for update;
  if not found then raise exception 'Lesson not found.' using errcode = '42501'; end if;
  -- Keep the conservative spend reservation: a timed-out provider may have billed.
  update public.tutor_turns set status = 'failed'
    where request_id = p_request_id and session_id = p_session_id
      and owner_id = v_owner and status = 'pending';
end;
$$;
revoke all on function public.fail_tutor_turn(uuid, uuid) from public, anon;
grant execute on function public.fail_tutor_turn(uuid, uuid) to authenticated;

-- The existing installation enabled pg_cron for private recording retention.
-- Reads expire even if that extension is unavailable. Surface the missing purge
-- rather than silently describing deletion as configured.
do $retention$
begin
  if exists (select 1 from pg_namespace where nspname = 'cron') then
    perform cron.schedule('summer-delete-expired-tutor-receipts','*/10 * * * *',
      'delete from public.tutor_turns where expires_at <= now();');
  else
    raise warning 'Tutor receipts are hidden after 24h; enable pg_cron and rerun this migration to schedule their deletion.';
  end if;
end;
$retention$;
commit;
