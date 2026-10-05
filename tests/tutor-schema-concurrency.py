"""Real two-connection tutor races. Use only a disposable PostgreSQL database.

Load the base schema and tutor migration first; set PGHOST/PGPORT/PGUSER and
PSQL_BIN if psql is outside PATH. Fixtures are deleted even when a check fails.
"""
import concurrent.futures
import json
import os
import subprocess
import uuid

PSQL = os.environ.get('PSQL_BIN', 'psql')
BASE = [PSQL, '-X', '-A', '-t', '-v', 'ON_ERROR_STOP=1', '-d', os.environ.get('PGDATABASE', 'postgres')]
OWNER = str(uuid.uuid4())
SESSION = str(uuid.uuid4())
START = str(uuid.uuid4())
ANSWER = str(uuid.uuid4())
STOP = str(uuid.uuid4())


def sql_json(value):
    return "'" + json.dumps(value).replace("'", "''") + "'::jsonb"


def run(sql, check=True):
    result = subprocess.run(BASE + ['-c', sql], capture_output=True, text=True)
    if check and result.returncode:
        raise AssertionError(result.stderr)
    return result


def owned(sql):
    return f"begin; set local role authenticated; select set_config('request.jwt.claim.sub','{OWNER}',true); {sql}; commit;"


def parallel(sql_a, sql_b):
    with concurrent.futures.ThreadPoolExecutor(max_workers=2) as pool:
        first = pool.submit(run, owned(sql_a), False)
        second = pool.submit(run, owned(sql_b), False)
        return first.result(), second.result()


def state(index=0, correct=0):
    return {'index': index, 'correct': correct, 'incorrectStreak': 0, 'helped': False, 'observations': []}


def reply(revision, tutor_state, stopped=False):
    return {'sessionId': SESSION, 'revision': revision, 'subject': 'maths', 'item': None,
            'message': 'Explain your thinking.', 'complete': False, 'stopped': stopped,
            'progress': {'answered': tutor_state['index'], 'correct': tutor_state['correct'], 'total': 5}}


def item(index, year):
    return {'id': f'item-{index}-y{year}', 'skillId': f'skill-{index}', 'subject': 'maths',
            'yearLevel': year, 'kind': 'number', 'prompt': 'What is 12 plus 13?',
            'acceptedAnswers': ['25'], 'teachingNote': 'Use tens and ones.'}


plan = {'version': 1, 'subject': 'maths', 'items': [{'year1': item(i, 1), 'year2': item(i, 2)} for i in range(5)]}
try:
    run(f"insert into auth.users(id) values('{OWNER}'); insert into public.learning_sessions(id,owner_id,subject,status,plan) "
        f"values('{SESSION}','{OWNER}','maths','in_progress',{sql_json(plan)});")
    # Both requests contend for the same session row. The loser sees the receipt
    # left by the winner, rather than reserving a second provider call.
    claim_a = f"select public.claim_tutor_turn('{SESSION}','{START}',0,'start',3); select pg_sleep(0.15)"
    claim_b = f"select public.claim_tutor_turn('{SESSION}','{str(uuid.uuid4())}',0,'start',3); select pg_sleep(0.15)"
    results = parallel(claim_a, claim_b)
    assert sorted(result.returncode for result in results) == [0, 1] or sorted(result.returncode for result in results) == [0, 3]
    assert 'TUTOR_BUSY' in ''.join(result.stderr for result in results)
    assert run(f"select count(*)||':'||sum(amount_cents) from public.voice_usage where owner_id='{OWNER}'").stdout.strip() == '1:3'
    pending_id = run(f"select request_id from public.tutor_turns where session_id='{SESSION}' and status='pending'").stdout.strip()
    run(owned(f"select public.commit_tutor_turn('{SESSION}','{pending_id}',{sql_json(state())},{sql_json(reply(1,state()))},null,false,false)"))
    print('PASS: concurrent claims allow one provider reservation')

    run(owned(f"select public.claim_tutor_turn('{SESSION}','{ANSWER}',1,'respond',3)"))
    attempt = {'item_id': 'item-0-y2', 'skill_id': 'skill-0', 'year_level': 2, 'correct': True, 'assisted': False, 'response_ms': 1500}
    commit_answer = f"select public.commit_tutor_turn('{SESSION}','{ANSWER}',{sql_json(state(1,1))},{sql_json(reply(2,state(1,1)))},{sql_json(attempt)},false,false)"
    # Stop computes its reply while holding the same row lock used by commit.
    stop_sql = f"""
      do $test$ declare claimed jsonb; current_state jsonb; stop_reply jsonb; begin
        claimed := public.claim_tutor_turn('{SESSION}','{STOP}',0,'stop',0);
        select tutor_state into current_state from public.learning_sessions where id='{SESSION}';
        stop_reply := jsonb_build_object('sessionId','{SESSION}','revision',(claimed->>'revision')::int+1,
          'subject','maths','item',null,'message','We can continue another time.','complete',false,'stopped',true,
          'progress',jsonb_build_object('answered',(current_state->>'index')::int,'correct',(current_state->>'correct')::int,'total',5));
        perform public.commit_tutor_turn('{SESSION}','{STOP}',current_state,stop_reply,null,false,true);
      end; $test$
    """
    results = parallel(commit_answer, stop_sql)
    assert results[1].returncode == 0, results[1].stderr
    if results[0].returncode:
        assert 'TUTOR_EXPIRED' in results[0].stderr, results[0].stderr
    assert run(f"select status||':'||(completed_at is null)::text from public.learning_sessions where id='{SESSION}'").stdout.strip() == 'stopped:true'
    assert int(run(f"select count(*) from public.learning_attempts where session_id='{SESSION}'").stdout.strip()) <= 1
    print('PASS: concurrent Stop and answer cannot resume or complete the lesson')

    # Leave exactly three cents, then contend between two voice reservations.
    # This exercises the shared monthly advisory lock used by tutor claims too.
    run(owned("do $budget$ declare remaining int; amount int; begin "
              "select 1497-coalesce(sum(amount_cents),0) into remaining from public.voice_usage where owner_id=auth.uid(); "
              "while remaining>0 loop amount:=least(remaining,200); "
              "perform public.reserve_voice_spend('transcription',amount,gen_random_uuid(),1500); remaining:=remaining-amount; end loop; end; $budget$"))
    reserve_a = f"select public.reserve_voice_spend('tts',3,'{str(uuid.uuid4())}',1500); select pg_sleep(0.15)"
    reserve_b = f"select public.reserve_voice_spend('tutor',3,'{str(uuid.uuid4())}',1500); select pg_sleep(0.15)"
    results = parallel(reserve_a, reserve_b)
    assert all(result.returncode == 0 for result in results)
    decisions = [next(line for line in result.stdout.splitlines() if line in ('t','f')) for result in results]
    assert sorted(decisions) == ['f', 't'], decisions
    assert run(f"select sum(amount_cents) from public.voice_usage where owner_id='{OWNER}'").stdout.strip() == '1500'
    print('PASS: concurrent tutor and speech reservations respect the shared cap')
finally:
    run(f"delete from auth.users where id='{OWNER}'")
