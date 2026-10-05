/** Real microphone route with isolated authentication/budget/provider fixtures. */
import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import path from 'node:path';
import vm from 'node:vm';
import ts from 'typescript';
import models from '../lib/config/models.json';

type Provider=(url:string,options:RequestInit)=>Promise<Response>;
function harness(options:{signedIn?:boolean;configured?:boolean;reservationError?:string;provider?:Provider}={}){
 const calls={auth:0,bodies:0,provider:0,reservations:[] as {kind:string;cents:number}[],recordWrites:0};
 const db={from(){calls.recordWrites++;throw new Error('Recording/transcript writes are forbidden');},get storage(){calls.recordWrites++;throw new Error('Recording uploads are forbidden');}};
 const root=process.cwd(),cache=new Map<string,{exports:Record<string,unknown>}>();
 const stubs:Record<string,unknown>={
  'next/server':{NextResponse:{json:(body:unknown,init:ResponseInit)=>Response.json(body,init)}},
  '@/lib/db':{family:async()=>{calls.auth++;if(options.signedIn===false)throw new Error('SIGN_IN_REQUIRED');return {db,user:{id:'fixture-owner'}};}},
  '@/lib/voice':{voiceConfig:models,reserveVoice:async(actualDb:unknown,kind:string,cents:number)=>{
   assert.equal(actualDb,db);calls.reservations.push({kind,cents});if(options.reservationError)throw new Error(options.reservationError);
  }}
 };
 function load(file:string):Record<string,unknown>{
  const absolute=path.resolve(root,file),hit=cache.get(absolute);if(hit)return hit.exports;
  const module={exports:{}};cache.set(absolute,module);
  const code=ts.transpileModule(readFileSync(absolute,'utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022,esModuleInterop:true}}).outputText;
  vm.runInNewContext(code,{module,exports:module.exports,require:(name:string)=>{
   if(Object.hasOwn(stubs,name))return stubs[name];
   const target=name.startsWith('@/')?path.join(root,name.slice(2)):path.resolve(path.dirname(absolute),name);
   return load(target.endsWith('.ts')?target:`${target}.ts`);
  },Request,Response,File,FormData,AbortSignal,URL,Error,DOMException,process:{env:{...(options.configured===false?{}:{SUMMER_OPENAI_KEY:'fixture-key-never-a-real-credential'})}},fetch:async(url:string,init:RequestInit)=>{
   calls.provider++;return options.provider?options.provider(url,init):Response.json({text:'I grouped the tens first.'});
  }},{filename:absolute});return module.exports;
 }
 const handler=load('app/api/tutor/transcribe/route.ts').POST as (request:Request)=>Promise<Response>;
 return {calls,post:(request:Request)=>{
  const read=request.formData.bind(request);
  Object.defineProperty(request,'formData',{value:async()=>{calls.bodies++;return read();}});
  return handler(request);
 }};
}
function clip(options:{mime?:string;size?:number;duration?:string;audio?:'file'|'text'|'missing';headers?:HeadersInit;signal?:AbortSignal;model?:string}={}){
 const form=new FormData();form.set('durationMs',options.duration??'45000');
 if(options.audio!=='missing')form.set('audio',options.audio==='text'?'not an audio file':new File([new Uint8Array(options.size??256)],'child-supplied-name.mp4',{type:options.mime??'audio/mp4'}));
 if(options.model)form.set('model',options.model);
 const headers=new Headers(options.headers);if(!headers.has('origin'))headers.set('origin','https://example.test');
 return new Request('https://example.test/api/tutor/transcribe',{method:'POST',headers,body:form,signal:options.signal});
}
async function privateBody(response:Response){assert.equal(response.headers.get('cache-control'),'no-store');return response.json();}

test('transcription authenticates before reading the recording, reserving budget or calling the provider',async()=>{
 const {post,calls}=harness({signedIn:false}),response=await post(clip());
 assert.equal(response.status,401);assert.equal((await privateBody(response)).code,'sign_in_required');
 assert.deepEqual(calls,{auth:1,bodies:0,provider:0,reservations:[],recordWrites:0});
});

test('cross-origin and missing configuration requests do not read or send private audio',async()=>{
 const foreign=harness(),response=await foreign.post(clip({headers:{origin:'https://other.test'}}));
 assert(response.status>=400);await privateBody(response);assert.equal(foreign.calls.auth,0);assert.equal(foreign.calls.bodies,0);assert.equal(foreign.calls.provider,0);
 const unconfigured=harness({configured:false}),missing=await unconfigured.post(clip());
 assert.equal(missing.status,503);assert.equal((await privateBody(missing)).code,'voice_not_configured');
 assert.equal(unconfigured.calls.bodies,0);assert.equal(unconfigured.calls.provider,0);assert.equal(unconfigured.calls.reservations.length,0);
});

test('valid explanations use the server model and key, return bounded text, and never save audio or transcripts',async()=>{
 const {post,calls}=harness({provider:async(url,options)=>{
  assert.equal(url,'https://api.openai.com/v1/audio/transcriptions');assert.equal(options.method,'POST');
  assert.equal(new Headers(options.headers).get('authorization'),'Bearer fixture-key-never-a-real-credential');
  assert(options.body instanceof FormData);assert.equal(options.body.get('model'),models.transcription);
  assert.deepEqual(options.body.getAll('languages[]'),['en']);
  const file=options.body.get('file');assert(file instanceof File);assert.equal(file.name,'explanation.m4a');assert.equal(file.size,256);
  assert(options.signal instanceof AbortSignal);
  return Response.json({text:`  ${'thinking '.repeat(160)}  `});
 }});
 const response=await post(clip({model:'client-controlled-model'}));assert.equal(response.status,200);
 const body=await privateBody(response);assert.deepEqual(Object.keys(body),['text']);assert.equal(body.text.length,1000);assert(body.text.startsWith('thinking '));
 assert.deepEqual(calls.reservations,[{kind:'transcription',cents:5}]);assert.equal(calls.auth,1);assert.equal(calls.bodies,1);assert.equal(calls.provider,1);assert.equal(calls.recordWrites,0);
});

test('oversized headers reject before reading audio or reserving budget',async()=>{
 const {post,calls}=harness(),response=await post(clip({headers:{'content-length':String(5*1024*1024+1)}}));
 assert.equal(response.status,413);await privateBody(response);assert.equal(calls.bodies,0);assert.equal(calls.provider,0);assert.equal(calls.reservations.length,0);
});

test('invalid files, MIME types and durations reject without provider calls or reservations',async()=>{
 const cases:Parameters<typeof clip>[0][]=[
  {audio:'missing'},{audio:'text'},{size:99},{size:4*1024*1024+1},{mime:'video/mp4'},
  {mime:'text/plain'},{mime:'application/octet-stream'},{mime:'constructor'},{mime:'__proto__'},
  {duration:'499'},{duration:'65001'},{duration:'not a number'},{duration:'Infinity'},{duration:''}
 ];
 for(const options of cases){
  const {post,calls}=harness(),response=await post(clip(options));
  assert.equal(response.status,400,JSON.stringify(options));await privateBody(response);
  assert.equal(calls.provider,0);assert.equal(calls.reservations.length,0);assert.equal(calls.recordWrites,0);
 }
});

test('valid recording boundaries and supported browser MIME variants remain usable',async()=>{
 for(const options of [{duration:'500',mime:'audio/webm;codecs=opus'},{duration:'65000',mime:'audio/mp4'}]){
  const {post,calls}=harness(),response=await post(clip(options));
  assert.equal(response.status,200);assert.equal((await privateBody(response)).text,'I grouped the tens first.');
  assert.equal(calls.provider,1);assert.deepEqual(calls.reservations,[{kind:'transcription',cents:options.duration==='500'?2:7}]);
 }
});

test('failed reservations, provider errors and unclear speech remain private and do not invent a transcript',async()=>{
 const blocked=harness({reservationError:'BUDGET_LIMIT'}),response=await blocked.post(clip());
 assert.equal(response.status,429);assert.equal((await privateBody(response)).code,'budget_limit');assert.equal(blocked.calls.provider,0);
 for(const status of [429,401,500]){
  const {post,calls}=harness({provider:async()=>Response.json({error:{message:'provider-private-error'}},{status})}),failure=await post(clip());
  assert.equal(failure.status,status===429?429:500);const body=await privateBody(failure);
  assert.equal(body.text,undefined);assert(!JSON.stringify(body).includes('provider-private-error'));assert.equal(calls.recordWrites,0);
 }
 for(const text of ['', '   ',undefined,123]){
  const {post,calls}=harness({provider:async()=>Response.json({text})}),unclear=await post(clip());
  assert.equal(unclear.status,422);assert.equal((await privateBody(unclear)).text,undefined);assert.equal(calls.recordWrites,0);
 }
});

test('cancelling microphone transcription aborts the provider request and returns no recognised words',async()=>{
 const controller=new AbortController();let started!:()=>void;const ready=new Promise<void>(resolve=>{started=resolve;});let providerSignal:AbortSignal|null=null;
 const {post,calls}=harness({provider:async(_url,options)=>{
  const signal=options.signal!;providerSignal=signal;started();
  return new Promise<Response>((_resolve,reject)=>signal.addEventListener('abort',()=>reject(new DOMException('Cancelled','AbortError')),{once:true}));
 }});
 const pending=post(clip({signal:controller.signal}));await ready;controller.abort();const response=await pending;
 assert.equal(response.status,500);assert.equal((await privateBody(response)).text,undefined);
 assert.equal((providerSignal as unknown as AbortSignal).aborted,true);assert.equal(calls.provider,1);assert.equal(calls.recordWrites,0);
});
