/** Actual API handler with isolated authentication and speech; no provider calls. */
import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import path from 'node:path';
import vm from 'node:vm';
import ts from 'typescript';
import {fixedVoicePath} from '../lib/fixed-voice';

const OWNER='aaaaaaaa-aaaa-4aaa-aaaa-aaaaaaaaaaaa';
const SID='bbbbbbbb-bbbb-4bbb-bbbb-bbbbbbbbbbbb';
function harness(signedIn=true){
 const db={},calls={tts:0,context:0};
 const root=process.cwd(),cache=new Map<string,{exports:Record<string,unknown>}>();
 const stubs:Record<string,unknown>={
  'next/server':{NextResponse:{json:(body:unknown,options:ResponseInit)=>Response.json(body,options)}},
  '@/lib/db':{family:async()=>{if(!signedIn)throw new Error('SIGN_IN_REQUIRED');return {db,user:{id:OWNER}};}},
  '@/lib/progress':{sessionContext:async(actualDb:unknown,owner:string,sessionId:string)=>{
   calls.context++;assert.equal(actualDb,db);assert.equal(owner,OWNER);assert.equal(sessionId,SID);
   return {item:{id:'current-spelling-item',spokenPrompt:'Private authored spelling instruction.'}};
  }},
  '@/lib/voice':{speech:async(actualDb:unknown,text:string)=>{
   calls.tts++;assert.equal(actualDb,db);assert.equal(text,'Private authored spelling instruction.');return new Uint8Array([1,2,3]).buffer;
  }}
 };
 function load(file:string):Record<string,unknown>{
  const absolute=path.resolve(root,file);
  if(absolute.endsWith('.json'))return JSON.parse(readFileSync(absolute,'utf8'));
  const hit=cache.get(absolute);if(hit)return hit.exports;
  const module={exports:{}};cache.set(absolute,module);
  const code=ts.transpileModule(readFileSync(absolute,'utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022,esModuleInterop:true}}).outputText;
  const require=(name:string)=>{
   if(Object.hasOwn(stubs,name))return stubs[name];
   const target=name.startsWith('@/')?path.join(root,name.slice(2)):path.resolve(path.dirname(absolute),name);
   return load(/\.(ts|json)$/.test(target)?target:`${target}.ts`);
  };
  vm.runInNewContext(code,{module,exports:module.exports,require,Request,Response,Uint8Array,URL,Error},{filename:absolute});return module.exports;
 }
 const handler=load('app/api/speech/route.ts').POST as (request:Request)=>Promise<Response>;
 return {calls,post:(body:Record<string,unknown>)=>handler(new Request('https://example.test/api/speech',{method:'POST',headers:{Origin:'https://example.test','Content-Type':'application/json'},body:JSON.stringify(body)}))};
}

test('legacy fixed instructions authenticate then redirect with GET semantics without TTS or reservation',async()=>{
 const {post,calls}=harness();const response=await post({line:'hello'});
 assert.equal(response.status,303);assert.equal(response.headers.get('location'),fixedVoicePath('hello'));assert.equal(response.headers.get('cache-control'),'no-store');
 assert.equal(calls.tts,0);assert.equal(calls.context,0);
});
test('anonymous fixed instruction requests retain the authenticated API contract',async()=>{
 const {post,calls}=harness(false);const response=await post({line:'home'});
 assert.equal(response.status,401);assert.equal((await response.json()).code,'sign_in_required');assert.equal(calls.tts,0);
});
test('dynamic speech uses only the owned current item, rejecting stale IDs and injected text',async()=>{
 const {post,calls}=harness();
 const stale=await post({line:'item',sessionId:SID,itemId:'other-item',text:'Injected text'});
 assert.equal(stale.status,400);assert.equal(calls.tts,0);
 const current=await post({line:'item',sessionId:SID,itemId:'current-spelling-item',text:'Injected text'});
 assert.equal(current.status,200);assert.equal(current.headers.get('cache-control'),'no-store');assert.equal(current.headers.get('content-type'),'audio/mpeg');assert.equal(calls.tts,1);assert.equal(calls.context,2);
 const unknown=await post({line:'constructor'});assert.equal(unknown.status,400);assert.equal(calls.tts,1);
});
test('device speech gets only the current owned instruction and makes no paid speech request',async()=>{
 const {post,calls}=harness();
 const stale=await post({line:'item',format:'text',sessionId:SID,itemId:'other-item'});
 assert.equal(stale.status,400);
 const response=await post({line:'item',format:'text',sessionId:SID,itemId:'current-spelling-item',text:'Injected answer'});
 assert.equal(response.status,200);assert.equal(response.headers.get('cache-control'),'no-store');
 assert.deepEqual(await response.json(),{text:'Private authored spelling instruction.'});assert.equal(calls.tts,0);
 const anonymous=await harness(false).post({line:'item',format:'text',sessionId:SID,itemId:'current-spelling-item'});
 assert.equal(anonymous.status,401);
});
