-- Run against a disposable Supabase-compatible PostgreSQL database AFTER
-- schema.sql and migrations/20261006_conversational_tutor.sql. Never production.
-- Requires a superuser test connection and auth.uid() backed by JWT subject GUC.
-- All fixture rows roll back. psql -v ON_ERROR_STOP=1 -f tests/tutor-schema.sql
begin;
create function pg_temp.assert_true(p_ok boolean,p_label text) returns void language plpgsql as $$
begin
  if p_ok is distinct from true then raise exception 'FAIL: %',p_label; end if;
  raise notice 'PASS: %',p_label;
end;
$$;
create function pg_temp.expect_error(p_sql text,p_state text,p_message text,p_label text)
returns void language plpgsql as $$
declare v_caught boolean := false;
begin
  begin execute p_sql;
  exception when others then
    if sqlstate <> p_state or (p_message is not null and position(p_message in sqlerrm) = 0) then
      raise exception 'FAIL: % (got %: %)',p_label,sqlstate,sqlerrm;
    end if;
    v_caught := true;
  end;
  if not v_caught then raise exception 'FAIL: % (no error)',p_label; end if;
  raise notice 'PASS: %',p_label;
end;
$$;
create function pg_temp.state(p_index integer,p_correct integer,p_misses integer default 0,p_helped boolean default false)
returns jsonb language sql as $$ select jsonb_build_object('index',p_index,'correct',p_correct,
  'incorrectStreak',p_misses,'helped',p_helped,'observations',jsonb_build_array('tens-and-ones')) $$;
create function pg_temp.reply(p_session uuid,p_revision integer,p_state jsonb,p_complete boolean default false,p_stop boolean default false)
returns jsonb language sql as $$ select jsonb_build_object('sessionId',p_session,'revision',p_revision,
  'subject','maths','item',null,'message','Tell me how you worked it out.',
  'progress',jsonb_build_object('answered',(p_state->>'index')::int,'correct',(p_state->>'correct')::int,'total',5),
  'complete',p_complete,'stopped',p_stop) $$;
create function pg_temp.attempt(p_index integer,p_correct boolean default true,p_assisted boolean default false,p_year integer default 2)
returns jsonb language sql as $$ select jsonb_build_object('item_id','item-'||p_index||'-y'||p_year,
  'skill_id','skill-'||p_index,'year_level',p_year,'correct',p_correct,'assisted',p_assisted,'response_ms',1200) $$;
create function pg_temp.plan() returns jsonb language sql as $$
  select jsonb_build_object('version',1,'subject','maths','items',jsonb_agg(jsonb_build_object(
    'year1',jsonb_build_object('id','item-'||i||'-y1','skillId','skill-'||i,'subject','maths','yearLevel',1,
      'kind','number','prompt','What is 2 plus 3?','acceptedAnswers',jsonb_build_array('5'),'teachingNote','Count on.'),
    'year2',jsonb_build_object('id','item-'||i||'-y2','skillId','skill-'||i,'subject','maths','yearLevel',2,
      'kind','number','prompt','What is 12 plus 13?','acceptedAnswers',jsonb_build_array('25'),'teachingNote','Use tens and ones.')
  ))) from generate_series(0,4) i;
$$;

insert into auth.users(id) values
  ('10000000-0000-4000-8000-000000000001'),('10000000-0000-4000-8000-000000000002'),
  ('10000000-0000-4000-8000-000000000003'),('10000000-0000-4000-8000-000000000004');
-- Record immutable starting evidence to prove the daily flow doesn't overwrite it.
insert into public.assessments(id,owner_id,kind,status,completed_at) values
  ('30000000-0000-4000-8000-000000000001','10000000-0000-4000-8000-000000000001','baseline','completed',now());
create temp table baseline_before as select to_jsonb(a) as data from public.assessments a
  where id = '30000000-0000-4000-8000-000000000001';

set local role authenticated;
select set_config('request.jwt.claim.sub','10000000-0000-4000-8000-000000000001',true);
insert into public.learning_sessions(id,owner_id,subject,status,plan,tutor_state) values
  ('20000000-0000-4000-8000-000000000001',auth.uid(),'maths','in_progress',pg_temp.plan(),pg_temp.state(0,0));
select pg_temp.expect_error($q$insert into public.learning_sessions(owner_id,status,plan,tutor_state)
  values(auth.uid(),'in_progress',pg_temp.plan(),pg_temp.state(0,0))$q$,'23505',null,'only one active daily lesson');
select pg_temp.expect_error($q$insert into public.learning_sessions(owner_id,status,plan,tutor_state)
  values(auth.uid(),'in_progress',null,pg_temp.state(0,0))$q$,'23514',null,'an active lesson needs a private plan');
select pg_temp.expect_error($q$insert into public.learning_sessions(owner_id,status,plan,tutor_state)
  values(auth.uid(),'in_progress','{}'::jsonb,pg_temp.state(0,0))$q$,'23514',null,'a malformed plan cannot bypass nullable CHECK logic');
select pg_temp.expect_error($q$update public.learning_sessions set revision=99$q$,'42501',null,'direct lesson mutation denied');
select pg_temp.expect_error($q$insert into public.learning_attempts(owner_id,session_id,item_id,skill_id,year_level,correct,response_ms)
  values(auth.uid(),'20000000-0000-4000-8000-000000000001','forged','forged',2,true,0)$q$,'42501',null,'direct learning evidence write denied');
select pg_temp.expect_error($q$insert into public.tutor_turns(request_id,owner_id,session_id,expected_revision,action)
  values(gen_random_uuid(),auth.uid(),'20000000-0000-4000-8000-000000000001',0,'start')$q$,'42501',null,'direct receipt write denied');
select pg_temp.assert_true(public.claim_tutor_turn('20000000-0000-4000-8000-000000000001',
  '40000000-0000-4000-8000-000000000001',0,'start',3)->>'claimed' = 'true','owned start claim succeeds');
select pg_temp.expect_error($q$select public.claim_tutor_turn('20000000-0000-4000-8000-000000000001',
  '40000000-0000-4000-8000-000000000001',0,'start',3)$q$,'P0001','TUTOR_BUSY','same pending request cannot call provider twice');
select pg_temp.expect_error($q$select public.claim_tutor_turn('20000000-0000-4000-8000-000000000001',
  '40000000-0000-4000-8000-000000000002',0,'message',3)$q$,'P0001','TUTOR_BUSY','a second tab cannot claim concurrently');
select pg_temp.assert_true((select sum(amount_cents)=3 from public.voice_usage),'busy request does not reserve twice');
select public.commit_tutor_turn('20000000-0000-4000-8000-000000000001','40000000-0000-4000-8000-000000000001',
  pg_temp.state(0,0),pg_temp.reply('20000000-0000-4000-8000-000000000001',1,pg_temp.state(0,0)),null,false,false);
select pg_temp.assert_true(public.claim_tutor_turn('20000000-0000-4000-8000-000000000001',
  '40000000-0000-4000-8000-000000000001',0,'start',3)->'response'->>'revision'='1','completed request returns its exact receipt');
select pg_temp.assert_true((select sum(amount_cents)=3 from public.voice_usage),'receipt replay retains a single reservation');
select public.claim_tutor_turn('20000000-0000-4000-8000-000000000001','40000000-0000-4000-8000-000000000002',1,'message',3);
select pg_temp.expect_error($q$select public.commit_tutor_turn('20000000-0000-4000-8000-000000000001',
  '40000000-0000-4000-8000-000000000002',jsonb_set(pg_temp.state(0,0,0,true),'{observations}','["a private child transcript"]'),
  pg_temp.reply('20000000-0000-4000-8000-000000000001',2,pg_temp.state(0,0,0,true)),null,false,false)$q$,
  '23514','Invalid tutor result','long-term memory accepts observation codes only');
select public.commit_tutor_turn('20000000-0000-4000-8000-000000000001','40000000-0000-4000-8000-000000000002',
  pg_temp.state(0,0,0,true),pg_temp.reply('20000000-0000-4000-8000-000000000001',2,pg_temp.state(0,0,0,true)),null,false,false);
select public.claim_tutor_turn('20000000-0000-4000-8000-000000000001','40000000-0000-4000-8000-000000000003',2,'respond',3);
select pg_temp.expect_error($q$select public.commit_tutor_turn('20000000-0000-4000-8000-000000000001',
  '40000000-0000-4000-8000-000000000003',pg_temp.state(1,1),pg_temp.reply('20000000-0000-4000-8000-000000000001',3,pg_temp.state(1,1)),
  pg_temp.attempt(4,true,true),false,false)$q$,'23514','planned question','evidence cannot be attached to a different question');
select public.commit_tutor_turn('20000000-0000-4000-8000-000000000001','40000000-0000-4000-8000-000000000003',
  pg_temp.state(1,1),pg_temp.reply('20000000-0000-4000-8000-000000000001',3,pg_temp.state(1,1)),pg_temp.attempt(0,true,true),false,false);
select public.commit_tutor_turn('20000000-0000-4000-8000-000000000001','40000000-0000-4000-8000-000000000003',
  pg_temp.state(1,1),pg_temp.reply('20000000-0000-4000-8000-000000000001',3,pg_temp.state(1,1)),pg_temp.attempt(0,true,true),false,false);
select pg_temp.assert_true((select count(*)=1 from public.learning_attempts),'duplicate commit cannot duplicate evidence');
select pg_temp.expect_error($q$select public.claim_tutor_turn('20000000-0000-4000-8000-000000000001',
  gen_random_uuid(),1,'respond',3)$q$,'P0001','TUTOR_STALE','stale response is rejected');
select public.claim_tutor_turn('20000000-0000-4000-8000-000000000001','40000000-0000-4000-8000-000000000004',3,'respond',3);
select pg_temp.assert_true(public.claim_tutor_turn('20000000-0000-4000-8000-000000000001',
  '40000000-0000-4000-8000-000000000005',0,'stop',0)->>'revision'='3','stop cancels pending work even with an old revision');
select public.commit_tutor_turn('20000000-0000-4000-8000-000000000001','40000000-0000-4000-8000-000000000005',
  pg_temp.state(1,1),pg_temp.reply('20000000-0000-4000-8000-000000000001',4,pg_temp.state(1,1),false,true),null,false,true);
select pg_temp.expect_error($q$select public.commit_tutor_turn('20000000-0000-4000-8000-000000000001',
  '40000000-0000-4000-8000-000000000004',pg_temp.state(2,2),pg_temp.reply('20000000-0000-4000-8000-000000000001',4,pg_temp.state(2,2)),
  pg_temp.attempt(1),false,false)$q$,'P0001','TUTOR_EXPIRED','a late provider response cannot undo stop');
select pg_temp.assert_true((select status='stopped' and completed_at is null from public.learning_sessions
  where id='20000000-0000-4000-8000-000000000001'),'stopped lesson does not start the four-week clock');

-- A full lesson gives exactly five pieces of independent daily evidence.
insert into public.learning_sessions(id,owner_id,subject,status,plan,tutor_state) values
  ('20000000-0000-4000-8000-000000000002',auth.uid(),'maths','in_progress',pg_temp.plan(),pg_temp.state(0,0));
do $test$
declare v_i integer; v_request uuid;
begin
  for v_i in 0..4 loop
    v_request := gen_random_uuid();
    perform public.claim_tutor_turn('20000000-0000-4000-8000-000000000002',v_request,v_i,'respond',3);
    perform public.commit_tutor_turn('20000000-0000-4000-8000-000000000002',v_request,pg_temp.state(v_i+1,v_i+1),
      pg_temp.reply('20000000-0000-4000-8000-000000000002',v_i+1,pg_temp.state(v_i+1,v_i+1),v_i=4),pg_temp.attempt(v_i),v_i=4,false);
  end loop;
end;
$test$;
select pg_temp.assert_true((select count(*)=5 from public.learning_attempts
  where session_id='20000000-0000-4000-8000-000000000002'),'full daily lesson saves all five grades');
select pg_temp.assert_true((select status='completed' and completed_at >= started_at and summary->>'correct'='5'
  from public.learning_sessions where id='20000000-0000-4000-8000-000000000002'),'completion is atomic with evidence and clock timestamp');
select pg_temp.assert_true(public.claim_tutor_turn('20000000-0000-4000-8000-000000000002',
  (select request_id from public.tutor_turns where session_id='20000000-0000-4000-8000-000000000002' and response->>'complete'='true'),
  4,'respond',3)->'response'->>'complete'='true','retry after completion returns receipt before inactive check');

select set_config('request.jwt.claim.sub','10000000-0000-4000-8000-000000000002',true);
select pg_temp.assert_true((select count(*)=0 from public.learning_sessions),'another parent cannot read sessions');
select pg_temp.assert_true((select count(*)=0 from public.learning_attempts),'another parent cannot read grades');
select pg_temp.assert_true((select count(*)=0 from public.tutor_turns),'another parent cannot read reply receipts');
select pg_temp.expect_error($q$select public.claim_tutor_turn('20000000-0000-4000-8000-000000000002',
  gen_random_uuid(),5,'message',3)$q$,'42501',null,'another parent cannot claim a turn');
select pg_temp.expect_error($q$select public.fail_tutor_turn('20000000-0000-4000-8000-000000000002',gen_random_uuid())$q$,
  '42501',null,'another parent cannot fail a turn');
insert into public.learning_sessions(id,owner_id,subject,status,plan,tutor_state) values
  ('20000000-0000-4000-8000-000000000003',auth.uid(),'maths','in_progress',pg_temp.plan(),pg_temp.state(0,0));
select public.claim_tutor_turn('20000000-0000-4000-8000-000000000003','40000000-0000-4000-8000-000000000006',0,'start',3);
select public.fail_tutor_turn('20000000-0000-4000-8000-000000000003','40000000-0000-4000-8000-000000000006');
select pg_temp.assert_true((select sum(amount_cents)=3 from public.voice_usage),'failed provider call retains conservative spend reservation');
select pg_temp.assert_true(public.claim_tutor_turn('20000000-0000-4000-8000-000000000003',
  '40000000-0000-4000-8000-000000000006',0,'start',3)->>'claimed'='true','failed request can retry with its original request ID');
select pg_temp.assert_true((select sum(amount_cents)=6 from public.voice_usage),'failed retry reserves another provider call without erasing the first');
select public.commit_tutor_turn('20000000-0000-4000-8000-000000000003','40000000-0000-4000-8000-000000000006',
  pg_temp.state(0,0),pg_temp.reply('20000000-0000-4000-8000-000000000003',1,pg_temp.state(0,0)),null,false,false);
select pg_temp.assert_true(public.claim_tutor_turn('20000000-0000-4000-8000-000000000003',
  '40000000-0000-4000-8000-000000000006',0,'start',3)->'response'->>'revision'='1',
  'lost HTTP response retries return the saved reply');
select pg_temp.assert_true((select sum(amount_cents)=6 from public.voice_usage),'lost HTTP response replay reserves nothing extra');
select public.claim_tutor_turn('20000000-0000-4000-8000-000000000003','40000000-0000-4000-8000-000000000007',1,'start',3);
reset role;
update public.tutor_turns set pending_until=now()-interval '1 second'
  where request_id='40000000-0000-4000-8000-000000000007';
set local role authenticated;
select pg_temp.assert_true(public.claim_tutor_turn('20000000-0000-4000-8000-000000000003',
  '40000000-0000-4000-8000-000000000007',1,'start',3)->>'claimed'='true','expired pending request can retry with its original request ID');
select pg_temp.assert_true((select sum(amount_cents)=12 from public.voice_usage),'expired pending retry keeps both spend reservations');
select public.fail_tutor_turn('20000000-0000-4000-8000-000000000003','40000000-0000-4000-8000-000000000007');
select public.claim_tutor_turn('20000000-0000-4000-8000-000000000003','40000000-0000-4000-8000-000000000008',1,'start',3);
select public.commit_tutor_turn('20000000-0000-4000-8000-000000000003','40000000-0000-4000-8000-000000000008',
  pg_temp.state(0,0),pg_temp.reply('20000000-0000-4000-8000-000000000003',2,pg_temp.state(0,0)),null,false,false);
select pg_temp.expect_error($q$select public.claim_tutor_turn('20000000-0000-4000-8000-000000000003',
  '40000000-0000-4000-8000-000000000007',1,'start',3)$q$,'P0001','TUTOR_STALE',
  'failed request cannot retry after another turn changed the lesson');
reset role;
update public.tutor_turns set expires_at=now()-interval '1 second'
  where request_id='40000000-0000-4000-8000-000000000006';
set local role authenticated;
select pg_temp.assert_true((select count(*)=0 from public.tutor_turns
  where request_id='40000000-0000-4000-8000-000000000006'),'expired replies are hidden even before purge');
-- Fill all but two cents of the shared AI/voice cap using existing reservation RPC.
select set_config('request.jwt.claim.sub','10000000-0000-4000-8000-000000000003',true);
do $budget$
begin
  for i in 1..7 loop perform public.reserve_voice_spend('tts',200,gen_random_uuid(),1500); end loop;
  perform public.reserve_voice_spend('transcription',98,gen_random_uuid(),1500);
end;
$budget$;
insert into public.learning_sessions(id,owner_id,subject,status,plan,tutor_state) values
  ('20000000-0000-4000-8000-000000000004',auth.uid(),'maths','in_progress',pg_temp.plan(),pg_temp.state(0,0));
select pg_temp.expect_error($q$select public.claim_tutor_turn('20000000-0000-4000-8000-000000000004',
  gen_random_uuid(),0,'start',3)$q$,'P0001','TUTOR_BUDGET','tutor and voice share the same monthly cap');
select pg_temp.assert_true((select sum(amount_cents)=1498 from public.voice_usage),'failed over-budget claim spends nothing');
select pg_temp.assert_true((select count(*)=0 from public.tutor_turns),'failed over-budget claim creates no pending receipt');

-- Talking about the answer just graded must not mark the next item as helped.
select set_config('request.jwt.claim.sub','10000000-0000-4000-8000-000000000004',true);
insert into public.learning_sessions(id,owner_id,subject,status,plan,tutor_state) values
  ('20000000-0000-4000-8000-000000000005',auth.uid(),'maths','in_progress',pg_temp.plan(),pg_temp.state(0,0));
select public.claim_tutor_turn('20000000-0000-4000-8000-000000000005','50000000-0000-4000-8000-000000000001',0,'message',3);
select public.commit_tutor_turn('20000000-0000-4000-8000-000000000005','50000000-0000-4000-8000-000000000001',
  pg_temp.state(0,0),pg_temp.reply('20000000-0000-4000-8000-000000000005',1,pg_temp.state(0,0)),null,false,false);
select pg_temp.assert_true((select tutor_state->>'helped'='false' from public.learning_sessions
  where id='20000000-0000-4000-8000-000000000005'),'discussion of the previous answer can preserve the next item as independent');
select public.claim_tutor_turn('20000000-0000-4000-8000-000000000005','50000000-0000-4000-8000-000000000002',1,'message',3);
select public.commit_tutor_turn('20000000-0000-4000-8000-000000000005','50000000-0000-4000-8000-000000000002',
  pg_temp.state(0,0,0,true),pg_temp.reply('20000000-0000-4000-8000-000000000005',2,pg_temp.state(0,0,0,true)),null,false,false);
select pg_temp.assert_true((select tutor_state->>'helped'='true' from public.learning_sessions
  where id='20000000-0000-4000-8000-000000000005'),'help on the current question is recorded');
select public.claim_tutor_turn('20000000-0000-4000-8000-000000000005','50000000-0000-4000-8000-000000000003',2,'message',3);
select pg_temp.expect_error($q$select public.commit_tutor_turn('20000000-0000-4000-8000-000000000005',
  '50000000-0000-4000-8000-000000000003',pg_temp.state(0,0),
  pg_temp.reply('20000000-0000-4000-8000-000000000005',3,pg_temp.state(0,0)),null,false,false)$q$,
  '23514',null,'a later chat message cannot erase help already received');
select public.fail_tutor_turn('20000000-0000-4000-8000-000000000005','50000000-0000-4000-8000-000000000003');

set local role anon;
select pg_temp.expect_error('select * from public.learning_sessions','42501',null,'anonymous lesson access denied');
select pg_temp.expect_error('select * from public.learning_attempts','42501',null,'anonymous grade access denied');
select pg_temp.expect_error('select * from public.tutor_turns','42501',null,'anonymous receipt access denied');
select pg_temp.expect_error($q$select public.claim_tutor_turn('20000000-0000-4000-8000-000000000004',
  gen_random_uuid(),0,'start',3)$q$,'42501',null,'anonymous RPC execution denied');
reset role;
select pg_temp.assert_true((select to_jsonb(a)=b.data from public.assessments a cross join baseline_before b
  where a.id='30000000-0000-4000-8000-000000000001'),'daily learning leaves the starting assessment unchanged');
rollback;
