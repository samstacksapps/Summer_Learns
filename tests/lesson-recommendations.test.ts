import test from 'node:test';
import assert from 'node:assert/strict';
import {recommendLessons} from '../lib/lesson-recommendations.ts';
import {createTutorPlan,currentTutorItem,initialTutorState,publicTutorItem} from '../lib/tutor-content.ts';
import type {Attempt} from '../lib/assessment.ts';
const answer=(overrides:Partial<Attempt>={}):Attempt=>({itemId:'fixture',skillId:'maths-y1-add-within-20',sessionId:'baseline',correct:false,assisted:false,likelyGuess:false,responseMs:5000,createdAt:'2026-10-01',yearLevel:1,sessionKind:'baseline',...overrides});
test('a tricky Year 1 answer prioritises that topic and provides Year 1 entry',()=>{
 const recommendations=recommendLessons([answer()]);assert.equal(recommendations[0].topicId,'addition');assert.equal(recommendations[0].yearLevel,1);
 const plan=createTutorPlan('maths','focus-fixture',recommendations[0]);assert.equal(plan.items.length,5);assert.equal(currentTutorItem(plan,initialTutorState())?.skillId,'maths-y1-add-within-20');
 assert.ok(!JSON.stringify(publicTutorItem(plan.items[0].year1)).includes('acceptedAnswers'));
});
test('helped, guessed and ungraded answers leave a skill unchecked',()=>{
 for(const evidence of [answer({assisted:true}),answer({likelyGuess:true}),answer({correct:null})]){
  const recommendation=recommendLessons([evidence]).find(r=>r.topicId==='addition')!;assert.equal(recommendation.independentAnswers,0);assert.match(recommendation.reason,/still need to check/);
 }
});
test('two recent independent successes update the recommendation without mutating baseline',()=>{
 const baseline=answer(),snapshot=JSON.stringify(baseline);
 const recommendations=recommendLessons([baseline,answer({correct:true,sessionKind:'learning',createdAt:'2026-10-02'}),answer({correct:true,sessionKind:'learning',createdAt:'2026-10-03'})]);
 const next=recommendations.find(r=>r.topicId==='addition')!;assert.equal(next.yearLevel,2);assert.match(next.reason,/Build on/);assert.equal(JSON.stringify(baseline),snapshot);
});
test('every focus produces five gradeable questions with unique IDs and preserves fallback',()=>{
 for(let seed=0;seed<30;seed++)for(const focus of recommendLessons([]))for(const yearLevel of [1,2] as const){
  const plan=createTutorPlan(focus.subject,String(seed),{...focus,yearLevel});assert.equal(plan.items.length,5);
  assert.equal(new Set(plan.items.map(s=>s.year2.id)).size,5);
  assert.equal(currentTutorItem(plan,initialTutorState())?.yearLevel,yearLevel);
  assert.equal(currentTutorItem(plan,{...initialTutorState(),incorrectStreak:2})?.yearLevel,1);
  if(focus.subject==='english')assert.equal(new Set(plan.items.slice(0,3).map(s=>s.year2.prompt)).size,3);
 }
});
