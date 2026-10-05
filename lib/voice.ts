import 'server-only';
import models from './config/models.json';
import {randomUUID} from 'node:crypto';
import type {SupabaseClient} from '@supabase/supabase-js';
export const voiceConfig=models;
export const lines:Record<string,string>={
 hello:'Hi, Summer! I’m your computer voice. A little gecko told me you’re ready for a warm-up challenge. Small steps. Let’s give it a gecko!',
 start:'Let’s try a few little questions. There is no rush. You can stop whenever you need a break.',
 maths:'A little maths. Have a listen, then type your answer.',
 english:'A little word magic. Have a listen, then type or tap your answer.',
 reading:'Read the little story aloud. Mum can help you start the microphone. We will save it so Mum can listen later.',
 spelling:'Listen to the word and its sentence. Then type the word. You can listen again.',
 good:'You gave that a go. Nice effort. Let’s try the next one.',
 skip:'Thanks for telling me. We can try that another time.',
 try:'That one needs another little go. We can practise it later. Here comes a different one.',
 rush:'Whoa, speedy! Let’s read that one again together. We’ll check it another time.',
 hint:'Take your time. Think about the first little step. Mum can help you work it through. This answer will be marked as helped.',
 break:'Time for a silly brain break. Do your best goanna walk. When you’re ready, we can stop or keep going.',
 finish:'You did some good trying today! Here’s a joke. What do you call a lizard that sings? A rap-tile! See you for another little go.',
 win:'One last little win. Can you tap your friendly gecko? There it is! Thanks for giving it a go.',
 stop:'Good stopping. Your little tries are saved. We can come back when you are ready.',
 recording:'Tap the microphone, then read the little story. Tap stop when you’re done.',
 replay:'You can tap the speaker to hear those words again.',
 home:'Hi, Summer! Small steps. Lots of little wins. Tap Let’s go when you are ready.',
 menu:'Home. Learn. Beat My Score. Me.'
};
export async function reserveVoice(db:SupabaseClient,kind:'tts'|'transcription',cents:number){
 const {data,error}=await db.rpc('reserve_voice_spend',{p_kind:kind,p_amount_cents:cents,p_request_id:randomUUID(),p_monthly_limit_cents:1500});
 if(error)throw new Error('VOICE_BUDGET_UNAVAILABLE');
 if(data!==true)throw new Error('BUDGET_LIMIT');
}
export async function speech(db:SupabaseClient,input:string){
 if(!process.env.SUMMER_OPENAI_KEY)throw new Error('VOICE_NOT_CONFIGURED');
 // A deliberately generous reservation, not the OpenAI invoice. Fails closed if the cap cannot be reserved.
 await reserveVoice(db,'tts',Math.max(2,Math.ceil(input.length/150)));
 const response=await fetch('https://api.openai.com/v1/audio/speech',{method:'POST',headers:{Authorization:`Bearer ${process.env.SUMMER_OPENAI_KEY}`,'Content-Type':'application/json'},body:JSON.stringify({model:models.speech,voice:models.voice,input,response_format:models.speechFormat,instructions:'Warm, clear Australian English. Speak slowly for a child learning to read. Short gentle pauses. Do not add words.',speed:0.9}),signal:AbortSignal.timeout(30000)});
 if(!response.ok){let code='';try{const detail=await response.json();code=String(detail.error?.code||'');}catch{}if(['credit_balance_exhausted','insufficient_quota'].includes(code))throw new Error('OPENAI_QUOTA');if(response.status===429)throw new Error('OPENAI_RATE_LIMIT');throw new Error('VOICE_FAILED');}
 return response.arrayBuffer();
}
export {estimateReading} from './reading-score';
