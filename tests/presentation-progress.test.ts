import test from 'node:test';
import assert from 'node:assert/strict';
import { warmupProgress, completionProgress } from '../lib/presentation-progress';
import type { history } from '../lib/progress';

type History = Awaited<ReturnType<typeof history>>;
const initial = (): History => ({ runs: [], sessions: [], attempts: [], activities: [] });
test('presentation offers the existing first section without starting an assessment', () => {
  const h = initial();
  const display = warmupProgress(h, false);
  assert.deepEqual(display.parts.filter(p => p.available).map(p => p.part), ['maths']);
  assert.equal(display.percent, 0);
  assert.equal(h.runs.length, 0);
});
test('saved progress counts stopped and resumed sessions and unlocks only the next part', () => {
  const h = initial();
  h.runs.push({id:'run',kind:'baseline',status:'in_progress',started_at:'2026-10-01',completed_at:null});
  h.sessions.push(...(['old','new'] as const).map((id, i) => ({id,assessment_id:'run',owner_id:'parent',part:'maths' as const,status:i?'completed':'stopped',started_at:'2026-10-01',completed_at:'2026-10-01'})));
  h.attempts.push({session_id:'old'},{session_id:'new'},{session_id:'other-family'});
  const original = JSON.stringify(h);
  const display = warmupProgress(h, false);
  assert.equal(display.parts[0].answered, 2);
  assert.equal(display.parts[0].completed, true);
  assert.equal(display.percent, 33);
  assert.deepEqual(display.parts.filter(p => p.available).map(p => p.part), ['english']);
  assert.equal(JSON.stringify(h), original);
});
test('completed baseline stays complete until follow-up is due; due check starts from zero', () => {
  const h = initial();
  h.runs.push({id:'baseline',kind:'baseline',status:'completed',started_at:'2026-10-01',completed_at:'2026-10-01'});
  h.sessions.push(...(['maths','english','reading'] as const).map(part=>({id:part,assessment_id:'baseline',owner_id:'parent',part,status:'completed',started_at:'2026-10-01',completed_at:'2026-10-01'})));
  const waiting = warmupProgress(h, false);
  assert.equal(waiting.percent, 100);
  assert.equal(waiting.parts.some(p => p.available), false);
  const due = warmupProgress(h, true);
  assert.equal(due.kind, 'followup');
  assert.equal(due.percent, 0);
  assert.deepEqual(due.parts.filter(p => p.available).map(p => p.part), ['maths']);
});
test('completion displays only existing independent marks, excluding help, guesses and skipped answers', () => {
  const h = initial();
  h.sessions.push({id:'session',assessment_id:'run',owner_id:'parent',part:'maths',status:'completed',started_at:'2026-10-01',completed_at:'2026-10-01'});
  h.attempts.push(...[{correct:true,skill_id:'count'},{correct:false},{correct:true,assisted:true},{correct:true,likely_guess:true},{correct:null}].map(a=>({...a,session_id:'session'})),{session_id:'elsewhere',correct:true});
  const display = completionProgress(h,'run','maths');
  assert.equal(display.savedAnswers,5);
  assert.equal(display.correct,1);
  assert.equal(display.independentAnswers,2);
  assert.equal(display.strongSkillId,'count');
});
test('completion never converts a reading estimate into a child-facing grade', () => {
  const h = initial();
  h.sessions.push({id:'session',assessment_id:'run',owner_id:'parent',part:'reading',status:'completed',started_at:'2026-10-01',completed_at:'2026-10-01'});
  h.attempts.push({session_id:'session',correct:null,reading_estimate:100});
  const display = completionProgress(h,'run','reading');
  assert.equal(display.savedAnswers,1);
  assert.equal(display.independentAnswers,0);
  assert.equal(display.correct,0);
  assert.equal(display.strongSkillId,undefined);
});
