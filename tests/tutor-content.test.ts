import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {advanceTutorState,createTutorPlan,currentTutorItem,gradeTutorAnswer,initialTutorState,publicTutorItem} from '../lib/tutor-content.ts';
test('daily Years 1–2 content starts at Year 2 and offers Year 1 after two misses',()=>{
 const plan=createTutorPlan('maths','adaptive-fixture');let state=initialTutorState();
 assert.equal(currentTutorItem(plan,state)?.yearLevel,2);state=advanceTutorState(state,false);assert.equal(currentTutorItem(plan,state)?.yearLevel,2);
 state=advanceTutorState(state,false);assert.equal(currentTutorItem(plan,state)?.yearLevel,1);
 state=advanceTutorState(state,true);assert.equal(currentTutorItem(plan,state)?.yearLevel,2);
});
test('practice never exposes answer keys or reuses authored assessment questions',()=>{
 const assessment=JSON.parse(readFileSync('data/skill-map.json','utf8'));
 const prompts=new Set(assessment.skills.flatMap((skill:{exampleItems:{prompt:string}[]})=>skill.exampleItems.map(item=>item.prompt)));
 for(const subject of ['maths','english'] as const)for(let seed=0;seed<50;seed++)for(const slot of createTutorPlan(subject,String(seed)).items)for(const item of [slot.year1,slot.year2]){
  assert.ok(item.id.startsWith(`daily-${subject}-`));assert.ok(!prompts.has(item.prompt),item.prompt);assert.ok([1,2].includes(item.yearLevel));
  const shown=publicTutorItem(item);assert.ok(!Object.hasOwn(shown,'acceptedAnswers'));assert.ok(!Object.hasOwn(shown,'teachingNote'));
  assert.ok(gradeTutorAnswer(item,item.acceptedAnswers[0]));if(item.choices)assert.ok(item.choices.includes(item.acceptedAnswers[0]));
 }
});
test('English answer positions vary and remain stable when a lesson is resumed',()=>{
 const positions=new Set<number>();for(let seed=0;seed<60;seed++)for(const slot of createTutorPlan('english',String(seed)).items){
  const item=slot.year2;const shown=publicTutorItem(item);positions.add(shown.choices!.indexOf(item.acceptedAnswers[0]));assert.deepEqual(publicTutorItem(item),shown);
 }
 assert.deepEqual([...positions].sort(),[0,1,2]);
});
test('lesson plans rotate topics and grading accepts equivalent numbers without evaluating expressions',()=>{
 const topics=new Set<string>();for(let seed=0;seed<100;seed++){
  const plan=createTutorPlan('maths',String(seed));assert.equal(plan.items.length,5);assert.equal(new Set(plan.items.map(slot=>slot.year2.skillId)).size,5);
  for(const slot of plan.items){topics.add(slot.year2.skillId);assert.ok(gradeTutorAnswer(slot.year2,slot.year2.acceptedAnswers[0]+'.0'));assert.equal(gradeTutorAnswer(slot.year2,'1+2'),false);}
 }
 assert.ok(topics.size>=12);
});
test('capitalisation questions distinguish the incorrect case-sensitive choice',()=>{
 let checked=0;for(let seed=0;seed<100;seed++)for(const slot of createTutorPlan('english',String(seed)).items)for(const item of [slot.year1,slot.year2]){
  for(const choice of item.choices??[])if(choice!==item.acceptedAnswers[0]&&choice.toLowerCase()===item.acceptedAnswers[0].toLowerCase()){assert.equal(gradeTutorAnswer(item,choice),false);checked++;}
 }
 assert.ok(checked>0);
});
