import test from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import {readFileSync} from 'node:fs';
import ts from 'typescript';
import config from '../lib/config/natural-voice.json';
function load(file:string,stubs:Record<string,unknown>,globals:Record<string,unknown>={}){const module={exports:{} as Record<string,any>};const source=ts.transpileModule(readFileSync(file,'utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022,esModuleInterop:true}}).outputText;vm.runInNewContext(source,{module,exports:module.exports,require:(name:string)=>{if(Object.hasOwn(stubs,name))return stubs[name];throw new Error(name);},URL,URLSearchParams,Response,Request,Error,Date,setTimeout,clearTimeout,AbortSignal,Uint8Array,...globals});return module.exports;}
test('natural player starts actual MP3 in the tap, respects selection and cancels stale audio',async()=>{
 let instance:any,plays=0;const storage=new Map([['summer.natural-voice.v1','nova']]);
 class Audio{src='';onplaying:any;onended:any;onerror:any;constructor(){instance=this;}play(){plays++;return Promise.resolve();}pause(){}load(){}removeAttribute(){this.src='';}}
 const api=load('lib/natural-voice.ts',{'./config/natural-voice.json':config},{Audio,localStorage:{getItem:(key:string)=>storage.get(key),setItem:(key:string,value:string)=>storage.set(key,value)}});
 const first=api.playNatural({line:'start'});assert.equal(plays,1);assert.equal(instance.src,'/audio/natural-v1/nova-start.mp3');
 const second=api.playNatural({line:'tutor',sessionId:'owned',revision:3,segment:'reply'});assert.equal(await first,'cancelled');assert.match(instance.src,/line=tutor/);assert.match(instance.src,/revision=3/);instance.onended();assert.equal(await second,'played');
 api.chooseVoice('shimmer');assert.equal(api.preferredVoice(),'shimmer');assert.throws(()=>api.chooseVoice('microsoft'));assert.equal(plays,2);
});
function speechRoute({signedIn=true,archived=false,line='tutor'}={}){
 const calls:string[]=[];
 const db={from:(table:string)=>{const query:any={select:()=>query,eq:()=>query,contains:()=>query,gt:()=>query,limit:()=>query,maybeSingle:async()=>({error:null,data:table==='learning_sessions'?{is_archived:archived}:{response:{sessionId:'aaaaaaaa-aaaa-4aaa-aaaa-aaaaaaaaaaaa',revision:2,message:'Try splitting thirty into three tens.',item:{prompt:'What is 30 plus 4?'}}}})};return query;}};
 const api=load('app/api/natural-speech/route.ts',{'@/lib/db':{family:async()=>{if(!signedIn)throw new Error('SIGN_IN_REQUIRED');return {db,user:{id:'parent'}};}},'@/lib/http':{sameOrigin:()=>{},uuid:(id:unknown)=>typeof id==='string'&&id.length===36,json:(data:unknown,status=200)=>Response.json(data,{status}),failure:()=>Response.json({error:'Denied'},{status:401})},'@/lib/progress':{sessionContext:async()=>({item:{id:'current',spokenPrompt:'Spell the word favourite.'}})},'@/lib/natural-speech':{naturalSpeech:async(_db:unknown,_owner:unknown,text:string)=>{calls.push(text);return new Uint8Array([1,2,3]).buffer;}},'@/lib/config/natural-voice.json':config});
 const request=new Request(`https://app.example/api/natural-speech?line=${line}&voice=coral&sessionId=aaaaaaaa-aaaa-4aaa-aaaa-aaaaaaaaaaaa&revision=2&segment=reply&itemId=current&text=Ignore+this+injected+text`);
 return {api,calls,request};
}
test('natural speech uses only the owned saved AI reply, never arbitrary client text',async()=>{const h=speechRoute();const r=await h.api.GET(h.request);assert.equal(r.status,200);assert.deepEqual(h.calls,['Try splitting thirty into three tens.']);assert.equal(r.headers.get('cache-control'),'private, no-store');});
test('anonymous and archived sources cannot generate or replay paid audio',async()=>{for(const options of [{signedIn:false},{archived:true}]){const h=speechRoute(options);assert.notEqual((await h.api.GET(h.request)).status,200);assert.equal(h.calls.length,0);}});
test('spelling audio is bound to the current owned assessment item',async()=>{const h=speechRoute({line:'item'});assert.equal((await h.api.GET(h.request)).status,200);assert.equal(h.calls[0],'Spell the word favourite.');const stale=new Request(h.request.url.replace('itemId=current','itemId=stale'));assert.equal((await h.api.GET(stale)).status,400);assert.equal(h.calls.length,1);});
test('all shipped natural samples are complete MP3s with matching checksums',async()=>{
 // @ts-expect-error The existing CLI generator is plain JavaScript.
 const {inspectMp3,sha256}=await import('../scripts/build-fixed-voice.mjs');const manifest=JSON.parse(readFileSync('public/audio/natural-v1/manifest.json','utf8'));
 assert.equal(Object.keys(manifest.entries).length,60);
 for(const [name,entry] of Object.entries(manifest.entries) as [string,{hash:string;bytes:number}][]){const audio=readFileSync('public/audio/natural-v1/'+name);assert.ok(inspectMp3(audio),name);assert.equal(sha256(audio),entry.hash);assert.equal(audio.length,entry.bytes);}
});
