import {family} from '@/lib/db';
import {failure,json,sameOrigin,uuid} from '@/lib/http';
import {sessionContext,history,nextQuestion,concludePart,questionPayload} from '@/lib/progress';
import {markAttempt} from '@/lib/assessment';
export async function POST(request:Request){try{
 sameOrigin(request);const {db,user}=await family();const body=await request.json();
 if(!uuid(body.sessionId)||typeof body.itemId!=='string'||typeof body.answer!=='string'||body.answer.length>160||typeof body.responseMs!=='number'||!Number.isFinite(body.responseMs)||body.responseMs<0||body.responseMs>12*60*1000)return json({error:'Please try that answer again.'},400);
 const {session,run,item}=await sessionContext(db,user.id,body.sessionId);
 if(!item)return json(await concludePart(db,user.id,run,session));
 if(item.id!==body.itemId||(item.kind==='reading'&&body.answer!==''))return json({error:'Please return to the current question.'},409);
 const attempt=markAttempt(item,{answer:body.answer,responseMs:Math.round(body.responseMs),assisted:body.assisted===true,sessionId:session.id,sessionKind:run.kind==='baseline'?'baseline':'reassessment'});
 const {error}=await db.from('attempts').insert({owner_id:user.id,assessment_id:run.id,session_id:session.id,item_id:item.id,skill_id:item.skillId,correct:attempt.correct,response_ms:attempt.responseMs,assisted:attempt.assisted,likely_guess:attempt.likelyGuess,year_level:item.yearLevel});
 if(error)throw new Error('SAVE_FAILED');
 const h=await history(db,user.id);const next=nextQuestion(run,session,h);
 const feedback=attempt.correct===null?'skip':attempt.likelyGuess?'rush':attempt.correct?'good':'try';
 if(!next)return json({...await concludePart(db,user.id,run,session),feedback});
 return json({...questionPayload(run,session,next,h),feedback,brainBreak:h.attempts.filter(a=>a.session_id===session.id).length%4===0});
}catch(error){return failure(error);}}
