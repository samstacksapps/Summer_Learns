import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile,readdir} from 'node:fs/promises';
import {resolve} from 'node:path';
import {pathToFileURL} from 'node:url';
import {fixedVoicePath,lines} from '../lib/fixed-voice';
import models from '../lib/config/models.json';

const helpers=()=>import(pathToFileURL(resolve('scripts/build-fixed-voice.mjs')).href);

test('fixed paths expose only authored instruction IDs under the current voice revision',()=>{
 assert.equal(Object.keys(lines).length,19);
 for(const line of Object.keys(lines))assert.equal(fixedVoicePath(line),`/audio/${models.voiceRevision}/${line}.mp3`);
 for(const invalid of ['item','__proto__','constructor','../hello','hello.mp3',null,19])assert.equal(fixedVoicePath(invalid),undefined);
});

test('all 19 shipped MP3s match their text/configuration and complete manifest',async()=>{
 const {sha256,audioFingerprint,validAsset}=await helpers();
 const directory=resolve('public/audio',models.voiceRevision);
 const manifest=JSON.parse(await readFile(resolve(directory,'manifest.json'),'utf8'));
 assert.equal(manifest.version,1);assert.equal(manifest.voiceRevision,models.voiceRevision);
 assert.equal(manifest.model,models.speech);assert.equal(manifest.voice,models.voice);assert.equal(manifest.speed,models.speechSpeed);assert.equal(manifest.format,'mp3');
 const keys=Object.keys(lines).sort();assert.deepEqual(Object.keys(manifest.entries).sort(),keys);
 assert.equal(manifest.configHash,sha256(JSON.stringify({revision:models.voiceRevision,entries:Object.entries(lines).map(([line,text])=>[line,audioFingerprint(models,line,text)])})));
 assert.deepEqual((await readdir(directory)).filter(name=>name.endsWith('.mp3')).sort(),keys.map(line=>`${line}.mp3`).sort());
 for(const [line,text] of Object.entries(lines)){
  const audio=await readFile(resolve(directory,`${line}.mp3`));
  assert.ok(validAsset(manifest.entries[line],audio,models,line,text),`${line} must be complete and match its manifest`);
 }
});

test('MP3 validation rejects partial files, changed content and reuse of an immutable revision',async()=>{
 const {inspectMp3,validAsset,ensureImmutableRevision}=await helpers();
 const directory=resolve('public/audio',models.voiceRevision);
 const manifest=JSON.parse(await readFile(resolve(directory,'manifest.json'),'utf8'));
 const audio=await readFile(resolve(directory,'hello.mp3')),entry=manifest.entries.hello;
 assert.ok(inspectMp3(audio));
 assert.equal(inspectMp3(Buffer.from('ID3\x04\x00\x00\x00\x00\x00\x00')),undefined);
 assert.equal(inspectMp3(audio.subarray(0,audio.length-1)),undefined);
 assert.equal(inspectMp3(Buffer.concat([audio,Buffer.from('not audio')])),undefined);
 assert.equal(validAsset(entry,audio,models,'hello',`${lines.hello} Changed.`),false);
 assert.equal(validAsset(entry,audio,{...models,speechInstructions:`${models.speechInstructions} Changed.`},'hello',lines.hello),false);
 assert.equal(validAsset({...entry,audioHash:'wrong'},audio,models,'hello',lines.hello),false);
 assert.doesNotThrow(()=>ensureImmutableRevision(manifest,models.voiceRevision,manifest.configHash));
 assert.throws(()=>ensureImmutableRevision(manifest,models.voiceRevision,'changed configuration'),/Bump voiceRevision/);
});
