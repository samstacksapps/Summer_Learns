import type {Attempt,Subject} from './assessment';
import {isIndependent} from './assessment';
export type Recommendation={topicId:string;subject:Subject;title:string;yearLevel:1|2;reason:string;independentAnswers:number;correct:number};
export const lessonTopics=[
 ['maths','place-value','Tens, ones and hundreds',0,['maths-y1-tens-and-ones','maths-y2-hundreds-tens-ones']],
 ['maths','counting','Counting and equal groups',1,['maths-y1-skip-count-2-5-10','maths-y2-equal-groups']],
 ['maths','addition','Addition strategies',2,['maths-y1-add-within-20','maths-y2-add-two-digits']],
 ['maths','subtraction','Subtraction strategies',3,['maths-y1-subtract-within-20','maths-y2-subtract-two-digits']],
 ['maths','measurement','Measuring length',4,['maths-y2-measure-equal-units']],
 ['maths','money','Australian coins',7,['maths-y1-recognise-money-values','maths-y2-money-values']],
 ['maths','time','Reading time',8,['maths-y1-hour-half-hour','maths-y2-time-duration']],
 ['maths','shapes','Shape properties',11,['maths-y1-shape-features','maths-y2-solid-shapes']],
 ['english','story-clues','Stories and clues',0,['english-y1-story-order','english-y2-cause-and-effect']],
 ['english','word-meaning','What words mean',1,['english-y1-everyday-word-meaning','english-y2-meaning-from-context']],
 ['english','word-parts','Spelling and word endings',2,['english-y1-spell-consonant-blends','english-y2-spell-simple-suffixes']],
 ['english','vowel-patterns','Spelling patterns',3,['english-y1-spell-digraphs','english-y2-spell-long-vowels']],
] as const;
/** Recent independent evidence guides practice; this never assigns a whole-year grade or declares mastery. */
export function recommendLessons(attempts:Attempt[]):Recommendation[]{
 return lessonTopics.map(([subject,topicId,title,,skillIds])=>{
  const evidence=attempts.filter(a=>(skillIds as readonly string[]).includes(a.skillId)&&isIndependent(a)).sort((a,b)=>a.createdAt.localeCompare(b.createdAt)).slice(-4);
  const correct=evidence.filter(a=>a.correct).length,last=evidence.at(-1);
  const needs=evidence.some(a=>!a.correct);
  const recentSuccess=evidence.slice(-2).length===2&&evidence.slice(-2).every(a=>a.correct);
  const yearLevel:1|2=last&&last.yearLevel===1&&!recentSuccess?1:2;
  const reason=!evidence.length?'A skill we still need to check.':recentSuccess?'Build on your recent independent answers.':needs?'Revisit this skill after a tricky answer.':'Try a fresh question to check your understanding.';
  return {topicId,subject,title,yearLevel,reason,independentAnswers:evidence.length,correct,priority:!recentSuccess&&needs?0:!evidence.length?1:2};
 }).sort((a,b)=>a.priority-b.priority).map(({priority:_,...r})=>r);
}
