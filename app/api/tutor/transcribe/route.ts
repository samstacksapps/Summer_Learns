import {family} from '@/lib/db';
import {failure,json,sameOrigin} from '@/lib/http';
import {reserveVoice,voiceConfig} from '@/lib/voice';

export const maxDuration=60;
export async function POST(request:Request){try{
 sameOrigin(request);const {db}=await family();
 if(!process.env.SUMMER_OPENAI_KEY)throw new Error('VOICE_NOT_CONFIGURED');
 if(Number(request.headers.get('content-length')||0)>5*1024*1024)return json({error:'Try a shorter explanation, under one minute.'},413);
 const form=await request.formData(),audio=form.get('audio'),duration=Number(form.get('durationMs'));
 if(!(audio instanceof File)||audio.size<100||audio.size>4*1024*1024||!Number.isFinite(duration)||duration<500||duration>65000)return json({error:'Record a short explanation, under one minute.'},400);
 const mime=audio.type.split(';')[0],extensions:Record<string,string>={'audio/mp4':'m4a','audio/webm':'webm','audio/wav':'wav','audio/mpeg':'mp3','audio/ogg':'ogg'};
 if(!Object.hasOwn(extensions,mime))return json({error:'Try recording in Safari or Chrome.'},400);
 await reserveVoice(db,'transcription',Math.max(2,Math.ceil(duration/10000)));
 const upload=new FormData();upload.set('file',audio,`explanation.${extensions[mime]}`);upload.set('model',voiceConfig.transcription);upload.append('languages[]','en');
 const response=await fetch('https://api.openai.com/v1/audio/transcriptions',{method:'POST',headers:{Authorization:`Bearer ${process.env.SUMMER_OPENAI_KEY}`},body:upload,signal:AbortSignal.any([request.signal,AbortSignal.timeout(40000)])});
 if(!response.ok){if(response.status===429)throw new Error('OPENAI_RATE_LIMIT');throw new Error('TRANSCRIPTION_FAILED');}
 const result=await response.json();
 if(typeof result.text!=='string'||!result.text.trim())return json({error:'I couldn’t hear that clearly. Try again, or type your thinking.'},422);
 // No recording or transcript is written to the database. Summer can check
 // the recognised words before sending them to the tutor.
 return json({text:result.text.trim().slice(0,1000)});
}catch(error){return failure(error);}}
