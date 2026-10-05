import 'server-only';
import type {SupabaseClient} from '@supabase/supabase-js';
import {assessmentSchedule,chooseNextItem,chooseFollowupItem,type Attempt,type Item,type LearningActivity} from './assessment';
import {items,skills,publicItem} from './catalogue';
import {completionProgress} from './presentation-progress';
export type Part='maths'|'english'|'reading';
export type SessionRow={id:string;assessment_id:string;owner_id:string;part:Part;status:string;started_at:string;completed_at:string|null};
export type RunRow={id:string;kind:'baseline'|'followup';status:string;started_at:string;completed_at:string|null};
export function attemptRows(rows:Record<string,unknown>[],kind:'baseline'|'followup'):Attempt[]{return rows.map(r=>({itemId:String(r.item_id),skillId:String(r.skill_id),correct:r.correct as boolean|null,responseMs:Number(r.response_ms),assisted:Boolean(r.assisted),likelyGuess:Boolean(r.likely_guess),sessionId:String(r.session_id),createdAt:String(r.created_at),yearLevel:Number(r.year_level) as Item['yearLevel'],sessionKind:kind==='baseline'?'baseline':'reassessment',...(r.reading_estimate===null?{}:{readingEstimate:Number(r.reading_estimate)})}));}
export async function history(db:SupabaseClient,owner:string){
 const [a,s,t,l]=await Promise.all([db.from('assessments').select('*').eq('owner_id',owner).order('started_at'),db.from('assessment_sessions').select('*').eq('owner_id',owner).order('started_at'),db.from('attempts').select('*').eq('owner_id',owner).order('created_at'),db.from('learning_sessions').select('id,started_at,completed_at').eq('owner_id',owner).not('completed_at','is',null).order('started_at')]);
 if(a.error||s.error||t.error||l.error)throw new Error('DATABASE_NOT_READY');
 return {runs:a.data as RunRow[],sessions:s.data as SessionRow[],attempts:t.data as Record<string,unknown>[],activities:l.data.map(r=>({id:r.id,kind:'learning',startedAt:r.started_at})) as LearningActivity[]};
}
export function partMatches(item:Item,part:Part){return part==='maths'?item.subject==='maths':part==='reading'?item.kind==='reading':item.subject==='english'&&item.kind!=='reading';}
export function nextQuestion(run:RunRow,session:SessionRow,h:Awaited<ReturnType<typeof history>>){
 const rowAttempts=h.attempts.filter(r=>r.assessment_id===run.id);
 const attempts=attemptRows(rowAttempts,run.kind);
 const partAttempts=attempts.filter(a=>{const item=items.find(i=>i.id===a.itemId);return item&&partMatches(item,session.part);});
 const limit=session.part==='reading'?2:12;
 if(partAttempts.length>=limit||Date.now()-Date.parse(session.started_at)>=12*60*1000)return undefined;
 const pool=items.filter(i=>partMatches(i,session.part));
 if(run.kind==='baseline')return chooseNextItem(pool.filter(i=>i.yearLevel>=1&&i.yearLevel<=2),attempts,session.part==='maths'?'maths':'english',undefined,'baseline',2);
 const baseline=h.runs.find(r=>r.kind==='baseline'&&r.status==='completed');
 const baselineAttempts=baseline?attemptRows(h.attempts.filter(a=>a.assessment_id===baseline.id),'baseline'):[];
 return chooseFollowupItem(pool,baselineAttempts,attempts,session.part==='maths'?'maths':'english');
}
export async function concludePart(db:SupabaseClient,owner:string,run:RunRow,session:SessionRow){
 const result=await db.from('assessment_sessions').update({status:'completed',completed_at:new Date().toISOString()}).eq('id',session.id).eq('owner_id',owner).eq('status','in_progress');
 if(result.error)throw new Error('SAVE_FAILED');
 const h=await history(db,owner);
 const finished=new Set(h.sessions.filter(s=>s.assessment_id===run.id&&s.status==='completed').map(s=>s.part));
 const complete=['maths','english','reading'].every(p=>finished.has(p as Part));
 if(complete){const result=await db.from('assessments').update({status:'completed',completed_at:new Date().toISOString()}).eq('id',run.id).eq('owner_id',owner).eq('status','in_progress');if(result.error)throw new Error('SAVE_FAILED');}
 const completion=completionProgress(h,run.id,session.part);
 return {sessionEnded:true,assessmentComplete:complete,assessmentId:run.id,part:session.part,completion:{...completion,strength:skills.find(s=>s.id===completion.strongSkillId)?.description}};
}
export async function sessionContext(db:SupabaseClient,owner:string,sessionId:string){
 const h=await history(db,owner);
 const session=h.sessions.find(s=>s.id===sessionId&&s.status==='in_progress');
 const run=session&&h.runs.find(r=>r.id===session.assessment_id&&r.status==='in_progress');
 if(!session||!run)throw new Error('SESSION_NOT_ACTIVE');
 return {h,session,run,item:nextQuestion(run,session,h)};
}
export function schedule(h:Awaited<ReturnType<typeof history>>){return assessmentSchedule(h.activities,new Date(),h.runs.find(r=>r.kind==='followup'&&r.status==='completed')?.completed_at);}
export function questionPayload(run:RunRow,session:SessionRow,item:Item,h:Awaited<ReturnType<typeof history>>){
 const sessions=new Set(h.sessions.filter(s=>s.assessment_id===run.id&&s.part===session.part).map(s=>s.id));
 const total=session.part==='reading'?2:12;
 const answered=Math.min(total,h.attempts.filter(a=>sessions.has(String(a.session_id))).length);
 return {assessmentId:run.id,sessionId:session.id,part:session.part,kind:run.kind,item:publicItem(item,session.id),sessionEnded:false,sessionDeadline:new Date(Date.parse(session.started_at)+12*60*1000).toISOString(),progress:{answered,total}};
}
