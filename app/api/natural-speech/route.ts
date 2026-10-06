import {family} from '@/lib/db';
import {failure,json,sameOrigin,uuid} from '@/lib/http';
import {sessionContext} from '@/lib/progress';
import {naturalSpeech} from '@/lib/natural-speech';
import config from '@/lib/config/natural-voice.json';
export const maxDuration=40;
export async function GET(request:Request){try{
 sameOrigin(request);if(request.headers.get('sec-fetch-site')==='cross-site')return json({error:'Open the app to hear your tutor.'},403);
 const {db,user}=await family();const p=new URL(request.url).searchParams;
 const voice=p.get('voice')??config.defaultVoice,sessionId=p.get('sessionId');let text='';
 if(!config.voices.includes(voice)||!uuid(sessionId))return json({error:'Choose the current speaker button.'},400);
 if(p.get('line')==='item'){
  const {item}=await sessionContext(db,user.id,sessionId);if(item?.id===p.get('itemId'))text=item.spokenPrompt;
 }else if(p.get('line')==='tutor'){
  const revision=Number(p.get('revision')),segment=p.get('segment');
  if(!Number.isInteger(revision)||revision<1||!['reply','question','both'].includes(segment??''))return json({error:'Return to your lesson.'},400);
  const session=await db.from('learning_sessions').select('*').eq('owner_id',user.id).eq('id',sessionId).maybeSingle();
  if(session.error||!session.data||session.data.is_archived)return json({error:'This lesson is no longer available.'},409);
  const receipt=await db.from('tutor_turns').select('response').eq('owner_id',user.id).eq('session_id',sessionId).eq('status','completed').contains('response',{revision}).gt('expires_at',new Date().toISOString()).limit(1).maybeSingle();
  const payload=receipt.data?.response;
  if(receipt.error||!payload||payload.sessionId!==sessionId)return json({error:'Reopen the lesson to hear your tutor.'},409);
  const reply=typeof payload.message==='string'?payload.message:'';
  const question=payload.item?`${payload.item.passage??''} ${payload.item.prompt??''}`.trim():'';
  text=segment==='reply'?reply:segment==='question'?question:`${reply} ${question}`.trim();
 }
 if(!text)return json({error:'Choose the current speaker button.'},400);
 // Authorisation is rechecked even for a buffered replay. Ignore Range: send the complete MP3.
 const audio=await naturalSpeech(db,user.id,text,voice);
 return new Response(audio,{headers:{'Content-Type':'audio/mpeg','Cache-Control':'private, no-store','Accept-Ranges':'none','X-Content-Type-Options':'nosniff'}});
}catch(error){return failure(error);}}
