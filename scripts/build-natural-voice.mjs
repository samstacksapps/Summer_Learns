#!/usr/bin/env node
// Explicit, one-off generation of generic voice auditions and fixed instructions.
// Never reads learner records. Retrying reuses verified files, not paid requests.
import {readFile,writeFile,mkdir,rename,unlink} from 'node:fs/promises';
import {randomUUID} from 'node:crypto';
import {fileURLToPath} from 'node:url';
import {dirname,join} from 'node:path';
import {inspectMp3,sha256,loadVoiceDefinition} from './build-fixed-voice.mjs';

const root=join(dirname(fileURLToPath(import.meta.url)),'..');
const config=JSON.parse(await readFile(join(root,'lib/config/natural-voice.json'),'utf8'));
const {lines}=await loadVoiceDefinition();
const output=join(root,'public/audio',config.revision);
const manifestPath=join(output,'manifest.json');
await mkdir(output,{recursive:true});
let previous;try{previous=JSON.parse(await readFile(manifestPath,'utf8'));}catch{}
const configHash=sha256(JSON.stringify({config,lines}));
if(previous&&previous.configHash!==configHash)throw new Error('Use a new revision before changing published voice samples.');
const manifest=previous??{version:1,revision:config.revision,configHash,model:config.model,entries:{}};
async function atomicWrite(path,data){const temp=`${path}.${randomUUID()}.tmp`;try{await writeFile(temp,data,{flag:'wx'});await rename(temp,path);}finally{await unlink(temp).catch(()=>{});}}
const jobs=config.voices.flatMap(voice=>Object.entries({...lines,preview:config.previewText}).map(([line,input])=>({voice,line,input,file:`${voice}-${line}.mp3`})));
let completed=0;
async function worker(){while(jobs.length){const job=jobs.shift();let saved;try{saved=await readFile(join(output,job.file));}catch{}
 if(saved&&manifest.entries[job.file]?.hash===sha256(saved)&&inspectMp3(saved)){completed++;continue;}
 if(!process.env.SUMMER_OPENAI_KEY)throw new Error('SUMMER_OPENAI_KEY is required.');
 const response=await fetch('https://api.openai.com/v1/audio/speech',{method:'POST',headers:{Authorization:`Bearer ${process.env.SUMMER_OPENAI_KEY}`,'Content-Type':'application/json'},body:JSON.stringify({model:config.model,voice:job.voice,input:job.input,instructions:config.instructions,speed:config.speed,response_format:config.format}),signal:AbortSignal.timeout(60000)});
 if(!response.ok)throw new Error(`Speech request failed (${response.status}); no automatic paid retry.`);
 const audio=Buffer.from(await response.arrayBuffer()),info=inspectMp3(audio);
 if(!info)throw new Error(`Invalid audio for ${job.file}.`);
 await atomicWrite(join(output,job.file),audio);
 manifest.entries[job.file]={hash:sha256(audio),bytes:audio.byteLength,durationMs:info.durationMs};completed++;
}}
const outcomes=await Promise.allSettled(Array.from({length:3},worker));
await atomicWrite(manifestPath,JSON.stringify(manifest,null,2)+'\n');
console.log(JSON.stringify({verifiedAssets:completed,total:config.voices.length*(Object.keys(lines).length+1),revision:config.revision}));
if(outcomes.some(result=>result.status==='rejected')){console.error(outcomes.filter(result=>result.status==='rejected').map(result=>result.reason.message).join('\n'));process.exitCode=1;}
