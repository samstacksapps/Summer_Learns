import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import vm from 'node:vm';
import ts from 'typescript';

const owner='aaaaaaaa-aaaa-4aaa-aaaa-aaaaaaaaaaaa';
const id='bbbbbbbb-bbbb-4bbb-bbbb-bbbbbbbbbbbb';
function route({locked=false,missing=false}:{locked?:boolean;missing?:boolean}={}){
 const calls:unknown[]=[];
 const source=ts.transpileModule(readFileSync('app/api/parent/reset/route.ts','utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022}}).outputText;
 const module={exports:{} as {POST:(request:Request)=>Promise<Response>}};
 const require=(name:string)=>{
  if(name==='@/lib/pin')return {requireParent:async()=>{if(locked)throw new Error('PIN_REQUIRED');return {user:{id:owner},db:{rpc:async(name:string,args:unknown)=>{calls.push({name,args});return missing?{error:{code:'PGRST202'}}:{data:{archivedAssessments:1,archivedLessons:2}};}}};}};
  if(name==='@/lib/http')return {sameOrigin:(request:Request)=>{if(request.headers.get('origin')!==new URL(request.url).origin)throw new Error('BAD_ORIGIN');},uuid:(value:unknown)=>typeof value==='string'&&/^[a-f0-9-]{36}$/i.test(value),json:(data:unknown,status=200)=>Response.json(data,{status}),failure:(error:Error)=>Response.json({error:error.message},{status:error.message==='PIN_REQUIRED'?403:500})};
  throw new Error(name);
 };
 vm.runInNewContext(source,{module,exports:module.exports,require,Response,Request,Error});
 return {post:module.exports.POST,calls};
}
function request(body:unknown,origin='https://summerlearns.vercel.app'){return new Request('https://summerlearns.vercel.app/api/parent/reset',{method:'POST',headers:{origin,'Content-Type':'application/json'},body:JSON.stringify(body)});}
test('parent reset requires a valid PIN before calling the database',async()=>{const h=route({locked:true});assert.equal((await h.post(request({confirmation:'START_FRESH',requestId:id}))).status,403);assert.equal(h.calls.length,0);});
test('parent reset refuses cross-origin requests and unconfirmed actions',async()=>{const h=route();assert.notEqual((await h.post(request({confirmation:'START_FRESH',requestId:id},'https://elsewhere.example'))).status,200);assert.equal((await h.post(request({requestId:id}))).status,400);assert.equal((await h.post(request({confirmation:'START_FRESH',requestId:'invalid'}))).status,400);assert.equal(h.calls.length,0);});
test('confirmed parent reset forwards only its retry ID to the owned atomic database function',async()=>{const h=route();const result=await h.post(request({confirmation:'START_FRESH',requestId:id,owner_id:'someone-else'}));assert.equal(result.status,200);assert.deepEqual(structuredClone(h.calls),[{name:'archive_learning_results',args:{p_request_id:id}}]);assert.equal((await result.json()).archivedLessons,2);});
test('missing reset migration gives the parent an actionable setup response',async()=>{const h=route({missing:true});const result=await h.post(request({confirmation:'START_FRESH',requestId:id}));assert.equal(result.status,503);assert.equal((await result.json()).code,'reset_setup_required');});
