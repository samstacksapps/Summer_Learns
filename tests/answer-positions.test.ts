import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import vm from 'node:vm';
import ts from 'typescript';
import map from '../data/skill-map.json';
import config from '../lib/config/assessment.json';
import {markAttempt,type Item,type Skill} from '../lib/assessment';
import {shuffledChoices} from '../lib/choice-order';

// Exercise the actual server-only public serializer without changing React conditions.
const module={exports:{} as {publicItem:(item:Item,seed?:string)=>Omit<Item,'acceptedAnswers'|'spokenPrompt'|'form'|'difficulty'>}};
const code=ts.transpileModule(readFileSync(new URL('../lib/catalogue.ts',import.meta.url),'utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022,esModuleInterop:true}}).outputText;
vm.runInNewContext(code,{module,exports:module.exports,require:(name:string)=>{
 if(name==='server-only')return {};
 if(name==='@/data/skill-map.json')return map;
 if(name==='./config/assessment.json')return config;
 if(name==='./choice-order')return {shuffledChoices};
 throw new Error(`Unexpected import: ${name}`);
}});
const {publicItem}=module.exports;
const bank=(map.skills as Skill[]).flatMap(skill=>skill.exampleItems).filter(item=>item.kind==='choice');
const session='aaaaaaaa-aaaa-4aaa-aaaa-aaaaaaaaaaaa';

test('question options keep their order on reload and preserve the authored bank',()=>{
 for(const item of bank){
  const before=[...item.choices!];
  const first=publicItem(item,session),reloaded=publicItem(item,session);
  assert.deepEqual(first.choices,reloaded.choices);
  assert.deepEqual([...first.choices!].sort(),[...before].sort());
  assert.deepEqual(item.choices,before);
  assert.equal(Object.hasOwn(first,'acceptedAnswers'),false);
  assert.equal(Object.hasOwn(first,'spokenPrompt'),false);
 }
});

test('correct positions vary across the actual question bank instead of favouring the first option',()=>{
 const counts=[0,0,0];
 for(const item of bank.filter(item=>item.choices!.length===3)){
  const index=publicItem(item,session).choices!.findIndex(choice=>item.acceptedAnswers.includes(choice));
  assert(index>=0);counts[index]++;
 }
 for(const count of counts)assert(count>=20&&count<=40,`biased position counts: ${counts.join(', ')}`);
});

test('new sessions change options, with all positions used for the same question',()=>{
 const item=bank.find(item=>item.choices!.length===3)!;
 const counts=[0,0,0];
 const permutations=new Set<string>();
 for(let i=0;i<600;i++){
  const choices=publicItem(item,`session-${i}`).choices!;
  permutations.add(JSON.stringify(choices));
  counts[choices.findIndex(choice=>item.acceptedAnswers.includes(choice))]++;
 }
 assert.equal(permutations.size,6);
 for(const count of counts)assert(count>=160&&count<=240,`biased session counts: ${counts.join(', ')}`);
});

test('choice order never changes the deterministic marking of an answer',()=>{
 for(const item of bank)for(const answer of publicItem(item,session).choices!){
  const result=markAttempt(item,{answer,responseMs:3000,assisted:false,sessionId:session});
  assert.equal(result.correct,item.acceptedAnswers.includes(answer));
 }
});

test('non-choice questions and duplicate or small option sets are unchanged in content',()=>{
 assert.equal(shuffledChoices(undefined,'seed'),undefined);
 assert.deepEqual(shuffledChoices([],'seed'),[]);
 assert.deepEqual(shuffledChoices(['one'],'seed'),['one']);
 assert.deepEqual(shuffledChoices(['one','one','two'],'seed')!.sort(),['one','one','two']);
 for(const item of (map.skills as Skill[]).flatMap(skill=>skill.exampleItems).filter(item=>!item.choices))assert.equal(publicItem(item,session).choices,undefined);
});
