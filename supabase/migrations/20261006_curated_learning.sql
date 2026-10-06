-- Retain all existing ownership, reset and grading checks; extend only planned entry year selection.
begin;
do $migration$
declare
 definition text;
 previous text := $old$case when (v_session.tutor_state->>'incorrectStreak')::integer >= 2 then '1' else '2' end$old$;
 replacement text := $new$case when (v_session.tutor_state->>'incorrectStreak')::integer >= 2 or v_session.plan->'items'->v_index->>'entryYear' = '1' then '1' else '2' end$new$;
begin
 select pg_get_functiondef(p.oid) into definition from pg_proc p join pg_namespace n on n.oid=p.pronamespace where n.nspname='public' and p.proname='commit_tutor_turn';
 if definition is null then raise exception 'Install the conversational tutor migration first.'; end if;
 if position(replacement in definition)>0 then return; end if;
 if position(previous in definition)=0 then raise exception 'Unexpected tutor grading function; no changes applied.'; end if;
 execute replace(definition,previous,replacement);
end;
$migration$;
create or replace function public.curated_learning_version() returns integer language sql stable set search_path = '' as $$select 1;$$;
revoke all on function public.curated_learning_version() from public, anon;
grant execute on function public.curated_learning_version() to authenticated;
commit;
