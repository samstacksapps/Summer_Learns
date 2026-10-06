import 'server-only';
import {createHash} from 'node:crypto';
import type {SupabaseClient} from '@supabase/supabase-js';
import config from './config/natural-voice.json';
import {reserveVoice} from './voice';
type Generated={stream:ReadableStream<Uint8Array>;audio:Promise<ArrayBuffer>;delivered:boolean};
const cache=new Map<string,{until:number;result:Promise<Generated>}>();
/** Private in-process replay buffer: 16 entries, <=2 MiB each, 90 seconds. */
export async function naturalSpeech(db:SupabaseClient,owner:string,text:string,voice:string){
 if(!config.voices.includes(voice)||!text.trim()||text.length>6000)throw new Error('VOICE_FAILED');
 if(!process.env.SUMMER_OPENAI_KEY)throw new Error('VOICE_NOT_CONFIGURED');
 for(const [key,entry] of cache)if(entry.until<Date.now())cache.delete(key);
 const key=createHash('sha256').update(JSON.stringify([owner,config.revision,voice,text])).digest('hex');
 let entry=cache.get(key);
 if(!entry){
  if(cache.size>=16)throw new Error('OPENAI_RATE_LIMIT');
  const result=(async()=>{
   await reserveVoice(db,'tts',Math.max(2,Math.ceil(text.length/150)));
   const response=await fetch('https://api.openai.com/v1/audio/speech',{method:'POST',headers:{Authorization:`Bearer ${process.env.SUMMER_OPENAI_KEY}`,'Content-Type':'application/json'},body:JSON.stringify({model:config.model,voice,input:text,instructions:config.instructions,speed:config.speed,response_format:'mp3'}),signal:AbortSignal.timeout(30000)});
   if(!response.ok||!response.body||!response.headers.get('content-type')?.startsWith('audio/'))throw new Error(response.status===429?'OPENAI_RATE_LIMIT':'VOICE_FAILED');
   const [stream,copy]=response.body.tee();
   const audio=(async()=>{const reader=copy.getReader(),chunks:Uint8Array[]=[];let bytes=0;while(true){const next=await reader.read();if(next.done)break;bytes+=next.value.byteLength;if(bytes>2*1024*1024){void reader.cancel();throw new Error('VOICE_FAILED');}chunks.push(next.value);}if(!bytes)throw new Error('VOICE_FAILED');const result=new Uint8Array(bytes);let at=0;for(const chunk of chunks){result.set(chunk,at);at+=chunk.byteLength;}return result.buffer;})();
   void audio.catch(()=>cache.delete(key));
   return {stream,audio,delivered:false};
  })();
  entry={until:Date.now()+90000,result};cache.set(key,entry);const recorded=entry;setTimeout(()=>{if(cache.get(key)===recorded)cache.delete(key);},90000).unref();void result.catch(()=>cache.delete(key));
 }
 const generated=await entry.result;
 if(!generated.delivered){generated.delivered=true;return generated.stream;}
 return await generated.audio;
}
