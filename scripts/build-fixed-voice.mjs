#!/usr/bin/env node
// Run once for an authorised voice revision: node scripts/build-fixed-voice.mjs
// Uses the inherited proxy/CA and SUMMER_OPENAI_KEY. Never reads family records.
import {readFile,mkdir,rename,unlink,writeFile} from 'node:fs/promises';
import {createHash,randomUUID} from 'node:crypto';
import {createRequire} from 'node:module';
import {fileURLToPath,pathToFileURL} from 'node:url';
import {dirname,join,resolve} from 'node:path';
import {spawnSync} from 'node:child_process';
import ts from 'typescript';

const root=resolve(dirname(fileURLToPath(import.meta.url)),'..');
const maxAudioBytes=2*1024*1024;
export const sha256=value=>createHash('sha256').update(value).digest('hex');

export async function loadVoiceDefinition(){
 const sourcePath=join(root,'lib/fixed-voice.ts');
 const source=await readFile(sourcePath,'utf8');
 const output=ts.transpileModule(source,{compilerOptions:{module:ts.ModuleKind.CommonJS,esModuleInterop:true}}).outputText;
 const exports={};
 new Function('exports','require',output)(exports,createRequire(sourcePath));
 const models=JSON.parse(await readFile(join(root,'lib/config/models.json'),'utf8'));
 if(!/^[a-zA-Z0-9_-]+$/.test(models.voiceRevision)||models.speechFormat!=='mp3')throw new Error('Invalid voice revision or format.');
 return {lines:exports.lines,models};
}

export function audioFingerprint(models,line,text){
 return sha256(JSON.stringify({model:models.speech,voice:models.voice,instructions:models.speechInstructions,speed:models.speechSpeed,format:models.speechFormat,line,text}));
}

// Parse every MPEG Layer III frame, so an ID3 header or a truncated download
// cannot masquerade as a playable asset. No external codecs are needed to resume.
export function inspectMp3(audio){
 if(!Buffer.isBuffer(audio))audio=Buffer.from(audio);
 if(audio.length<8||audio.length>maxAudioBytes)return undefined;
 let offset=0,frames=0,duration=0,streamRate;
 if(audio.subarray(0,3).toString()==='ID3'){
  if(audio.length<10||![2,3,4].includes(audio[3])||audio[4]===255||audio[6]>=128||audio[7]>=128||audio[8]>=128||audio[9]>=128)return undefined;
  if((audio[5]&(audio[3]===2?63:audio[3]===3?31:15))!==0)return undefined;
  const tagSize=(audio[6]<<21)|(audio[7]<<14)|(audio[8]<<7)|audio[9];
  offset=10+tagSize+((audio[5]&16)?10:0);
 }
 while(offset<audio.length){
  if(audio.length-offset===128&&audio.subarray(offset,offset+3).toString()==='TAG'){offset=audio.length;break;}
  if(offset+4>audio.length||audio[offset]!==255||(audio[offset+1]&224)!==224)return undefined;
  const version=(audio[offset+1]>>3)&3,layer=(audio[offset+1]>>1)&3;
  const bitrateIndex=(audio[offset+2]>>4)&15,rateIndex=(audio[offset+2]>>2)&3;
  if(version===1||layer!==1||bitrateIndex===0||bitrateIndex===15||rateIndex===3||(audio[offset+3]&3)===2)return undefined;
  const rates=[44100,48000,32000];
  const rate=rates[rateIndex]/(version===3?1:version===2?2:4);
  const bitrates=version===3?[0,32,40,48,56,64,80,96,112,128,160,192,224,256,320]:[0,8,16,24,32,40,48,56,64,80,96,112,128,144,160];
  const frameSize=Math.floor((version===3?144000:72000)*bitrates[bitrateIndex]/rate)+((audio[offset+2]>>1)&1);
  if(streamRate!==undefined&&streamRate!==rate||offset+frameSize>audio.length)return undefined;
  streamRate=rate;offset+=frameSize;frames++;duration+=(version===3?1152:576)/rate;
 }
 return frames>=2&&offset===audio.length?{frames,durationMs:Math.round(duration*1000)}:undefined;
}

export function validAsset(entry,audio,models,line,text){
 return Boolean(entry&&entry.file===`${line}.mp3`&&entry.contentHash===audioFingerprint(models,line,text)&&entry.audioHash===sha256(audio)&&entry.bytes===audio.byteLength&&inspectMp3(audio));
}

export function ensureImmutableRevision(previous,revision,configHash){
 if(previous?.version===1&&previous.voiceRevision===revision&&previous.configHash!==configHash)throw new Error('Bump voiceRevision before changing fixed instruction text or voice settings.');
}

async function atomicWrite(path,content){
 const temporary=`${path}.${randomUUID()}.tmp`;
 try{await writeFile(temporary,content,{flag:'wx'});await rename(temporary,path);}
 finally{await unlink(temporary).catch(()=>{});}
}

async function generate(models,text){
 const response=await fetch('https://api.openai.com/v1/audio/speech',{
  method:'POST',headers:{Authorization:`Bearer ${process.env.SUMMER_OPENAI_KEY}`,'Content-Type':'application/json'},
  body:JSON.stringify({model:models.speech,voice:models.voice,input:text,response_format:models.speechFormat,instructions:models.speechInstructions,speed:models.speechSpeed}),
  signal:AbortSignal.timeout(90000)
 });
 if(!response.ok){
  let code='';try{const body=await response.json();const candidate=body.error?.code;if(typeof candidate==='string'&&/^[a-z0-9_]{1,80}$/i.test(candidate))code=candidate;}catch{}
  throw new Error(`Provider HTTP ${response.status}${code?` (${code})`:''}`);
 }
 const type=response.headers.get('content-type')??'';
 if(!type.startsWith('audio/')||Number(response.headers.get('content-length'))>maxAudioBytes)throw new Error('Provider returned an invalid audio response.');
 const audio=Buffer.from(await response.arrayBuffer());
 if(!inspectMp3(audio))throw new Error('Provider returned an invalid or incomplete MP3.');
 return audio;
}

export async function buildFixedVoice(){
 const started=Date.now(),{lines,models}=await loadVoiceDefinition();
 const output=join(root,'public/audio',models.voiceRevision),manifestPath=join(output,'manifest.json');
 await mkdir(output,{recursive:true});
 let previous;try{previous=JSON.parse(await readFile(manifestPath,'utf8'));}catch{}
 const configHash=sha256(JSON.stringify({revision:models.voiceRevision,entries:Object.entries(lines).map(([line,text])=>[line,audioFingerprint(models,line,text)])}));
 ensureImmutableRevision(previous,models.voiceRevision,configHash);
 const manifest={version:1,voiceRevision:models.voiceRevision,configHash,model:models.speech,voice:models.voice,speed:models.speechSpeed,format:models.speechFormat,entries:{}};
 const pending=[];
 for(const [line,text] of Object.entries(lines)){
  let audio;try{audio=await readFile(join(output,`${line}.mp3`));}catch{}
  const entry=previous?.version===1&&previous?.voiceRevision===models.voiceRevision?previous.entries?.[line]:undefined;
  if(audio&&validAsset(entry,audio,models,line,text)){manifest.entries[line]=entry;console.log(`Reuse ${line}: ${audio.byteLength} bytes`);}
  else pending.push([line,text]);
 }
 // A resume snapshot keeps completed files reusable after a failed run.
 await atomicWrite(manifestPath,`${JSON.stringify(manifest,null,2)}\n`);
 if(pending.length&&!process.env.SUMMER_OPENAI_KEY)throw new Error('SUMMER_OPENAI_KEY is not configured; no requests made.');
 let cursor=0,failures=0,manifestWrites=Promise.resolve();
 const worker=async()=>{
  while(cursor<pending.length){
   const [line,text]=pending[cursor++],lineStarted=Date.now();
   try{
    const audio=await generate(models,text),details=inspectMp3(audio);
    await atomicWrite(join(output,`${line}.mp3`),audio);
    manifest.entries[line]={file:`${line}.mp3`,contentHash:audioFingerprint(models,line,text),audioHash:sha256(audio),bytes:audio.byteLength,durationMs:details.durationMs};
    const snapshot=`${JSON.stringify(manifest,null,2)}\n`;
    manifestWrites=manifestWrites.then(()=>atomicWrite(manifestPath,snapshot));await manifestWrites;
    console.log(`Built ${line}: ${audio.byteLength} bytes, ${Date.now()-lineStarted} ms`);
   }catch(error){failures++;const message=error instanceof Error&&/^Provider HTTP|^Provider returned/.test(error.message)?error.message:'Request or file operation failed';console.error(`Failed ${line}: ${message}; not retried.`);}
  }
 };
 await Promise.all(Array.from({length:Math.min(4,pending.length)},worker));
 await manifestWrites;
 console.log(`Fixed voice: ${Object.keys(manifest.entries).length}/${Object.keys(lines).length} valid files, ${Object.values(manifest.entries).reduce((sum,entry)=>sum+entry.bytes,0)} bytes, ${Date.now()-started} ms, ${failures} failures.`);
 if(failures||Object.keys(manifest.entries).length!==Object.keys(lines).length)throw new Error('Fixed audio build is incomplete; successful files can be reused on an explicit rerun.');
}

if(process.argv[1]&&pathToFileURL(resolve(process.argv[1])).href===import.meta.url){
 if(Number(process.versions.node.split('.')[0])<24){console.error('Node24 or newer is required.');process.exitCode=1;}
 else if((process.env.HTTPS_PROXY||process.env.HTTP_PROXY)&&process.env.NODE_USE_ENV_PROXY!=='1'&&!process.execArgv.includes('--use-env-proxy')){
  // Node fetch must use the configured credential-injecting proxy, with inherited CA trust.
  const result=spawnSync(process.execPath,['--use-env-proxy',fileURLToPath(import.meta.url)],{stdio:'inherit',env:process.env});process.exitCode=result.status??1;
 }else await buildFixedVoice().catch(error=>{console.error(error.message);process.exitCode=1;});
}
