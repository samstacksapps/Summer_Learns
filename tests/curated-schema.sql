-- Disposable database only, after base, tutor, reset and curated migrations.
begin;
insert into auth.users(id) values('60000000-0000-4000-8000-000000000001');
insert into public.assessments(owner_id,kind,status,completed_at) values('60000000-0000-4000-8000-000000000001','baseline','completed',now());
insert into public.learning_sessions(id,owner_id,subject,status,plan,tutor_state)
select '60000000-0000-4000-8000-000000000002','60000000-0000-4000-8000-000000000001','maths','in_progress',jsonb_build_object('version',1,'subject','maths','items',jsonb_agg(jsonb_build_object('entryYear',1,'year1',jsonb_build_object('id','daily-one-'||i,'skillId','maths-y1-add-within-20'),'year2',jsonb_build_object('id','daily-two-'||i,'skillId','maths-y2-add-two-digits')))), '{"index":0,"correct":0,"incorrectStreak":0,"helped":false,"observations":[]}'::jsonb from generate_series(0,4) i;
set local role authenticated;
select set_config('request.jwt.claim.sub','60000000-0000-4000-8000-000000000001',true);
do $$
declare
 sid uuid := '60000000-0000-4000-8000-000000000002';
 rid uuid := '60000000-0000-4000-8000-000000000003';
 state jsonb := '{"index":1,"correct":1,"incorrectStreak":0,"helped":false,"observations":[]}';
 reply jsonb;
 rejected boolean := false;
begin
 reply:=jsonb_build_object('sessionId',sid,'revision',1,'subject','maths','item',null,'message','Let’s check the tens and ones.','progress',jsonb_build_object('answered',1,'total',5,'correct',1),'complete',false);
 perform public.claim_tutor_turn(sid,rid,0,'respond',3);
 begin
  perform public.commit_tutor_turn(sid,rid,state,reply,'{"item_id":"daily-two-0","skill_id":"maths-y2-add-two-digits","year_level":2,"correct":true,"assisted":false,"response_ms":5000}',false,false);
 exception when check_violation then rejected:=true;
 end;
 if not rejected then raise exception 'Year 2 substitution was accepted for a Year 1 entry.'; end if;
 perform public.commit_tutor_turn(sid,rid,state,reply,'{"item_id":"daily-one-0","skill_id":"maths-y1-add-within-20","year_level":1,"correct":true,"assisted":false,"response_ms":5000}',false,false);
 if (select count(*) from public.learning_attempts where session_id=sid and year_level=1)<>1 then raise exception 'Year 1 evidence did not save exactly once.'; end if;
 if (public.claim_tutor_turn(sid,rid,0,'respond',3)->'response'->>'revision')<>'1' then raise exception 'Replay changed.'; end if;
 if public.curated_learning_version()<>1 then raise exception 'Readiness probe failed.'; end if;
end; $$;
rollback;
