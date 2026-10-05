import test from 'node:test';
import assert from 'node:assert/strict';
import map from '../data/skill-map.json';
import {estimateReading} from '../lib/reading-score';
import type {Skill} from '../lib/assessment';
const skills=map.skills as Skill[];
test('all priority skills have valid prerequisite links without cycles and both fresh forms',()=>{
 const byId=new Map(skills.map(s=>[s.id,s]));assert.equal(byId.size,skills.length);
 const visited=new Set<string>();
 const walk=(id:string,path:Set<string>)=>{assert(byId.has(id),`unknown prerequisite ${id}`);assert(!path.has(id),`cycle ${id}`);if(visited.has(id))return;const next=new Set([...path,id]);for(const p of byId.get(id)!.prerequisites)walk(p,next);visited.add(id);};
 for(const s of skills){walk(s.id,new Set());assert(s.exampleItems.some(i=>i.form==='baseline'));assert(s.exampleItems.some(i=>i.form==='followup'));}
});
test('item IDs are unique and choices really contain an accepted answer',()=>{
 const items=skills.flatMap(s=>s.exampleItems);assert.equal(new Set(items.map(i=>i.id)).size,items.length);
 for(const s of skills)for(const i of s.exampleItems){assert.equal(i.skillId,s.id);assert.equal(i.yearLevel,s.yearLevel);if(i.kind==='choice')assert(i.choices?.some(c=>i.acceptedAnswers.includes(c)));}
});
test('spelling display never gives away the target; reading audio never supplies the passage',()=>{
 for(const s of skills)for(const i of s.exampleItems){if(i.kind==='spelling')for(const a of i.acceptedAnswers)assert(!new RegExp(`\\b${a}\\b`,'i').test(i.prompt),`visible spelling target ${i.id}`);if(i.kind==='reading'){assert(i.passage);assert(!i.spokenPrompt.includes(i.passage!));}}
});
test('parallel forms use different tasks and the same declared difficulty',()=>{
 for(const s of skills){const first=s.exampleItems.filter(i=>i.form==='baseline');const after=s.exampleItems.filter(i=>i.form==='followup');for(const a of after){assert(first.some(b=>b.kind===a.kind&&b.difficulty===a.difficulty));assert(!first.some(b=>JSON.stringify([b.spokenPrompt,b.acceptedAnswers,b.passage])===JSON.stringify([a.spokenPrompt,a.acceptedAnswers,a.passage])));}}
});
test('reading estimate handles omissions, replacements, punctuation, and additional words without pretending to be a grade',()=>{
 assert.equal(estimateReading('The cat sat.','the cat sat'),100);
 assert.equal(estimateReading('The cat sat.','the cat'),67);
 assert.equal(estimateReading('The cat sat.','the dog sat'),67);
 assert.equal(estimateReading('The cat sat.','The cat sat and then jumped'),0);
 assert.equal(estimateReading('',''),0);
});
