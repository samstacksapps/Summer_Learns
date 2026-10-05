import 'server-only';
import type {SupabaseClient} from '@supabase/supabase-js';
import {history,nextQuestion,questionPayload,concludePart,type RunRow} from './progress';
import {completionProgress} from './presentation-progress';
import {skills} from './catalogue';
import {savedAttempt,needsCompletionRepair,savedFeedback} from './recovery-policy';

export async function repairCompletedRun(db:SupabaseClient,owner:string,run:RunRow,h:Awaited<ReturnType<typeof history>>){
 if(!needsCompletionRepair(run,h.sessions))return run;
 const result=await db.from('assessments').update({status:'completed',completed_at:new Date().toISOString()}).eq('id',run.id).eq('owner_id',owner).eq('status','in_progress');
 if(result.error)throw new Error('SAVE_FAILED');
 // The conditional update may also have been completed by a parallel request.
 const {data,error}=await db.from('assessments').select('*').eq('id',run.id).eq('owner_id',owner).single();
 if(error||!data||data.status!=='completed')throw new Error('SAVE_FAILED');
 return data as RunRow;
}

/** Retry after a committed save returns current state without saving/charging again. */
export async function recoverSavedResponse(db:SupabaseClient,owner:string,sessionId:string,itemId:string,h?:Awaited<ReturnType<typeof history>>){
 const state=h??await history(db,owner),saved=savedAttempt(state,owner,sessionId,itemId);
 if(!saved)return undefined;
 const run=await repairCompletedRun(db,owner,saved.run,state),session=saved.session;
 const extra={recovered:true,feedback:savedFeedback(saved.attempt)};
 if(run.status==='in_progress'&&session.status==='in_progress'){
  const item=nextQuestion(run,session,state);
  return item?{...questionPayload(run,session,item,state),...extra,...(session.part!=='reading'?{brainBreak:state.attempts.filter(a=>a.session_id===session.id).length%4===0}:{})}:{...await concludePart(db,owner,run,session),...extra};
 }
 const completion=completionProgress(state,run.id,session.part);
 return {sessionEnded:true,assessmentComplete:run.status==='completed',assessmentId:run.id,part:session.part,
  ...(session.status==='stopped'&&run.status!=='completed'?{stopped:true}:{}),
  completion:{...completion,strength:skills.find(skill=>skill.id===completion.strongSkillId)?.description},...extra};
}
