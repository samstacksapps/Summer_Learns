import {randomUUID} from 'node:crypto';
import type {SupabaseClient} from '@supabase/supabase-js';
import {family} from '@/lib/db';
import {failure,json,sameOrigin,uuid} from '@/lib/http';
import {boundedConversation,tutorQuestion,tutorReply,validTutorPlan,validTutorState} from '@/lib/tutor';
import {advanceTutorState,createTutorPlan,gradeTutorAnswer,initialTutorState,observationLabels,publicTutorItem,type ObservationCode,type TutorPayload,type TutorPlan,type TutorState,type TutorSubject} from '@/lib/tutor-content';
import {curatedLearning} from '@/lib/curated-learning';
export const maxDuration=45;
type Session={id:string;subject:TutorSubject;status:'in_progress'|'completed'|'stopped';revision:number;plan:TutorPlan;tutor_state:TutorState};
type DbError={code?:string;message?:string};
function dbFailure(error:DbError):never{
 if(['42P01','42703','PGRST202','PGRST204','PGRST205'].includes(error.code??''))throw new Error('TUTOR_SETUP_REQUIRED');
 if(['TUTOR_BUSY','TUTOR_STALE','TUTOR_BUDGET','TUTOR_EXPIRED'].includes(error.message??''))throw new Error(error.message);
 if(error.code==='42501')throw new Error('SIGN_IN_REQUIRED');
 if(error.code==='23514')throw new Error('TUTOR_STALE');
 throw new Error('TUTOR_SAVE_FAILED');
}
async function ownedSession(db:SupabaseClient,owner:string,id:string){const {data,error}=await db.from('learning_sessions').select('*').eq('owner_id',owner).eq('id',id).maybeSingle();if(error)dbFailure(error);if(!data||data.is_archived)throw new Error('TUTOR_STALE');if(!validTutorPlan(data.plan)||!validTutorState(data.tutor_state))throw new Error('TUTOR_STATE_INVALID');return data as Session;}
function payload(session:Session,state:TutorState,message:string,revision=session.revision):TutorPayload{
 const item=session.status==='stopped'?null:tutorQuestion(session.plan,state);
 return {sessionId:session.id,revision,subject:session.subject,focus:session.plan.focus,item:item?publicTutorItem(item):null,message,progress:{answered:state.index,total:5,correct:state.correct},complete:state.index===5,...(session.status==='stopped'?{stopped:true as const}:{}),observations:state.observations.map(code=>observationLabels[code])};
}
function tutorFailure(error:unknown){
 const reason=error instanceof Error?error.message:'';
 if(reason==='TUTOR_SETUP_REQUIRED')return json({error:'Mum needs to finish the tutor database setup before we can start lessons.',code:'tutor_setup_required'},503);
 if(reason==='BASELINE_REQUIRED')return json({error:'Finish your starting-point check first. Then we can work through lessons together.',code:'baseline_required'},409);
 if(reason==='TUTOR_NOT_CONFIGURED')return json({error:'The AI tutor is not connected yet. Ask Mum for help.',code:'tutor_not_configured'},503);
 if(reason==='TUTOR_BUSY')return json({error:'Your tutor is still finishing the previous reply. Try again in a moment.',code:'turn_in_progress'},409);
 if(['TUTOR_STALE','TUTOR_EXPIRED'].includes(reason))return json({error:'This lesson has changed. Open the lesson again to continue.',code:'stale_turn'},409);
 if(reason==='TUTOR_BUDGET')return json({error:'The tutor has reached the app’s monthly spending cap. Ask Mum for help.',code:'budget_limit'},429);
 if(reason==='TUTOR_QUOTA')return json({error:'Ask Mum to check the AI tutor’s API credit.',code:'openai_quota'},503);
 if(reason==='TUTOR_RATE_LIMIT')return json({error:'The AI tutor is busy. Your answer has not been saved; try again shortly.',code:'openai_rate_limit'},429);
 if(['TUTOR_UNAVAILABLE','TUTOR_SAVE_FAILED','TUTOR_STATE_INVALID'].includes(reason)||error instanceof Error&&['TimeoutError','AbortError'].includes(error.name))return json({error:'The tutor could not reply. Your answer has not been saved; please try again.',code:'tutor_unavailable'},502);
 if(reason==='BAD_ORIGIN')return json({error:'Please open the app and try again.'},403);
 return failure(error);
}
export async function POST(request:Request){
 let claimed:{db:SupabaseClient;sessionId:string;requestId:string}|undefined;
 let recover:{db:SupabaseClient;owner:string;sessionId:string}|undefined;
 try{
  sameOrigin(request);const {db,user}=await family();const raw=await request.text();if(raw.length>16000)return json({error:'Please keep your message short.'},400);
  let body:Record<string,unknown>;try{body=JSON.parse(raw);}catch{return json({error:'Please try that message again.'},400);}
  if(!body||!['start','respond','message','finish','stop'].includes(String(body.action))||!uuid(body.requestId))return json({error:'Please try that message again.'},400);
  const action=body.action as 'start'|'respond'|'message'|'finish'|'stop',requestId=body.requestId;
  const conversation=boundedConversation(body.conversation);if(conversation===null)return json({error:'Please keep the conversation short.'},400);
  if(action==='start'&&!['maths','english'].includes(String(body.subject)))return json({error:'Choose maths or English.'},400);
  if(action!=='start'&&(!uuid(body.sessionId)||!Number.isInteger(body.revision)||Number(body.revision)<0))return json({error:'Please return to the current lesson.'},400);
  if(action==='respond'&&(typeof body.answer!=='string'||!body.answer.trim()||body.answer.length>160||body.explanation!==undefined&&(typeof body.explanation!=='string'||body.explanation.length>1200)||body.responseMs!==undefined&&(typeof body.responseMs!=='number'||!Number.isFinite(body.responseMs)||body.responseMs<0||body.responseMs>720000)))return json({error:'Please check your answer and try again.'},400);
  if(action==='message'&&(typeof body.message!=='string'||!body.message.trim()||body.message.length>1200))return json({error:'Tell your tutor what you want to ask in a short message.'},400);
  if(action==='message'&&body.itemId!==undefined&&(typeof body.itemId!=='string'||body.itemId.length>160))return json({error:'Please return to the current question.'},400);
  let session:Session;
  if(action==='start'){
   const baseline=await db.from('assessments').select('*').eq('owner_id',user.id).eq('kind','baseline').eq('status','completed');if(baseline.error)dbFailure(baseline.error);if(!baseline.data?.some(r=>!r.is_archived))throw new Error('BASELINE_REQUIRED');
   const prior=await db.from('tutor_turns').select('session_id').eq('owner_id',user.id).eq('request_id',requestId).maybeSingle();if(prior.error)dbFailure(prior.error);
   if(prior.data)session=await ownedSession(db,user.id,prior.data.session_id);
   else{
    const active=await db.from('learning_sessions').select('id').eq('owner_id',user.id).eq('status','in_progress').limit(1).maybeSingle();if(active.error)dbFailure(active.error);
    if(active.data)session=await ownedSession(db,user.id,active.data.id);
    else{
     const subject=body.subject as TutorSubject;
     const version=await db.rpc('curated_learning_version');if(version.error)throw new Error('TUTOR_SETUP_REQUIRED');
     const curated=await curatedLearning(db,user.id);
     const choices=curated.recommendations.filter(r=>r.subject===subject);
     const focus=body.topicId===undefined?choices[0]:choices.find(r=>r.topicId===body.topicId);
     if(!focus)return json({error:'Choose an available lesson.'},400);
     const inserted=await db.from('learning_sessions').insert({owner_id:user.id,subject,status:'in_progress',revision:0,plan:createTutorPlan(subject,randomUUID(),focus),tutor_state:initialTutorState()}).select('id').single();
     if(inserted.error?.code==='23505'){
      const retry=await db.from('learning_sessions').select('id').eq('owner_id',user.id).eq('status','in_progress').limit(1).single();if(retry.error)dbFailure(retry.error);session=await ownedSession(db,user.id,retry.data.id);
     }else{if(inserted.error)dbFailure(inserted.error);session=await ownedSession(db,user.id,inserted.data.id);}
    }
   }
  }else session=await ownedSession(db,user.id,body.sessionId as string);
  recover={db,owner:user.id,sessionId:session.id};
  const expectedRevision=action==='start'?session.revision:Number(body.revision);
  const claim=await db.rpc('claim_tutor_turn',{p_session_id:session.id,p_request_id:requestId,p_expected_revision:expectedRevision,p_action:action,p_cost_cents:['start','respond','message'].includes(action)?3:0});
  if(claim.error)dbFailure(claim.error);
  if(claim.data?.response)return json(claim.data.response);
  if(claim.data?.claimed!==true)throw new Error('TUTOR_SAVE_FAILED');
  claimed={db,sessionId:session.id,requestId};
  // Stop may overtake a pending reply, so use the authoritative row after claiming it.
  if(action==='stop')session=await ownedSession(db,user.id,session.id);
  const revision=Number(claim.data.revision??session.revision)+1;
  const oldState=session.tutor_state,item=tutorQuestion(session.plan,oldState);let state={...oldState},attempt:Record<string,unknown>|null=null,replyMessage='',replyItem=item,alreadyAnswered=false,previousCorrect:boolean|undefined;
  if(action==='finish'&&oldState.index<5)throw new Error('TUTOR_STALE');
  if(action==='respond'){
   if(!item)throw new Error('TUTOR_STALE');const correct=gradeTutorAnswer(item,body.answer as string);
   attempt={item_id:item.id,skill_id:item.skillId,year_level:item.yearLevel,correct,assisted:oldState.helped,response_ms:Math.round(Number(body.responseMs??0))};state=advanceTutorState(oldState,correct);
  }else if(action==='message'){
   if(body.itemId!==undefined&&body.itemId!==item?.id){
    const latest=await db.from('learning_attempts').select('item_id,correct').eq('owner_id',user.id).eq('session_id',session.id).order('created_at',{ascending:false}).limit(1).maybeSingle();if(latest.error)dbFailure(latest.error);
    const graded=latest.data&&latest.data.item_id===body.itemId?session.plan.items.flatMap(slot=>[slot.year1,slot.year2]).find(question=>question.id===body.itemId):undefined;
    if(!graded)throw new Error('TUTOR_STALE');replyItem=graded;alreadyAnswered=true;previousCorrect=Boolean(latest.data!.correct);
   }else state={...state,helped:true};
  }
  if(action==='stop')replyMessage='You can come back to another lesson when you are ready.';
  else if(action==='finish')replyMessage='Lesson done. Your learning progress is saved.';
  else{
   const memories=await db.from('learning_sessions').select('*').eq('owner_id',user.id).eq('status','completed').order('started_at',{ascending:false}).limit(8);if(memories.error)dbFailure(memories.error);
   const previousObservations=[...new Set((memories.data??[]).filter(row=>!row.is_archived).flatMap(row=>validTutorState(row.tutor_state)?row.tutor_state.observations:[]))].slice(0,8) as ObservationCode[];
   const reply=await tutorReply({action,subject:session.subject,state,item:replyItem,alreadyAnswered:alreadyAnswered||action==='respond',correct:attempt?.correct as boolean|undefined??previousCorrect,answer:body.answer as string|undefined,explanation:body.explanation as string|undefined,message:body.message as string|undefined,conversation,previousObservations},request.signal);
   state={...state,observations:[...new Set([...state.observations,...reply.observations])].slice(0,8)};replyMessage=reply.message;
  }
  const response=payload({...session,status:action==='stop'?'stopped':session.status},state,replyMessage,revision);
  if(attempt)response.result={correct:attempt.correct as boolean,assisted:attempt.assisted as boolean,yearLevel:attempt.year_level as 1|2};
  const saved=await db.rpc('commit_tutor_turn',{p_session_id:session.id,p_request_id:requestId,p_state:state,p_response:response,p_attempt:attempt,p_finish:action!=='stop'&&state.index===5,p_stop:action==='stop'});
  if(saved.error)dbFailure(saved.error);claimed=undefined;return json(saved.data?.response??saved.data??response);
 }catch(error){
  if(claimed){try{await claimed.db.rpc('fail_tutor_turn',{p_session_id:claimed.sessionId,p_request_id:claimed.requestId});}catch{}}
  if(error instanceof Error&&['TUTOR_STALE','TUTOR_EXPIRED'].includes(error.message)&&recover){try{const current=await ownedSession(recover.db,recover.owner,recover.sessionId);return json({error:'This lesson changed in another tab. Here is your latest saved question.',code:'stale_turn',current:payload(current,current.tutor_state,'Here is your latest saved question.')},409);}catch{}}
  return tutorFailure(error);
 }
}
