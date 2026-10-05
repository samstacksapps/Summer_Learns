import {family} from '@/lib/db';
import {json,failure,sameOrigin,uuid} from '@/lib/http';
import {sessionContext,history,nextQuestion,concludePart,questionPayload} from '@/lib/progress';
import {voiceConfig,reserveVoice,estimateReading} from '@/lib/voice';
export const maxDuration=60;
export async function POST(request:Request){try{
 sameOrigin(request);if(Number(request.headers.get('content-length')||0)>6*1024*1024)return json({error:'That recording is too large. Please try a shorter little story.'},413);
 const {db,user}=await family();const form=await request.formData();const sid=form.get('sessionId'),itemId=form.get('itemId'),audio=form.get('audio');
 if(!uuid(sid)||typeof itemId!=='string'||!(audio instanceof File)||audio.size>5*1024*1024||audio.size<100)return json({error:'Please record a short reading first.'},400);
 const allowed=['audio/mp4','audio/webm','audio/wav','audio/mpeg'];
 const mime=audio.type.split(';')[0];if(!allowed.includes(mime))return json({error:'This browser’s recording format is not supported. Try Safari on your iPhone or Chrome on your laptop.'},400);
 const {session,run,item}=await sessionContext(db,user.id,sid);
 if(!item)return json(await concludePart(db,user.id,run,session));
 if(item.id!==itemId||item.kind!=='reading'||!item.passage)return json({error:'Please return to the current reading.'},409);
 const duration=Number(form.get('durationMs'));if(!Number.isFinite(duration)||duration<500||duration>65000)return json({error:'Keep this reading under one minute, please.'},400);
 let estimate:number|null=null;
 if(process.env.SUMMER_OPENAI_KEY){
  try{
   await reserveVoice(db,'transcription',Math.max(2,Math.ceil(duration/10000)));
   const upload=new FormData();upload.set('file',audio,`reading.${mime==='audio/mp4'?'m4a':mime==='audio/webm'?'webm':mime==='audio/ogg'?'ogg':mime==='audio/mpeg'?'mp3':'wav'}`);upload.set('model',voiceConfig.transcription);upload.append('languages[]','en');
   // Do not supply the passage as a transcription prompt: that encourages the expected words.
   const response=await fetch('https://api.openai.com/v1/audio/transcriptions',{method:'POST',headers:{Authorization:`Bearer ${process.env.SUMMER_OPENAI_KEY}`},body:upload,signal:AbortSignal.timeout(40000)});
   if(response.ok){const result=await response.json();if(typeof result.text==='string'){estimate=estimateReading(item.passage,result.text);}}
  }catch{/* Retain recording for Mum's review even when transcription is unavailable. */}
 }
 // Save the audio even if transcription failed. Initial estimates are immutable; no transcript is persisted.
 const {data:recording,error}=await db.rpc('save_reading_attempt',{p_assessment_id:run.id,p_session_id:session.id,p_item_id:item.id,p_skill_id:item.skillId,p_year_level:item.yearLevel,p_audio_base64:Buffer.from(await audio.arrayBuffer()).toString('base64'),p_mime_type:mime,p_reading_estimate:estimate,p_response_ms:Math.round(duration),p_assisted:form.get('assisted')==='true'});
 if(error||!recording)throw new Error('SAVE_FAILED');
 const h=await history(db,user.id),next=nextQuestion(run,session,h);
 const result=next?questionPayload(run,session,next,h):await concludePart(db,user.id,run,session);
 return json({...result,feedback:'good',recordingSaved:true,readingEstimateAvailable:estimate!==null});
}catch(error){return failure(error);}}
