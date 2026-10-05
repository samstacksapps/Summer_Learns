import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import vm from 'node:vm';
import ts from 'typescript';
import map from '../data/skill-map.json';
import config from '../lib/config/assessment.json';
import * as assessment from '../lib/assessment';
import type {Item,Attempt,Skill} from '../lib/assessment';
import type {RunRow,SessionRow} from '../lib/progress';

const items=(map.skills as Skill[]).filter(skill=>!config.deferredAudioSkills.includes(skill.id)).flatMap(skill=>skill.exampleItems);
const module={exports:{} as {nextQuestion:typeof import('../lib/progress').nextQuestion}};
const code=ts.transpileModule(readFileSync(new URL('../lib/progress.ts',import.meta.url),'utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022,esModuleInterop:true}}).outputText;
vm.runInNewContext(code,{module,exports:module.exports,Date,Error,require:(name:string)=>{
 if(name==='server-only')return {};
 if(name==='./assessment')return assessment;
 if(name==='./catalogue')return {items,skills:map.skills};
 if(name==='./presentation-progress')return {};
 throw new Error(`Unexpected import: ${name}`);
}});
const {nextQuestion}=module.exports;
function run(kind:'baseline'|'followup'='baseline',status='in_progress'):RunRow{return {id:kind,kind,status,started_at:new Date().toISOString(),completed_at:status==='completed'?new Date().toISOString():null};}
function session(part:'maths'|'english'|'reading'='maths',kind:'baseline'|'followup'='baseline'):SessionRow{return {id:`${kind}-${part}`,assessment_id:kind,owner_id:'owner',part,status:'in_progress',started_at:new Date().toISOString(),completed_at:null};}
function marked(item:Item,answer:string|null=item.acceptedAnswers[0]):Attempt{return assessment.markAttempt(item,{answer:answer??'',responseMs:4000,assisted:false,sessionId:'test-session',readingEstimate:item.kind==='reading'?100:undefined});}
function row(item:Item,correct=true,kind:'baseline'|'followup'='baseline'):Record<string,unknown>{const a=marked(item,correct?item.acceptedAnswers[0]:'incorrect answer');return {assessment_id:kind,item_id:a.itemId,skill_id:a.skillId,correct:a.correct,response_ms:a.responseMs,assisted:a.assisted,likely_guess:a.likelyGuess,session_id:a.sessionId,created_at:a.createdAt,year_level:a.yearLevel,reading_estimate:a.readingEstimate??null};}
function history(rows:Record<string,unknown>[]=[],runs:RunRow[]=[run()]){return {runs,sessions:[],attempts:rows,activities:[]};}
const inRange=(item:Item)=>item.yearLevel===1||item.yearLevel===2;

test('new warm-ups begin at Year 2 in both maths and English',()=>{
 for(const part of ['maths','english'] as const){
  const item=nextQuestion(run(),session(part),history());
  assert.equal(item?.yearLevel,2);assert.equal(item?.subject,part);
 }
});

test('two considered Year 2 misses move to Year 1 and never outside the requested range',()=>{
 const r=run(),s=session(),h=history();
 const first=nextQuestion(r,s,h)!;h.attempts.push(row(first,false));
 const recheck=nextQuestion(r,s,h)!;assert.equal(recheck.yearLevel,2);h.attempts.push(row(recheck,false));
 const easier=nextQuestion(r,s,h)!;assert.equal(easier.yearLevel,1);h.attempts.push(row(easier,false));
 const easierRecheck=nextQuestion(r,s,h)!;assert.equal(easierRecheck.yearLevel,1);h.attempts.push(row(easierRecheck,false));
 assert.equal(nextQuestion(r,s,h)?.yearLevel,1);
 for(let i=h.attempts.length;i<12;i++){
  const item=nextQuestion(r,s,h);if(!item)break;
  assert(inRange(item));h.attempts.push(row(item,false));
 }
});

test('saved Pre-primary answers are preserved while remaining warm-up questions start at Year 2',()=>{
 const old=items.filter(item=>item.subject==='maths'&&item.form==='baseline'&&item.yearLevel===0).slice(0,2);
 const h=history([row(old[0]),row(old[1],false)]),before=JSON.stringify(h);
 assert.equal(nextQuestion(run(),session(),h)?.yearLevel,2);
 assert.equal(JSON.stringify(h),before);
});

test('an exhausted Year 1–2 pool ends instead of reaching Year 3 or Pre-primary',()=>{
 const pool=[1,2].flatMap(level=>items.filter(item=>item.subject==='maths'&&item.form==='baseline'&&item.yearLevel===level).slice(0,2));
 const attempts=pool.map(item=>marked(item));
 assert.equal(assessment.chooseNextItem(pool,attempts,'maths',undefined,'baseline',2),undefined);
 const year2=items.filter(item=>item.subject==='maths'&&item.form==='baseline'&&item.yearLevel===2).slice(0,3);
 const year1=items.filter(item=>item.subject==='maths'&&item.form==='baseline'&&item.yearLevel===1).slice(0,1);
 assert.equal(assessment.chooseNextItem([...year1,...year2],year2.slice(0,2).map(item=>marked(item)),'maths',undefined,'baseline',2)?.yearLevel,2);
});

test('reading uses one Year 1 and one Year 2 passage regardless of transcription estimates',()=>{
 const r=run(),s=session('reading'),h=history();
 const first=nextQuestion(r,s,h)!;assert.equal(first.yearLevel,1);assert.equal(first.kind,'reading');h.attempts.push(row(first));
 const second=nextQuestion(r,s,h)!;assert.equal(second.yearLevel,2);h.attempts.push(row(second));
 assert.equal(nextQuestion(r,s,h),undefined);
});

test('follow-up still matches saved older baseline questions outside the new warm-up range',()=>{
 const original=[0,3].map(level=>items.find(item=>item.subject==='maths'&&item.form==='baseline'&&item.yearLevel===level)!);
 const r=run('followup'),s=session('maths','followup'),h=history(original.map(item=>row(item)),[run('baseline','completed'),r]);
 const oldRows=JSON.stringify(h.attempts);
 const first=nextQuestion(r,s,h)!;assert.equal(first.yearLevel,0);assert.equal(first.skillId,original[0].skillId);assert.equal(first.form,'followup');
 h.attempts.push(row(first,false,'followup'));
 const second=nextQuestion(r,s,h)!;assert.equal(second.yearLevel,3);assert.equal(second.skillId,original[1].skillId);assert.equal(second.form,'followup');
 assert.equal(JSON.stringify(h.attempts.slice(0,2)),oldRows);
});

test('an older reading baseline keeps its original PP and Year 1 pair for the four-week check',()=>{
 const original=[0,1].map(level=>items.find(item=>item.kind==='reading'&&item.form==='baseline'&&item.yearLevel===level)!);
 const r=run('followup'),s=session('reading','followup'),h=history(original.map(item=>row(item)),[run('baseline','completed'),r]);
 const first=nextQuestion(r,s,h)!;assert.equal(first.yearLevel,0);h.attempts.push(row(first,true,'followup'));
 assert.equal(nextQuestion(r,s,h)?.yearLevel,1);
});
