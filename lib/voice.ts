import 'server-only';
import models from './config/models.json';
import {randomUUID} from 'node:crypto';
import type {SupabaseClient} from '@supabase/supabase-js';
import {AudioCache} from './audio-cache';
export const voiceConfig=models;
export const lines:Record<string,string>={
 hello:'Hi, Summer. I’m your computer voice. Let’s find your starting point.',
 start:'Try a few questions. There’s no rush. You can stop for a break.',
 maths:'Maths. Have a listen, then type your answer.',
 english:'English. Have a listen, then type or tap your answer.',
 reading:'Read the passage aloud. Mum can help with the microphone. Your reading will be saved so Mum can listen later.',
 spelling:'Listen to the word and its sentence. Then type the word. You can listen again.',
 good:'Answer saved. Nice work.',
 skip:'Thanks for telling me. We can try that another time.',
 try:'We can practise that one later.',
 rush:'Take your time. Let’s check that one again.',
 hint:'Take your time. Think about the first step. Mum can help.',
 break:'Time for a movement break. Try a goanna walk, then come back when you’re ready.',
 finish:'You kept going and gave it a try. We’ll build from here.',
 win:'Session done. Nice work. Your answers are saved.',
 stop:'Your answers are saved. We can come back when you’re ready.',
 recording:'Tap the microphone and read the passage. Tap stop when you’re done.',
 replay:'Tap the speaker to hear the words again.',
 home:'Hi, Summer. Take your time. Choose your warm-up when you’re ready.',
 menu:'Home. Learn. Progress. Me.'
};
// Only these fixed, non-personal instructions are shared between authenticated requests.
// Question audio stays in the current browser's volatile cache; no recordings are cached here.
const fixedAudio=new AudioCache<ArrayBuffer>({maxEntries:24,maxBytes:8*1024*1024,sizeOf:audio=>audio.byteLength,ttlMs:6*60*60*1000});
export async function reserveVoice(db:SupabaseClient,kind:'tts'|'transcription',cents:number){
 const {data,error}=await db.rpc('reserve_voice_spend',{p_kind:kind,p_amount_cents:cents,p_request_id:randomUUID(),p_monthly_limit_cents:1500});
 if(error)throw new Error('VOICE_BUDGET_UNAVAILABLE');
 if(data!==true)throw new Error('BUDGET_LIMIT');
}
export async function speech(db:SupabaseClient,input:string,cacheFixedLine=false){
 if(!process.env.SUMMER_OPENAI_KEY)throw new Error('VOICE_NOT_CONFIGURED');
 const generate=async()=>{
 // A deliberately generous reservation, not the OpenAI invoice. Fails closed if the cap cannot be reserved.
 await reserveVoice(db,'tts',Math.max(2,Math.ceil(input.length/150)));
 const response=await fetch('https://api.openai.com/v1/audio/speech',{method:'POST',headers:{Authorization:`Bearer ${process.env.SUMMER_OPENAI_KEY}`,'Content-Type':'application/json'},body:JSON.stringify({model:models.speech,voice:models.voice,input,response_format:models.speechFormat,instructions:models.speechInstructions,speed:models.speechSpeed}),signal:AbortSignal.timeout(30000)});
 if(!response.ok){let code='';try{const detail=await response.json();code=String(detail.error?.code||'');}catch{}if(['credit_balance_exhausted','insufficient_quota'].includes(code))throw new Error('OPENAI_QUOTA');if(response.status===429)throw new Error('OPENAI_RATE_LIMIT');throw new Error('VOICE_FAILED');}
 const audio=await response.arrayBuffer();
 if(!audio.byteLength)throw new Error('VOICE_FAILED');
 return audio;
 };
 return cacheFixedLine?fixedAudio.get(`${models.voiceRevision}:${input}`,generate):generate();
}
export {estimateReading} from './reading-score';
