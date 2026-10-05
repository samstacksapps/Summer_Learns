import {family} from '@/lib/db';
import {failure,json,sameOrigin,uuid} from '@/lib/http';
import {sessionContext} from '@/lib/progress';
import {speech} from '@/lib/voice';
import {fixedVoicePath} from '@/lib/fixed-voice';
export async function POST(request:Request){try{
 sameOrigin(request);const {db,user}=await family();const body=await request.json();
 const fixed=fixedVoicePath(body.line);
 if(fixed)return new Response(null,{status:303,headers:{Location:fixed,'Cache-Control':'no-store'}});
 let text:string|undefined;
 if(body.line==='item'&&uuid(body.sessionId)){
  const {item}=await sessionContext(db,user.id,body.sessionId);
  if(item&&item.id===body.itemId)text=item.spokenPrompt;
 }
 if(!text)return json({error:'Choose the current instruction’s speaker button.'},400);
 const audio=await speech(db,text);
 return new Response(audio,{headers:{'Content-Type':'audio/mpeg','Cache-Control':'no-store'}});
}catch(error){return failure(error);}}
