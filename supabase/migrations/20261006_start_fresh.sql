begin;
alter table public.assessments add column if not exists is_archived boolean not null default false;
alter table public.learning_sessions add column if not exists is_archived boolean not null default false;
drop index if exists public.one_active_baseline_per_owner;
drop index if exists public.one_completed_baseline_per_owner;
drop index if exists public.one_active_followup_per_owner;
drop index if exists public.one_completed_followup_per_owner;
create unique index one_active_baseline_per_owner on public.assessments(owner_id) where kind='baseline' and status='in_progress' and not is_archived;
create unique index one_completed_baseline_per_owner on public.assessments(owner_id) where kind='baseline' and status='completed' and not is_archived;
create unique index one_active_followup_per_owner on public.assessments(owner_id) where kind='followup' and status='in_progress' and not is_archived;
create unique index one_completed_followup_per_owner on public.assessments(owner_id) where kind='followup' and status='completed' and not is_archived;

create table if not exists public.learning_resets (
 request_id uuid primary key, owner_id uuid not null references auth.users(id) on delete cascade,
 assessment_count integer not null, lesson_count integer not null, created_at timestamptz not null default now()
);
alter table public.learning_resets enable row level security;
revoke all on public.learning_resets from public, anon, authenticated;

create or replace function public.lock_learning_owner() returns trigger language plpgsql security definer set search_path='' as $$
begin
 if auth.uid() is not null then perform pg_advisory_xact_lock(hashtextextended(auth.uid()::text, 613)); end if;
 return null;
end; $$;
revoke all on function public.lock_learning_owner() from public, anon, authenticated;
do $$ declare t text; begin
 foreach t in array array['assessments','assessment_sessions','attempts','reading_recordings','reading_reviews','learning_sessions'] loop
 execute format('drop trigger if exists lock_learning_owner on public.%I',t);
 execute format('create trigger lock_learning_owner before insert or update or delete on public.%I for each statement execute function public.lock_learning_owner()',t);
 end loop;
end; $$;

-- Only the reset function can change archive metadata. Raw completed evidence stays immutable.
create or replace function public.protect_assessment() returns trigger language plpgsql security definer set search_path='' as $$
begin
 if tg_op='UPDATE' and new.is_archived is distinct from old.is_archived then
  if current_setting('summer.reset_owner',true)=old.owner_id::text and not old.is_archived and new.is_archived
   and (to_jsonb(new)-'is_archived')=(to_jsonb(old)-'is_archived') then return new; end if;
  raise exception 'Archive metadata requires the parent reset action.' using errcode='23514';
 end if;
 if tg_op<>'INSERT' and (old.status='completed' or old.is_archived) then raise exception 'Completed or archived assessments are immutable.' using errcode='23514'; end if;
 if tg_op='DELETE' then return old; end if;
 if tg_op='INSERT' and new.is_archived then raise exception 'New assessments must be active.' using errcode='23514'; end if;
 if tg_op='UPDATE' and (new.id,new.owner_id,new.kind,new.started_at) is distinct from (old.id,old.owner_id,old.kind,old.started_at) then raise exception 'Assessment identity cannot change.' using errcode='23514'; end if;
 return new;
end; $$;
create or replace function public.require_open_assessment(p_assessment_id uuid,p_owner_id uuid) returns void language plpgsql security definer set search_path='' as $$
begin
 perform pg_advisory_xact_lock(hashtextextended(p_owner_id::text,613));
 perform 1 from public.assessments where id=p_assessment_id and owner_id=p_owner_id and status='in_progress' and not is_archived for update;
 if not found then raise exception 'Assessment is no longer active.' using errcode='23514'; end if;
end; $$;

create or replace function public.guard_archived_learning() returns trigger language plpgsql security definer set search_path='' as $$
begin
 if tg_op<>'INSERT' and old.is_archived then raise exception 'This lesson was cleared.' using errcode='23514'; end if;
 if tg_op='DELETE' then return old; end if;
 if tg_op='INSERT' and new.status='in_progress' and exists(select 1 from public.learning_resets where owner_id=new.owner_id) and not exists(select 1 from public.assessments where owner_id=new.owner_id and kind='baseline' and status='completed' and not is_archived) then
  raise exception 'A fresh starting check is required.' using errcode='23514';
 end if;
 if new.is_archived and current_setting('summer.reset_owner',true) is distinct from new.owner_id::text then raise exception 'Use the parent reset action.' using errcode='23514'; end if;
 return new;
end; $$;
revoke all on function public.guard_archived_learning() from public, anon, authenticated;
drop trigger if exists guard_archived_learning on public.learning_sessions;
create trigger guard_archived_learning before insert or update or delete on public.learning_sessions for each row execute function public.guard_archived_learning();

-- Acquire the same owner lock before row locks in the existing atomic tutor functions.
do $$ declare f record; d text; begin
 for f in select p.oid from pg_proc p join pg_namespace n on n.oid=p.pronamespace where n.nspname='public' and p.proname in ('claim_tutor_turn','commit_tutor_turn','fail_tutor_turn') loop
 d:=pg_get_functiondef(f.oid);
 if position('summer reset owner lock' in d)=0 then
 d:=regexp_replace(d,'\mbegin\M',E'begin\n  -- summer reset owner lock\n  perform pg_advisory_xact_lock(hashtextextended(auth.uid()::text,613));','i');
 execute d;
 end if;
 end loop;
end; $$;

create or replace function public.archive_learning_results(p_request_id uuid) returns jsonb language plpgsql security definer set search_path='' as $$
declare v_owner uuid:=auth.uid(); v_a integer; v_l integer; v_prior public.learning_resets%rowtype;
begin
 if v_owner is null or p_request_id is null then raise exception 'Sign-in required.' using errcode='42501'; end if;
 perform pg_advisory_xact_lock(hashtextextended(v_owner::text,613));
 select * into v_prior from public.learning_resets where request_id=p_request_id;
 if found then
  if v_prior.owner_id<>v_owner then raise exception 'Reset belongs to another account.' using errcode='42501'; end if;
  return jsonb_build_object('archivedAssessments',v_prior.assessment_count,'archivedLessons',v_prior.lesson_count,'alreadyReset',true);
 end if;
 perform set_config('summer.reset_owner',v_owner::text,true);
 update public.assessments set is_archived=true where owner_id=v_owner and not is_archived;
 get diagnostics v_a=row_count;
 update public.learning_sessions set is_archived=true, status=case when status='in_progress' then 'stopped' else status end,
 revision=revision+1 where owner_id=v_owner and not is_archived;
 get diagnostics v_l=row_count;
 update public.tutor_turns set status='failed',pending_until=now() where owner_id=v_owner and status='pending';
 insert into public.learning_resets(request_id,owner_id,assessment_count,lesson_count) values(p_request_id,v_owner,v_a,v_l);
 perform set_config('summer.reset_owner','',true);
 return jsonb_build_object('archivedAssessments',v_a,'archivedLessons',v_l);
end; $$;
revoke all on function public.archive_learning_results(uuid) from public, anon;
grant execute on function public.archive_learning_results(uuid) to authenticated;
notify pgrst,'reload schema';
commit;
