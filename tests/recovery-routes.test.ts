/** Actual route/helper code, isolated SDK/provider fixtures; never a real account. */
import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import path from 'node:path';
import vm from 'node:vm';
import ts from 'typescript';
import type {Item,Skill} from '../lib/assessment.ts';

type Row=Record<string,unknown>;
const OWNER='aaaaaaaa-aaaa-4aaa-aaaa-aaaaaaaaaaaa';
const RUN='bbbbbbbb-bbbb-4bbb-bbbb-bbbbbbbbbbbb';
const SID='cccccccc-cccc-4ccc-cccc-cccccccccccc';
const item=(id:string,kind:Item['kind']='number',yearLevel:Item['yearLevel']=0):Item=>({id,skillId:kind==='reading'?'reading':`maths-${id}`,subject:kind==='reading'?'english':'maths',kind,yearLevel,prompt:'Fixture question',spokenPrompt:'Fixture instruction',acceptedAnswers:['2'],form:'baseline',difficulty:yearLevel,...(kind==='reading'?{passage:'A fixture passage.'}:{})});
const maths=Array.from({length:12},(_,i)=>item(`maths-${String(i).padStart(2,'0')}`));
const reading=[item('reading-pp','reading'),item('reading-year1','reading',1)];
const items=[...maths,...reading];
const skills:Skill[]=items.map(question=>({id:question.skillId,subject:question.subject,strand:'Fixture',yearLevel:question.yearLevel,description:'Fixture skill',prerequisites:[],exampleItems:[question],curriculumSource:'Fixture',curriculumVerified:true}));

class MockDatabase {
 rows:Record<string,Row[]>={assessments:[],assessment_sessions:[],attempts:[],learning_sessions:[],reading_recordings:[]};
 counters={attemptInserts:0,readingSaves:0,reservations:0,transcriptions:0,assessmentUpdates:0};
 historyCalls=0;
 onHistory?: (count:number)=>void;
 onAttemptInsert?:()=>void;
 onSessionUpdate?:()=>void;
 onReadingSave?:()=>{data:unknown;error:unknown};
 failCompletionOnce=false;
 constructor(part='maths'){
  this.rows.assessments=[{id:RUN,owner_id:OWNER,kind:'baseline',status:'in_progress',started_at:new Date().toISOString(),completed_at:null}];
  this.rows.assessment_sessions=[{id:SID,assessment_id:RUN,owner_id:OWNER,part,status:'in_progress',started_at:new Date().toISOString(),completed_at:null}];
 }
 from(table:string){return new Query(this,table);}
 async rpc(name:string,values:Row){
  assert.equal(name,'save_reading_attempt');assert.equal(values.p_assessment_id,RUN);assert.equal(values.p_session_id,SID);
  this.counters.readingSaves++;
  if(this.onReadingSave)return this.onReadingSave();
  this.save(String(values.p_item_id));this.rows.reading_recordings.push({id:'recording',owner_id:OWNER,session_id:SID,item_id:values.p_item_id});
  return {data:'recording',error:null};
 }
 save(id:string){
  const question=items.find(value=>value.id===id)!;
  this.rows.attempts.push({owner_id:OWNER,assessment_id:RUN,session_id:SID,item_id:id,skill_id:question.skillId,correct:question.kind==='reading'?null:true,response_ms:4000,assisted:false,likely_guess:false,created_at:new Date().toISOString(),year_level:question.yearLevel,reading_estimate:null});
 }
}
class Query {
 filters:[string,unknown][]=[];kind='select';value:Row={};ordered=false;
 constructor(readonly db:MockDatabase,readonly table:string){}
 select(_columns:string){return this;}eq(key:string,value:unknown){this.filters.push([key,value]);return this;}
 order(_key:string){this.ordered=true;return this;}not(_key:string,_op:string,_value:unknown){return this;}limit(_count:number){return this;}
 update(value:Row){this.kind='update';this.value=value;return this;}insert(value:Row){this.kind='insert';this.value=value;return this;}
 async single(){const result=await this.execute();return {data:result.data[0]??null,error:result.error};}
 async maybeSingle(){return this.single();}
 then(resolve:(value:{data:Row[];error:Row|null})=>unknown,reject?:(error:unknown)=>unknown){return this.execute().then(resolve,reject);}
 async execute():Promise<{data:Row[];error:Row|null}>{
  if(this.table==='assessments'&&this.kind==='select'&&this.ordered)this.db.onHistory?.(++this.db.historyCalls);
  if(this.kind==='insert'){
   assert.equal(this.value.owner_id,OWNER);assert.equal(this.table,'attempts');this.db.counters.attemptInserts++;
   this.db.rows.attempts.push({...this.value,created_at:new Date().toISOString(),reading_estimate:null});this.db.onAttemptInsert?.();return {data:[],error:null};
  }
  if(this.kind==='update'){
   assert.ok(this.filters.some(([key,value])=>key==='owner_id'&&value===OWNER),'updates must remain owned');
   if(this.table==='assessment_sessions')this.db.onSessionUpdate?.();
   if(this.table==='assessments'){
    this.db.counters.assessmentUpdates++;
    if(this.db.failCompletionOnce){this.db.failCompletionOnce=false;return {data:[],error:{code:'mock_transient_failure'}};}
   }
  }
  const selected=(this.db.rows[this.table]??[]).filter(row=>this.filters.every(([key,value])=>row[key]===value));
  if(this.kind==='update')for(const row of selected)Object.assign(row,this.value);
  return {data:structuredClone(selected),error:null};
 }
}

function harness(db:MockDatabase){
 const root=path.resolve(process.cwd()),cache=new Map<string,{exports:Record<string,unknown>}>();
 const catalogue={items,skills,curriculumVerified:true,publicItem:(question:Item)=>{const {acceptedAnswers:_,spokenPrompt:__,...shown}=question;return shown;}};
 const stubs:Record<string,unknown>={
  'server-only':{},'next/server':{NextResponse:{json:(data:unknown,options:ResponseInit)=>Response.json(data,options)}},
  '@/lib/db':{family:async()=>({db,user:{id:OWNER}})},
  '@/lib/voice':{voiceConfig:{transcription:'fixture-model'},reserveVoice:async()=>{db.counters.reservations++;},estimateReading:()=>75},
 };
 function load(file:string):Record<string,unknown>{
  const absolute=path.resolve(root,file);if(absolute===path.join(root,'lib/catalogue.ts'))return catalogue;
  const hit=cache.get(absolute);if(hit)return hit.exports;
  const module={exports:{}};cache.set(absolute,module);
  const source=ts.transpileModule(readFileSync(absolute,'utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022,esModuleInterop:true}}).outputText;
  const require=(name:string)=>{
   if(Object.hasOwn(stubs,name))return stubs[name];
   const target=name.startsWith('@/')?path.join(root,name.slice(2)):path.resolve(path.dirname(absolute),name);
   return load(target.endsWith('.ts')?target:target+'.ts');
  };
  vm.runInNewContext(source,{module,exports:module.exports,require,Buffer,Request,Response,File,Blob,FormData,AbortSignal,Date,DOMException,process:{env:{SUMMER_OPENAI_KEY:'fixture-not-a-real-key'}},fetch:async()=>{db.counters.transcriptions++;return Response.json({text:'Fixture passage.'});}},{filename:absolute});
  return module.exports;
 }
 return async(route:string,request:Request)=>{
  const module=load(`app/api/${route}/route.ts`);return (module.POST as (request:Request)=>Promise<Response>)(request);
 };
}
const answer=()=>new Request('https://example.test/api/answer',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({sessionId:SID,itemId:maths[0].id,answer:'2',responseMs:4000})});
function clip(){const form=new FormData();form.set('sessionId',SID);form.set('itemId',reading[0].id);form.set('durationMs','8000');form.set('audio',new File([new Uint8Array(256)],'fixture.m4a',{type:'audio/mp4'}));return new Request('https://example.test/api/reading',{method:'POST',body:form});}
const assessment=(action='start')=>new Request('https://example.test/api/assessment',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({action,sessionId:SID})});

test('persisted answer and reading retries use actual recovery code without another save/provider charge',async()=>{
 const answers=new MockDatabase();answers.save(maths[0].id);const response=await harness(answers)('answer',answer());
 assert.equal(response.status,200);assert.equal((await response.json()).recovered,true);assert.equal(answers.counters.attemptInserts,0);
 const read=new MockDatabase('reading');read.save(reading[0].id);read.rows.reading_recordings.push({id:'recording',owner_id:OWNER,session_id:SID,item_id:reading[0].id});
 const readingResponse=await harness(read)('reading',clip());assert.equal(readingResponse.status,200);assert.equal((await readingResponse.json()).recordingSaved,true);
 assert.equal(read.counters.readingSaves,0);assert.equal(read.counters.reservations,0);assert.equal(read.counters.transcriptions,0);
});
test('a save+completion between preflight and sessionContext recovers instead of SESSION_NOT_ACTIVE500',async()=>{
 for(const part of ['maths','reading']){
  const db=new MockDatabase(part);db.onHistory=count=>{if(count===2){db.save(part==='maths'?maths[0].id:reading[0].id);db.rows.assessment_sessions[0].status='completed';}};
  const response=await harness(db)(part==='maths'?'answer':'reading',part==='maths'?answer():clip());
  assert.equal(response.status,200);const body=await response.json();assert.equal(body.recovered,true);assert.equal(body.sessionEnded,true);
  assert.equal(db.counters.attemptInserts,0);assert.equal(db.counters.readingSaves,0);assert.equal(db.counters.reservations,0);assert.equal(db.counters.transcriptions,0);
 }
});
test('reading RPC23514 after another writer saves returns existing completion without another transcription',async()=>{
 const db=new MockDatabase('reading');db.onReadingSave=()=>{db.save(reading[0].id);db.rows.reading_recordings.push({id:'other-writer',owner_id:OWNER,session_id:SID,item_id:reading[0].id});db.rows.assessment_sessions[0].status='completed';return {data:null,error:{code:'23514'}};};
 const response=await harness(db)('reading',clip());assert.equal(response.status,200);const body=await response.json();assert.equal(body.recovered,true);assert.equal(body.sessionEnded,true);
 assert.equal(db.rows.attempts.length,1);assert.equal(db.rows.reading_recordings.length,1);assert.equal(db.counters.reservations,1);assert.equal(db.counters.transcriptions,1);
});
test('a failed final completion update is repaired on the next start without changing evidence',async()=>{
 const db=new MockDatabase();db.rows.assessment_sessions=['maths','english','reading'].map((part,i)=>({id:`session-${i}`,assessment_id:RUN,owner_id:OWNER,part,status:'completed',started_at:new Date().toISOString(),completed_at:new Date().toISOString()}));db.failCompletionOnce=true;
 const run=harness(db);assert.equal((await run('assessment',assessment())).status,500);assert.equal(db.rows.assessments[0].status,'in_progress');
 const response=await run('assessment',assessment());assert.equal(response.status,200);assert.equal((await response.json()).assessmentComplete,true);assert.equal(db.rows.assessments[0].status,'completed');assert.equal(db.counters.attemptInserts,0);
});
test('Stop between an answer insert and its history read returns stopped state; Stop cannot overwrite completion',async()=>{
 const db=new MockDatabase();db.onAttemptInsert=()=>{db.rows.assessment_sessions[0].status='stopped';};
 const response=await harness(db)('answer',answer());assert.equal(response.status,200);assert.equal((await response.json()).stopped,true);assert.equal(db.rows.attempts.length,1);
 const completing=new MockDatabase();completing.onSessionUpdate=()=>{completing.rows.assessment_sessions[0].status='completed';};
 const stopped=await harness(completing)('assessment',assessment('stop'));assert.equal(stopped.status,200);assert.equal((await stopped.json()).alreadyEnded,true);assert.equal(completing.rows.assessment_sessions[0].status,'completed');
});
test('a recovered active fourth or eighth answer preserves its movement break',async()=>{
 for(const count of [4,8]){const db=new MockDatabase();for(const question of maths.slice(0,count))db.save(question.id);const response=await harness(db)('answer',answer());assert.equal(response.status,200);assert.equal((await response.json()).brainBreak,true);assert.equal(db.counters.attemptInserts,0);}
});
