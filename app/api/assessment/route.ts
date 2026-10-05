import {family} from '@/lib/db';
import {json,failure,sameOrigin,uuid} from '@/lib/http';
import {history,schedule,nextQuestion,concludePart,questionPayload,type Part,type SessionRow} from '@/lib/progress';
export async function POST(request:Request){try{
 sameOrigin(request);const {db,user}=await family();const body=await request.json();if(!['start','stop'].includes(body.action))return json({error:'Choose start or stop.'},400);let h=await history(db,user.id);
 if(body.action==='stop'&&!uuid(body.sessionId))return json({error:'Please return to the current session.'},400);
 if(body.action==='stop'&&uuid(body.sessionId)){
  const session=h.sessions.find(s=>s.id===body.sessionId&&s.status==='in_progress');if(!session)return json({error:'This little session has already stopped.'},409);
  const {error}=await db.from('assessment_sessions').update({status:'stopped',completed_at:new Date().toISOString()}).eq('id',session.id).eq('owner_id',user.id);
  if(error)throw new Error('SAVE_FAILED');return json({stopped:true});
 }
 if(!process.env.SUMMER_OPENAI_KEY)throw new Error('VOICE_NOT_CONFIGURED');
 // Curriculum topic draft must be verified before a child-facing assessment starts.
 const {curriculumVerified}=await import('@/lib/catalogue');
 if(!curriculumVerified)return json({error:'Mum: the curriculum links still need verification before Summer uses this warm-up.',code:'curriculum_review_pending'},503);
 const baseline=h.runs.find(r=>r.kind==='baseline'&&r.status==='completed');
 const kind=baseline?'followup':'baseline';
 if(kind==='followup'&&!schedule(h).isDue)return json({error:'The next warm-up will be offered after four weeks of learning. No need to rush.'},409);
 let run=h.runs.find(r=>r.kind===kind&&r.status==='in_progress');
 if(!run){const {data,error}=await db.from('assessments').insert({owner_id:user.id,kind}).select('*').single();if(error?.code==='23505'){const retry=await db.from('assessments').select('*').eq('owner_id',user.id).eq('kind',kind).eq('status','in_progress').single();if(retry.error||!retry.data)throw new Error('SAVE_FAILED');run=retry.data;}else{if(error||!data)throw new Error('SAVE_FAILED');run=data;}}
 if(!run)throw new Error('SAVE_FAILED');
 const finished=new Set(h.sessions.filter(s=>s.assessment_id===run.id&&s.status==='completed').map(s=>s.part));
 const part=(['maths','english','reading'] as Part[]).find(p=>!finished.has(p));
 if(!part)return json({sessionEnded:true,assessmentComplete:true});
 let session=h.sessions.find(s=>s.assessment_id===run.id&&s.part===part&&s.status==='in_progress');
 if(!session){const {data,error}=await db.from('assessment_sessions').insert({assessment_id:run.id,owner_id:user.id,part}).select('*').single();if(error?.code==='23505'){const retry=await db.from('assessment_sessions').select('*').eq('assessment_id',run.id).eq('owner_id',user.id).eq('part',part).eq('status','in_progress').single();if(retry.error||!retry.data)throw new Error('SAVE_FAILED');session=retry.data as SessionRow;}else{if(error||!data)throw new Error('SAVE_FAILED');session=data as SessionRow;}}
 h=await history(db,user.id);const item=nextQuestion(run,session,h);
 if(!item)return json(await concludePart(db,user.id,run,session));
 return json(questionPayload(run,session,item));
}catch(error){return failure(error);}}
