import test from 'node:test';
import assert from 'node:assert/strict';
import {savedAttempt,needsCompletionRepair,savedFeedback,type RecoveryHistory} from '../lib/recovery-policy.ts';
import type {SessionRow} from '../lib/progress.ts';
const run={id:'run',kind:'baseline' as const,status:'in_progress',started_at:'2026-10-06T00:00:00Z',completed_at:null};
const session=(part:SessionRow['part'],status='completed'):SessionRow=>({id:part,assessment_id:run.id,owner_id:'owner',part,status,started_at:run.started_at,completed_at:status==='in_progress'?null:run.started_at});
const h=():RecoveryHistory=>({runs:[run],sessions:[session('maths','in_progress')],attempts:[{owner_id:'owner',assessment_id:run.id,session_id:'maths',item_id:'item',correct:true}]});
test('completion repair needs all three saved completed parts and an unfinished run',()=>{
 const finished=[session('maths'),session('english'),session('reading')];
 assert.equal(needsCompletionRepair(run,finished),true);
 assert.equal(needsCompletionRepair(run,finished.slice(0,2)),false);
 assert.equal(needsCompletionRepair(run,[...finished.slice(0,2),session('reading','stopped')]),false);
 assert.equal(needsCompletionRepair({...run,status:'completed'},finished),false);
 assert.equal(needsCompletionRepair(run,finished.map(s=>({...s,assessment_id:'other'}))),false);
});
test('replayed evidence must match owner, original session, assessment and item',()=>{
 assert.equal(savedAttempt(h(),'owner','maths','item')?.attempt.correct,true);
 assert.equal(savedAttempt(h(),'other-owner','maths','item'),undefined);
 assert.equal(savedAttempt(h(),'owner','english','item'),undefined);
 assert.equal(savedAttempt(h(),'owner','maths','different'),undefined);
 const wrong=h();wrong.attempts[0].assessment_id='other';assert.equal(savedAttempt(wrong,'owner','maths','item'),undefined);
 const other=h();other.attempts[0].owner_id='other-owner';assert.equal(savedAttempt(other,'owner','maths','item'),undefined);
});
test('saved answers stay recoverable after session/run completion without creating new evidence',()=>{
 const state=h();state.sessions[0].status='completed';state.runs[0]={...run,status:'completed'};
 const before=JSON.stringify(state);assert.ok(savedAttempt(state,'owner','maths','item'));
 assert.equal(JSON.stringify(state),before);
 state.sessions[0].status='stopped';assert.ok(savedAttempt(state,'owner','maths','item'));
});
test('retry feedback reflects the original save, including ungraded reading skips',()=>{
 assert.equal(savedFeedback({correct:null}),'skip');
 assert.equal(savedFeedback({correct:false,likely_guess:true}),'rush');
 assert.equal(savedFeedback({correct:false}),'try');
 assert.equal(savedFeedback({correct:true}),'good');
});
