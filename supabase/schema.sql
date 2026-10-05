-- Summer's Learning Lab — run in a NEW Supabase project's SQL editor.
-- Idempotent for this schema; it does not migrate unrelated existing tables.
-- No service-role key is needed by the app. All app queries use a signed-in
-- parent's access token, with these ownership rules as an additional boundary.

create extension if not exists pgcrypto;

create table if not exists public.profiles (
  owner_id uuid primary key references auth.users(id) on delete cascade default auth.uid(),
  first_name text not null default 'Summer' check (first_name = 'Summer'),
  parent_pin_hash text,
  parent_pin_failures integer not null default 0 check (parent_pin_failures between 0 and 5),
  parent_pin_locked_until timestamptz,
  created_at timestamptz not null default now()
);

create table if not exists public.assessments (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null references auth.users(id) on delete cascade default auth.uid(),
  kind text not null check (kind in ('baseline', 'followup')),
  status text not null default 'in_progress' check (status in ('in_progress', 'completed')),
  started_at timestamptz not null default now(),
  completed_at timestamptz,
  unique (id, owner_id),
  check ((status = 'in_progress' and completed_at is null)
      or (status = 'completed' and completed_at is not null)),
  check (completed_at is null or completed_at >= started_at)
);
create unique index if not exists one_active_baseline_per_owner
  on public.assessments(owner_id) where kind = 'baseline' and status = 'in_progress';
create unique index if not exists one_completed_baseline_per_owner
  on public.assessments(owner_id) where kind = 'baseline' and status = 'completed';
create unique index if not exists one_active_followup_per_owner
  on public.assessments(owner_id) where kind = 'followup' and status = 'in_progress';
create unique index if not exists one_completed_followup_per_owner
  on public.assessments(owner_id) where kind = 'followup' and status = 'completed';
create index if not exists assessments_owner_started
  on public.assessments(owner_id, started_at desc);

create table if not exists public.assessment_sessions (
  id uuid primary key default gen_random_uuid(),
  assessment_id uuid not null,
  owner_id uuid not null references auth.users(id) on delete cascade default auth.uid(),
  part text not null check (part in ('maths', 'english', 'reading')),
  status text not null default 'in_progress' check (status in ('in_progress', 'completed', 'stopped')),
  started_at timestamptz not null default now(),
  completed_at timestamptz,
  unique (id, assessment_id, owner_id),
  foreign key (assessment_id, owner_id) references public.assessments(id, owner_id) on delete cascade,
  check (status <> 'completed' or completed_at is not null),
  check (status <> 'in_progress' or completed_at is null),
  check (completed_at is null or completed_at >= started_at)
);
create index if not exists assessment_sessions_assessment
  on public.assessment_sessions(assessment_id, started_at);
create unique index if not exists one_active_part_per_assessment
  on public.assessment_sessions(assessment_id, part) where status = 'in_progress';

create table if not exists public.attempts (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null references auth.users(id) on delete cascade default auth.uid(),
  assessment_id uuid not null,
  session_id uuid not null,
  item_id text not null check (length(item_id) between 1 and 120),
  skill_id text not null check (length(skill_id) between 1 and 120),
  correct boolean,
  response_ms integer not null check (response_ms >= 0),
  assisted boolean not null default false,
  likely_guess boolean not null default false,
  created_at timestamptz not null default now(),
  year_level integer not null check (year_level between 0 and 4),
  reading_estimate numeric check (reading_estimate between 0 and 100),
  unique (assessment_id, item_id),
  foreign key (assessment_id, owner_id) references public.assessments(id, owner_id) on delete cascade,
  foreign key (session_id, assessment_id, owner_id)
    references public.assessment_sessions(id, assessment_id, owner_id) on delete cascade
);
create index if not exists attempts_owner_assessment on public.attempts(owner_id, assessment_id);

-- Audio is private database data: no public Storage bucket or transcript column.
-- Five MiB decoded is at most 6,990,508 base64 characters. Actual MIME/decoded
-- byte checks are also made in the server before accepting a recording.
create table if not exists public.reading_recordings (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null references auth.users(id) on delete cascade default auth.uid(),
  assessment_id uuid not null,
  session_id uuid not null,
  item_id text not null check (length(item_id) between 1 and 120),
  audio_base64 text not null check (
    length(audio_base64) between 1 and 6990508
    and audio_base64 ~ '^[A-Za-z0-9+/]+={0,2}$'
    and length(audio_base64) % 4 = 0
    and (length(audio_base64) / 4 * 3 - case
      when right(audio_base64, 2) = '==' then 2
      when right(audio_base64, 1) = '=' then 1 else 0 end) <= 5242880
  ),
  mime_type text not null check (mime_type in (
    'audio/webm', 'audio/webm;codecs=opus', 'audio/mp4', 'audio/mpeg',
    'audio/wav', 'audio/x-wav', 'audio/ogg', 'audio/ogg;codecs=opus'
  )),
  accuracy_estimate numeric check (accuracy_estimate between 0 and 100),
  parent_accuracy numeric check (parent_accuracy between 0 and 100),
  created_at timestamptz not null default now(),
  expires_at timestamptz not null default (now() + interval '720 hours'),
  foreign key (assessment_id, owner_id) references public.assessments(id, owner_id) on delete cascade,
  foreign key (session_id, assessment_id, owner_id)
    references public.assessment_sessions(id, assessment_id, owner_id) on delete cascade
);
create index if not exists recordings_owner_assessment on public.reading_recordings(owner_id, assessment_id);
create index if not exists recordings_expiration on public.reading_recordings(expires_at);

-- A parent's correction survives audio deletion without rewriting initial
-- assessment evidence. No recording ID, audio or transcript is kept here.
create table if not exists public.reading_reviews (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null references auth.users(id) on delete cascade default auth.uid(),
  assessment_id uuid not null,
  item_id text not null,
  parent_accuracy numeric check (parent_accuracy between 0 and 100),
  original_estimate numeric check (original_estimate between 0 and 100),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (owner_id, assessment_id, item_id),
  foreign key (assessment_id, owner_id) references public.assessments(id, owner_id) on delete cascade,
  foreign key (assessment_id, item_id) references public.attempts(assessment_id, item_id) on delete cascade
);

create table if not exists public.learning_sessions (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null references auth.users(id) on delete cascade default auth.uid(),
  started_at timestamptz not null default now(),
  completed_at timestamptz,
  check (completed_at is null or completed_at >= started_at)
);
create index if not exists learning_sessions_owner_started on public.learning_sessions(owner_id, started_at desc);

-- Conservative USD-cent reservations, not OpenAI invoices. Only the atomic RPC
-- below may append rows; reservations remain even if a provider call fails.
create table if not exists public.voice_usage (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null references auth.users(id) on delete cascade,
  kind text not null check (kind in ('tts', 'transcription')),
  amount_cents integer not null check (amount_cents between 1 and 200),
  created_at timestamptz not null default now(),
  request_id uuid not null unique
);
create index if not exists voice_usage_owner_month on public.voice_usage(owner_id, created_at);

-- A row lock serializes saves against assessment completion. RLS alone is not
-- sufficient here: an insert can otherwise race a concurrent completion.
create or replace function public.require_open_assessment(p_assessment_id uuid, p_owner_id uuid)
returns void language plpgsql security definer set search_path = '' as $$
declare v_status text;
begin
  select status into v_status from public.assessments
    where id = p_assessment_id and owner_id = p_owner_id for update;
  if v_status is distinct from 'in_progress' then
    raise exception 'This assessment is missing or already completed.' using errcode = '23514';
  end if;
end;
$$;
revoke all on function public.require_open_assessment(uuid, uuid) from public, anon, authenticated;

create or replace function public.protect_assessment()
returns trigger language plpgsql security definer set search_path = '' as $$
begin
  if tg_op <> 'INSERT' and old.status = 'completed' then
    raise exception 'Completed assessments are immutable.' using errcode = '23514';
  end if;
  if tg_op = 'DELETE' then return old; end if;
  if tg_op = 'UPDATE' and (new.id, new.owner_id, new.kind, new.started_at)
      is distinct from (old.id, old.owner_id, old.kind, old.started_at) then
    raise exception 'Assessment identity and start time cannot be changed.' using errcode = '23514';
  end if;
  return new;
end;
$$;
revoke all on function public.protect_assessment() from public, anon, authenticated;
drop trigger if exists protect_assessment on public.assessments;
create trigger protect_assessment before insert or update or delete on public.assessments
  for each row execute function public.protect_assessment();

create or replace function public.protect_assessment_evidence()
returns trigger language plpgsql security definer set search_path = '' as $$
begin
  -- For an allowed deletion of an unfinished assessment, PostgreSQL's
  -- cascading child deletes happen after the parent row has disappeared.
  -- Completed parent deletion is rejected by protect_assessment beforehand.
  if tg_op = 'DELETE' and pg_trigger_depth() > 1 and not exists (
      select 1 from public.assessments where id = old.assessment_id and owner_id = old.owner_id
  ) then return old; end if;
  if tg_op <> 'INSERT' then
    perform public.require_open_assessment(old.assessment_id, old.owner_id);
  end if;
  if tg_op <> 'DELETE' then
    perform public.require_open_assessment(new.assessment_id, new.owner_id);
    if tg_op = 'UPDATE' and (new.id, new.assessment_id, new.owner_id)
        is distinct from (old.id, old.assessment_id, old.owner_id) then
      raise exception 'Assessment evidence cannot be moved.' using errcode = '23514';
    end if;
    return new;
  end if;
  return old;
end;
$$;
revoke all on function public.protect_assessment_evidence() from public, anon, authenticated;
drop trigger if exists protect_session_evidence on public.assessment_sessions;
create trigger protect_session_evidence before insert or update or delete on public.assessment_sessions
  for each row execute function public.protect_assessment_evidence();
drop trigger if exists protect_attempt_evidence on public.attempts;
create trigger protect_attempt_evidence before insert or update or delete on public.attempts
  for each row execute function public.protect_assessment_evidence();

create or replace function public.protect_reading_recording()
returns trigger language plpgsql security definer set search_path = '' as $$
begin
  if tg_op = 'INSERT' then
    perform public.require_open_assessment(new.assessment_id, new.owner_id);
    -- The caller cannot backdate the upload or extend its lifetime.
    new.created_at := now();
    new.expires_at := new.created_at + interval '720 hours';
    return new;
  end if;
  if tg_op = 'UPDATE' then
    if (to_jsonb(new) - 'parent_accuracy') is distinct from (to_jsonb(old) - 'parent_accuracy') then
      raise exception 'Only the parent reading correction may be changed.' using errcode = '23514';
    end if;
    return new;
  end if;
  -- A parent or retention job may delete audio even after completion.
  return old;
end;
$$;
revoke all on function public.protect_reading_recording() from public, anon, authenticated;
drop trigger if exists protect_reading_recording on public.reading_recordings;
create trigger protect_reading_recording before insert or update or delete on public.reading_recordings
  for each row execute function public.protect_reading_recording();

create or replace function public.protect_reading_review()
returns trigger language plpgsql security definer set search_path = '' as $$
begin
  if tg_op = 'INSERT' then
    -- Preserve the actual immutable evidence, not a caller-supplied estimate.
    select reading_estimate into new.original_estimate from public.attempts
      where assessment_id = new.assessment_id and owner_id = new.owner_id and item_id = new.item_id;
    if not found then raise exception 'Original reading attempt missing.' using errcode = '23503'; end if;
    new.created_at := now();
  elsif (new.id, new.owner_id, new.assessment_id, new.item_id, new.original_estimate, new.created_at)
      is distinct from (old.id, old.owner_id, old.assessment_id, old.item_id, old.original_estimate, old.created_at) then
    raise exception 'Only the parent reading correction may be changed.' using errcode = '23514';
  end if;
  new.updated_at := now();
  return new;
end;
$$;
revoke all on function public.protect_reading_review() from public, anon, authenticated;
drop trigger if exists protect_reading_review on public.reading_reviews;
create trigger protect_reading_review before insert or update on public.reading_reviews
  for each row execute function public.protect_reading_review();

alter table public.profiles enable row level security;
alter table public.assessments enable row level security;
alter table public.assessment_sessions enable row level security;
alter table public.attempts enable row level security;
alter table public.reading_recordings enable row level security;
alter table public.reading_reviews enable row level security;
alter table public.learning_sessions enable row level security;
alter table public.voice_usage enable row level security;

-- No anonymous access, including projects with permissive default privileges.
revoke all on public.profiles, public.assessments, public.assessment_sessions,
  public.attempts, public.reading_recordings, public.reading_reviews, public.learning_sessions, public.voice_usage
  from anon, public;
grant select, insert, update, delete on public.profiles, public.assessments,
  public.assessment_sessions, public.attempts, public.reading_recordings, public.reading_reviews,
  public.learning_sessions to authenticated;
revoke all on public.voice_usage from authenticated;
grant select on public.voice_usage to authenticated;

drop policy if exists profiles_owner on public.profiles;
create policy profiles_owner on public.profiles to authenticated
  using (owner_id = (select auth.uid())) with check (owner_id = (select auth.uid()));

-- PIN verification stays in Node, where the scrypt hash is checked. Failed
-- checks use this atomic increment so simultaneous guesses cannot lose counts.
create or replace function public.record_pin_failure()
returns timestamptz language plpgsql security definer set search_path = '' as $$
declare
  v_owner uuid := auth.uid();
  v_failures integer;
  v_locked_until timestamptz;
begin
  if v_owner is null then raise exception 'Sign-in required.' using errcode = '42501'; end if;
  select parent_pin_failures, parent_pin_locked_until into v_failures, v_locked_until
    from public.profiles where owner_id = v_owner for update;
  if not found then raise exception 'Parent profile missing.' using errcode = '23503'; end if;
  if v_locked_until > now() then return v_locked_until; end if;
  if v_locked_until is not null then v_failures := 0; end if;
  v_failures := least(v_failures + 1, 5);
  v_locked_until := case when v_failures >= 5 then now() + interval '10 minutes' else null end;
  update public.profiles set parent_pin_failures = v_failures,
    parent_pin_locked_until = v_locked_until where owner_id = v_owner;
  return v_locked_until;
end;
$$;
revoke all on function public.record_pin_failure() from public, anon;
grant execute on function public.record_pin_failure() to authenticated;

drop policy if exists assessments_owner on public.assessments;
create policy assessments_owner on public.assessments to authenticated
  using (owner_id = (select auth.uid())) with check (owner_id = (select auth.uid()));
drop policy if exists sessions_owner on public.assessment_sessions;
create policy sessions_owner on public.assessment_sessions to authenticated
  using (owner_id = (select auth.uid())) with check (owner_id = (select auth.uid()));
drop policy if exists attempts_owner on public.attempts;
create policy attempts_owner on public.attempts to authenticated
  using (owner_id = (select auth.uid())) with check (owner_id = (select auth.uid()));
drop policy if exists reading_reviews_owner on public.reading_reviews;
create policy reading_reviews_owner on public.reading_reviews to authenticated
  using (owner_id = (select auth.uid())) with check (owner_id = (select auth.uid()));
drop policy if exists learning_sessions_owner on public.learning_sessions;
create policy learning_sessions_owner on public.learning_sessions to authenticated
  using (owner_id = (select auth.uid())) with check (owner_id = (select auth.uid()));
drop policy if exists voice_usage_owner on public.voice_usage;
create policy voice_usage_owner on public.voice_usage for select to authenticated
  using (owner_id = (select auth.uid()));

-- Reads stop at the expiry time, regardless of when the scheduled purge runs.
drop policy if exists recordings_read on public.reading_recordings;
create policy recordings_read on public.reading_recordings for select to authenticated
  using (owner_id = (select auth.uid()) and expires_at > now());
drop policy if exists recordings_insert on public.reading_recordings;
create policy recordings_insert on public.reading_recordings for insert to authenticated
  with check (owner_id = (select auth.uid()) and expires_at > now());
drop policy if exists recordings_update on public.reading_recordings;
create policy recordings_update on public.reading_recordings for update to authenticated
  using (owner_id = (select auth.uid()) and expires_at > now())
  with check (owner_id = (select auth.uid()) and expires_at > now());
drop policy if exists recordings_delete on public.reading_recordings;
create policy recordings_delete on public.reading_recordings for delete to authenticated
  using (owner_id = (select auth.uid()));

-- One transaction preserves the audio and its evidence together. A duplicate
-- item or any validation failure rolls back both inserts, including the audio.
create or replace function public.save_reading_attempt(
  p_assessment_id uuid,
  p_session_id uuid,
  p_item_id text,
  p_skill_id text,
  p_year_level integer,
  p_audio_base64 text,
  p_mime_type text,
  p_response_ms integer,
  p_assisted boolean,
  p_reading_estimate numeric default null
) returns uuid language plpgsql security definer set search_path = '' as $$
declare
  v_owner uuid := auth.uid();
  v_session public.assessment_sessions%rowtype;
  v_recording uuid;
begin
  if v_owner is null then raise exception 'Sign-in required.' using errcode = '42501'; end if;
  -- Lock order matches ordinary session updates: session, then assessment.
  select * into v_session from public.assessment_sessions
    where id = p_session_id and assessment_id = p_assessment_id and owner_id = v_owner
    for update;
  if not found or v_session.status <> 'in_progress' or v_session.part <> 'reading' then
    raise exception 'This reading session is not active.' using errcode = '23514';
  end if;
  perform public.require_open_assessment(p_assessment_id, v_owner);
  -- Check actual time after transcription and any lock wait, not the older
  -- transaction timestamp. An expired/stopped part cannot accept a late clip.
  if v_session.started_at + interval '12 minutes' <= clock_timestamp() then
    raise exception 'This reading session has ended.' using errcode = '23514';
  end if;
  if p_response_ms is null or p_response_ms not between 500 and 65000 then
    raise exception 'Reading duration must be between half a second and 65 seconds.' using errcode = '22023';
  end if;
  insert into public.reading_recordings(
    owner_id, assessment_id, session_id, item_id, audio_base64, mime_type, accuracy_estimate
  ) values (
    v_owner, p_assessment_id, p_session_id, p_item_id, p_audio_base64, p_mime_type, p_reading_estimate
  ) returning id into v_recording;
  insert into public.attempts(
    owner_id, assessment_id, session_id, item_id, skill_id, correct,
    response_ms, assisted, likely_guess, year_level, reading_estimate
  ) values (
    v_owner, p_assessment_id, p_session_id, p_item_id, p_skill_id, null,
    p_response_ms, p_assisted, false, p_year_level, p_reading_estimate
  );
  return v_recording;
end;
$$;
revoke all on function public.save_reading_attempt(uuid, uuid, text, text, integer, text, text, integer, boolean, numeric)
  from public, anon;
grant execute on function public.save_reading_attempt(uuid, uuid, text, text, integer, text, text, integer, boolean, numeric)
  to authenticated;

create or replace function public.reserve_voice_spend(
  p_kind text,
  p_amount_cents integer,
  p_request_id uuid,
  p_monthly_limit_cents integer default 1500
) returns boolean language plpgsql security definer set search_path = '' as $$
declare
  v_owner uuid := auth.uid();
  v_month timestamptz := date_trunc('month', now() at time zone 'UTC') at time zone 'UTC';
  v_limit integer := least(coalesce(p_monthly_limit_cents, 1500), 1500);
  v_reserved bigint;
begin
  if v_owner is null then raise exception 'Sign-in required.' using errcode = '42501'; end if;
  if p_kind is null or p_kind not in ('tts', 'transcription')
      or p_amount_cents is null or p_amount_cents not between 1 and 200
      or p_request_id is null or v_limit < 1 then
    raise exception 'Invalid voice reservation.' using errcode = '22023';
  end if;
  perform pg_advisory_xact_lock(hashtextextended(
    v_owner::text || to_char(v_month at time zone 'UTC', 'YYYY-MM'), 0
  ));
  -- A reservation ID cannot be used again to authorize another provider call.
  if exists (select 1 from public.voice_usage where request_id = p_request_id) then return false; end if;
  select coalesce(sum(amount_cents), 0) into v_reserved from public.voice_usage
    where owner_id = v_owner and created_at >= v_month
      and created_at < v_month + interval '1 month';
  if v_reserved + p_amount_cents > v_limit then return false; end if;
  insert into public.voice_usage(owner_id, kind, amount_cents, request_id)
    values (v_owner, p_kind, p_amount_cents, p_request_id);
  return true;
end;
$$;
revoke all on function public.reserve_voice_spend(text, integer, uuid, integer) from public, anon;
grant execute on function public.reserve_voice_spend(text, integer, uuid, integer) to authenticated;

-- RETENTION SETUP: enable pg_cron in Supabase Database → Extensions first.
-- This final block intentionally fails if that required extension is missing;
-- do not consider audio retention configured until the job is present/healthy.
create extension if not exists pg_cron with schema pg_catalog;
select cron.schedule(
  'summer-delete-expired-recordings',
  '* * * * *',
  $$delete from public.reading_recordings where expires_at <= now();$$
);
