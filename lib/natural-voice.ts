import config from './config/natural-voice.json';
import type {FixedVoiceLine} from './fixed-voice';
export type NaturalVoice='coral'|'nova'|'shimmer';
export const naturalVoices=config.voices as NaturalVoice[];
export function preferredVoice():NaturalVoice{try{const saved=localStorage.getItem('summer.natural-voice.v1');if(naturalVoices.includes(saved as NaturalVoice))return saved as NaturalVoice;}catch{}return config.defaultVoice as NaturalVoice;}
export function chooseVoice(voice:NaturalVoice){if(!naturalVoices.includes(voice))throw new Error('Choose one of the preview voices.');try{localStorage.setItem('summer.natural-voice.v1',voice);}catch{throw new Error('This browser could not save the voice choice.');}}
export type VoiceSource={line:FixedVoiceLine}|{line:'item';sessionId:string;itemId:string}|{line:'tutor';sessionId:string;revision:number;segment:'reply'|'question'|'both'};
let player:HTMLAudioElement|undefined,stop:(()=>void)|undefined;
export function cancelNatural(){stop?.();}
export function playNatural(source:VoiceSource,onStart?:()=>void,signal?:AbortSignal):Promise<'played'|'cancelled'>{
 if(signal?.aborted)return Promise.resolve('cancelled');
 cancelNatural();player??=new Audio();const audio=player;
 const voice=preferredVoice();
 const url=source.line==='item'||source.line==='tutor'?'/api/natural-speech?'+new URLSearchParams({...Object.fromEntries(Object.entries(source).map(([key,value])=>[key,String(value)])),voice}):`/audio/${config.revision}/${voice}-${source.line}.mp3`;
 return new Promise((resolve,reject)=>{
  let finished=false,started=false;
  const timer=setTimeout(()=>finish(new Error('The voice could not start. Tap the speaker to try again.')),20000);
  const endTimer=setTimeout(()=>finish(new Error('The voice stopped responding. Tap the speaker to try again.')),180000);
  const abort=()=>finish();
  function finish(error?:Error,played=false){if(finished)return;finished=true;clearTimeout(timer);clearTimeout(endTimer);signal?.removeEventListener('abort',abort);audio.onplaying=null;audio.onended=null;audio.onerror=null;audio.pause();audio.removeAttribute('src');audio.load();stop=undefined;error?reject(error):resolve(played?'played':'cancelled');}
  stop=abort;signal?.addEventListener('abort',abort,{once:true});
  audio.onplaying=()=>{if(!started&&!finished){started=true;clearTimeout(timer);onStart?.();}};
  audio.onended=()=>finish(undefined,true);
  audio.onerror=()=>finish(new Error('The voice is unavailable. You can read the text and try the speaker again.'));
  audio.src=url;audio.preload='auto';
  // Real audio.play occurs synchronously in the tap. The same element is reused for replies.
  void audio.play().catch(()=>finish(new Error('Tap the speaker to start the voice on this device.')));
 });
}
