import test from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import {readFileSync} from 'node:fs';
import ts from 'typescript';
function load(file:string){
 const module={exports:{} as Record<string,Function>};
 const source=ts.transpileModule(readFileSync(file,'utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022}}).outputText;
 vm.runInNewContext(source,{module,exports:module.exports,require:()=>({observationLabels:{'counting-on':'Counted on','tens-and-ones':'Used tens and ones'}}),Set,Date,Error});
 return module.exports;
}
function database(rows:Record<string,Record<string,unknown>[]>){return {from:(name:string)=>{let filters:[string,unknown][]=[];const query={select:()=>query,eq:(key:string,value:unknown)=>{filters.push([key,value]);return query;},not:()=>query,order:()=>query,then:(resolve:Function)=>Promise.resolve({data:(rows[name]??[]).filter(row=>filters.every(([key,value])=>row[key]===value)),error:null}).then(value=>resolve(value))};return query;}};}
test('fresh progress excludes archived baseline children and old four-week clock',async()=>{
 const db=database({assessments:[{id:'trial',owner_id:'parent',is_archived:true},{id:'summer',owner_id:'parent',is_archived:false}],assessment_sessions:[{id:'old',assessment_id:'trial',owner_id:'parent'},{id:'new',assessment_id:'summer',owner_id:'parent'}],attempts:[{assessment_id:'trial',owner_id:'parent'},{assessment_id:'summer',owner_id:'parent'}],learning_sessions:[{id:'trial-lesson',owner_id:'parent',is_archived:true,started_at:'2026-01-01',completed_at:'2026-01-01'},{id:'summer-lesson',owner_id:'parent',is_archived:false,started_at:'2026-10-06',completed_at:'2026-10-06'}]});
 const h=await load('lib/progress.ts').history(db,'parent');assert.deepEqual(structuredClone(h.runs.map((r:any)=>r.id)),['summer']);assert.equal(h.sessions.length,1);assert.equal(h.attempts.length,1);assert.equal(h.activities[0].startedAt,'2026-10-06');assert.equal(h.activities.length,1);
});
test('fresh tutor progress excludes trial grades and remembered strategies',async()=>{
 const db=database({learning_sessions:[{id:'trial',owner_id:'parent',is_archived:true,status:'completed',tutor_state:{observations:['counting-on']}},{id:'summer',owner_id:'parent',status:'completed',tutor_state:{observations:['tens-and-ones']}}],learning_attempts:[{session_id:'trial',owner_id:'parent',correct:true,assisted:false},{session_id:'summer',owner_id:'parent',correct:false,assisted:false}]});
 const result=await load('lib/learning-progress.ts').learningProgress(db,'parent');assert.equal(result.completedSessions,1);assert.equal(result.answers,1);assert.equal(result.correct,0);assert.deepEqual(structuredClone(result.observations),['Used tens and ones']);
});
