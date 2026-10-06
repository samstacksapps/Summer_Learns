'use client';
import type {Recommendation} from '@/lib/lesson-recommendations';
import {useEffect,useRef,useState,useContext,createContext,type FormEvent} from 'react';
import type {SkillSummary,SkillComparison,AssessmentSchedule} from '@/lib/assessment';
import {AudioCache} from '@/lib/audio-cache';
import {playNatural,cancelNatural} from '@/lib/natural-voice';
import type {FixedVoiceLine} from '@/lib/fixed-voice';
import TutorLesson from '@/components/tutor-lesson';
import ParentReset from '@/components/parent-reset';
import {Bell,BookOpen,Check,GraduationCap,House,Lightbulb,Lock,Mic,Search,SlidersHorizontal,Square,Target,UserRound,Volume2} from 'lucide-react';
import {ArrowCircle,Illustration,PageTitle,ProgressRing,ProgressTrack} from './ui/presentation';
type Action={id:number;controller:AbortController};
type Playback='played'|'cancelled';
class ApiError extends Error {constructor(message:string,readonly status:number,readonly code?:string,readonly signedOut=false){super(message);}}
type Screen='welcome'|'home'|'lessons'|'question'|'break'|'win'|'parent'|'bests'|'me'|'tutor';
type PublicItem={id:string;skillId:string;subject:'maths'|'english';kind:'number'|'choice'|'spelling'|'reading';yearLevel:number;prompt:string;choices?:string[];passage?:string};
type Question={assessmentId:string;sessionId:string;part:string;kind:string;item?:PublicItem;sessionEnded:boolean;stopped?:boolean;sessionDeadline?:string;assessmentComplete?:boolean;feedback?:string;brainBreak?:boolean;progress?:{answered:number;total:number};completion?:{part:Part;savedAnswers:number;independentAnswers:number;correct:number;strength?:string}};
type Part='maths'|'english'|'reading';
type WarmupPart={part:Part;completed:boolean;available:boolean;answered:number;total:number};
type Warmup={kind:'baseline'|'followup';completedParts:number;totalParts:3;percent:number;parts:WarmupPart[];activePart?:Part};
type State={recommendations?:Recommendation[];curationReady?:boolean;startingPoint?:{independentAnswers:number;correct:number;checkedSkills:number};configured:boolean;signedIn:boolean;hasPin?:boolean;voiceConfigured:boolean;curriculumVerified:boolean;baselineComplete?:boolean;baselineStarted?:boolean;schedule?:AssessmentSchedule;warmup?:Warmup;tutorReady?:boolean;resetReady?:boolean;learning?:{completedSessions:number;answers:number;correct:number}};
type Recording={passage?:string;description?:string;id:string;item_id:string;assessment_id:string;accuracy_estimate:number|null;parent_accuracy:number|null;created_at:string;expires_at:string};
type Review={description:string;item_id:string;assessment_id:string;parent_accuracy:number;original_estimate:number|null;created_at:string};
type Report={reviews:Review[];curriculumVerified:boolean;baseline?:{completed_at:string|null;started_at:string};later?:{completed_at:string|null};schedule:AssessmentSchedule;skills:{id:string;description:string;yearLevel:number;subject:string}[];baselineSummary:SkillSummary[];laterSummary:SkillSummary[];comparison:SkillComparison[];recordings:Recording[];sessions:{id:string;part:string;status:string;started_at:string;completed_at:string|null}[];estimatedSpendCents:number;budgetCents:number;guessCount:number;learning?:{ready:boolean;sessions:{id:string;subject:string;status:string;started_at:string;completed_at:string|null;summary?:{correct?:number;total?:number;observations?:string[]}}[];answers:number;correct:number;observations:string[]}};
const BusyContext=createContext(false);
const speakerIcon=<Volume2 size={23} strokeWidth={1.8} aria-hidden="true"/>;
function Speaker({onClick,label='Hear this',disabled=false}:{onClick:()=>void;label?:string;disabled?:boolean}){const contextBusy=useContext(BusyContext);return <button type="button" className="speaker" aria-label={label} onClick={onClick} disabled={disabled||contextBusy}>{speakerIcon}</button>;}
async function request<T>(path:string,body?:unknown,signal?:AbortSignal):Promise<T>{const response=await fetch(path,{method:body?'POST':'GET',headers:body?{'Content-Type':'application/json'}:undefined,body:body?JSON.stringify(body):undefined,cache:'no-store',signal});const result=await response.json();if(!response.ok)throw new ApiError(result.error||'Please try again with Mum.',response.status,result.code,result.signedOut===true);return result as T;}
const date=(value:string|null|undefined)=>value?new Date(value).toLocaleDateString('en-AU',{timeZone:'Australia/Perth',day:'numeric',month:'short',year:'numeric'}):'Not started';
const level:Record<string,string>={unassessed:'Not checked yet',needs_practice:'Not yet',developing:'Getting there',provisional_strength:'Early strength — still checking',secure:'Secure'};
// Australian device speech starts from the actual tap; no silent audio primer.
export default function LearningLab(){
 const [screen,setScreen]=useState<Screen>('welcome'),[state,setState]=useState<State|null>(null),[question,setQuestion]=useState<Question|null>(null),[answer,setAnswer]=useState(''),[assisted,setAssisted]=useState(false),[hint,setHint]=useState(false),[busy,setBusy]=useState(false),[gettingVoice,setGettingVoice]=useState(false),[speaking,setSpeaking]=useState(false),[error,setError]=useState(''),[caption,setCaption]=useState(''),[word,setWord]=useState(-1),[audioReady,setAudioReady]=useState(false),[report,setReport]=useState<Report|null>(null),[pin,setPin]=useState(''),[email,setEmail]=useState(''),[password,setPassword]=useState(''),[recording,setRecording]=useState(false),[clip,setClip]=useState<Blob|null>(null),[recordingUrl,setRecordingUrl]=useState(''),[subject,setSubject]=useState('all');
 const [lessonSearch,setLessonSearch]=useState(''),[lessonSubject,setLessonSubject]=useState('all'),[lessonStatus,setLessonStatus]=useState('all'),[showFilters,setShowFilters]=useState(false);
 const [tutorTopic,setTutorTopic]=useState<string|undefined>();
 const [tutorSubject,setTutorSubject]=useState<'maths'|'english'>('maths'),[parentRecording,setParentRecording]=useState(''),[tutorSetup,setTutorSetup]=useState(''),[setupCopied,setSetupCopied]=useState(false);
 const lastPart=useRef<Part|null>(null);
 const parentUnlockedUntil=useRef(0);
 const audio=useRef<HTMLAudioElement|null>(null),audioUrl=useRef(''),readyAt=useRef(0),captionRef=useRef(''),media=useRef<MediaRecorder|null>(null),stream=useRef<MediaStream|null>(null),recordStart=useRef(0),recordDuration=useRef(0),recordTimer=useRef<ReturnType<typeof setTimeout>|null>(null),activeOperation=useRef(0),heading=useRef<HTMLHeadingElement|null>(null);
 const mounted=useRef(true),actionSequence=useRef(0),activeAction=useRef<Action|null>(null),refreshSequence=useRef(0),voiceLoads=useRef(new Set<AbortController>()),voiceGeneration=useRef(0);
 const cache=useRef(new AudioCache<string>({maxEntries:48,maxBytes:128*1024,sizeOf:text=>text.length*2}));
 const current=(action:Action)=>mounted.current&&action.id===actionSequence.current&&!action.controller.signal.aborted;
 function stopAudio(){
  activeOperation.current++;cancelNatural();audio.current?.pause();
  if(audio.current){audio.current.onended=null;audio.current.onerror=null;}
  if(mounted.current){setWord(-1);setGettingVoice(false);setSpeaking(false);}
 }
 function cancelWork(){
  actionSequence.current++;voiceGeneration.current++;activeAction.current?.controller.abort();activeAction.current=null;stopAudio();
  if(voiceLoads.current.size){cache.current.clear();for(const controller of voiceLoads.current)controller.abort();voiceLoads.current.clear();}
  if(mounted.current)setBusy(false);
 }
 function clearPrivateAudio(){
  cancelWork();cache.current.clear();setParentRecording('');
  if(audioUrl.current)URL.revokeObjectURL(audioUrl.current);audioUrl.current='';
  audio.current?.removeAttribute('src');if(mounted.current)setAudioReady(false);
 }
 function startAction():Action{
  if(activeAction.current)cancelWork();else stopAudio();
  const action={id:++actionSequence.current,controller:new AbortController()};activeAction.current=action;
  setBusy(true);setError('');return action;
 }
 function finishAction(action:Action){if(current(action)){activeAction.current=null;setBusy(false);}}
 function actionError(error:unknown,action?:Action){
  if(!mounted.current||(action&&!current(action))||(error instanceof Error&&error.name==='AbortError'))return;
  if(error instanceof ApiError&&error.status===401){clearPrivateAudio();clearAccountView();}
  if(error instanceof ApiError&&error.status===403)setReport(null);
  setError(error instanceof Error?error.message:'Please try again with Mum.');
 }
 async function refresh(action?:Action){
  const sequence=++refreshSequence.current;
  try{const next=await request<State>('/api/state',undefined,action?.controller.signal);if(mounted.current&&sequence===refreshSequence.current&&(!action||current(action)))setState(next);}
  catch(error){actionError(error,action);}
 }
 useEffect(()=>{mounted.current=true;void refresh();return ()=>{mounted.current=false;clearPrivateAudio();stream.current?.getTracks().forEach(track=>track.stop());if(recordTimer.current)clearTimeout(recordTimer.current);};},[]);
 useEffect(()=>{try{if(localStorage.getItem('summer-learning-welcome-dismissed')==='1')setScreen('home');}catch{/* The welcome remains available when browser storage is off. */}},[]);
 useEffect(()=>{if(!state?.signedIn)clearPrivateAudio();},[state?.signedIn]);
 useEffect(()=>{heading.current?.focus({preventScroll:true});window.scrollTo(0,0);},[screen]);
 useEffect(()=>{if(!question?.sessionDeadline||!['question','break'].includes(screen))return;const timer=setTimeout(()=>{void stop();},Math.max(0,Date.parse(question.sessionDeadline)-Date.now()));return ()=>clearTimeout(timer);},[question?.sessionDeadline,screen]);
 useEffect(()=>()=>{if(recordingUrl)URL.revokeObjectURL(recordingUrl);},[recordingUrl]);
 useEffect(()=>{
  if(!report)return;
  const lock=()=>{if(Date.now()>=parentUnlockedUntil.current){clearPrivateAudio();setReport(null);setPin('');}};
  const timer=setTimeout(lock,Math.max(0,parentUnlockedUntil.current-Date.now()));
  document.addEventListener('visibilitychange',lock);
  return ()=>{clearTimeout(timer);document.removeEventListener('visibilitychange',lock);};
 },[report]);
 useEffect(()=>{
  if(!report||(report.learning?.ready!==false&&state?.resetReady&&state?.curationReady!==false))return;
  const controller=new AbortController();
  void request<{sql:string}>('/api/parent/tutor-setup',undefined,controller.signal).then(result=>{if(!controller.signal.aborted)setTutorSetup(result.sql);}).catch(()=>{});
  return ()=>controller.abort();
 },[report,state?.resetReady,state?.curationReady]);
 async function copyTutorSetup(){try{await navigator.clipboard.writeText(tutorSetup);setSetupCopied(true);}catch{setSetupCopied(false);document.getElementById('tutor-setup-sql')?.focus();setError('Select the database update below, then tap Copy.');}}
 function loadInstruction(q:Question,action?:Action){
  const generation=voiceGeneration.current;
  return cache.current.get(JSON.stringify([q.sessionId,q.item?.id]),async()=>{
   if(!mounted.current||generation!==voiceGeneration.current||(action&&!current(action)))throw new DOMException('Cancelled','AbortError');
   const controller=new AbortController(),abort=()=>controller.abort();voiceLoads.current.add(controller);
   action?.controller.signal.addEventListener('abort',abort,{once:true});
   if(action?.controller.signal.aborted)controller.abort();
   let timedOut=false;const timer=setTimeout(()=>{timedOut=true;controller.abort();},10000);
   try{const result=await request<{text:string}>('/api/speech',{line:'item',format:'text',sessionId:q.sessionId,itemId:q.item?.id},controller.signal);return result.text;}
   catch(error){if(timedOut&&!action?.controller.signal.aborted)throw new Error('The question took too long to load. Tap the speaker to try again.');throw error;}
   finally{clearTimeout(timer);voiceLoads.current.delete(controller);action?.controller.signal.removeEventListener('abort',abort);}
  });
 }
 async function say(line:string,text:string,action:Action,q=question,preparedAudio?:Promise<string>):Promise<Playback>{
  if(!current(action))return 'cancelled';stopAudio();const operation=activeOperation.current;
  setCaption(text);captionRef.current=text;setWord(-1);if(line==='item')setAudioReady(false);setGettingVoice(true);
  try{
   const source=line==='item'&&q?.item?{line:'item' as const,sessionId:q.sessionId,itemId:q.item.id}:{line:line as FixedVoiceLine};
   const result=await playNatural(source,()=>{if(current(action)&&operation===activeOperation.current){setGettingVoice(false);setSpeaking(true);}},action.controller.signal);
   if(current(action)&&operation===activeOperation.current&&result==='played'&&line==='item'){setAudioReady(true);if(!readyAt.current)readyAt.current=performance.now();}
   return result;
  }finally{if(current(action)&&operation===activeOperation.current){setGettingVoice(false);setSpeaking(false);}}
 }
 async function replay(line:string,text:string){if(!state?.signedIn){cancelWork();setScreen('parent');setError('Ask Mum to sign in to use the voice.');return;}const action=startAction();try{await say(line,text,action);}catch(error){actionError(error,action);}finally{finishAction(action);}}
 function words(text:string){return text.split(/\s+/).map((token,index)=><span key={index} className={index===word&&caption===text?'spoken-word':''}>{token} </span>);}
 function prepareQuestionAudio(_q:Question,_action:Action){return undefined;}
 async function showQuestion(q:Question,action:Action,preparedAudio?:Promise<string>){
  if(!current(action))return;setQuestion(q);readyAt.current=0;setAnswer('');setHint(false);setAssisted(false);setClip(null);setRecordingUrl('');setError('');
  if(q.stopped){setQuestion(null);setAudioReady(false);setScreen('home');setCaption('Your answers are saved. Come back when you’re ready.');void refresh(action);return;}
  if(q.part==='maths'||q.part==='english'||q.part==='reading')lastPart.current=q.part;
  if(q.sessionEnded){setScreen('win');await say('win','Session done. Nice work. Your answers are saved.',action,q);if(current(action))void refresh(action);return;}
  setScreen('question');setAudioReady(false);
  if(q.item)await say('item',q.item.kind==='spelling'?'Listen to the word and its sentence. Then type the word.':q.item.prompt,action,q,preparedAudio);
 }
 async function begin(){
  const action=startAction();
  try{
   if(!current(action))return;
   if(!state?.signedIn||!state.hasPin){setScreen('parent');return;}
   if(!state.curriculumVerified){setScreen('parent');setError('The SCSA curriculum sources still need verification before Summer starts.');return;}
   if(await say('hello','Hi, Summer. Let’s find your starting point.',action)!=='played'||!current(action))return;
   const q=await request<Question>('/api/assessment',{action:'start'},action.controller.signal);if(current(action))await showQuestion(q,action);
  }catch(error){actionError(error,action);}finally{finishAction(action);}
 }
 async function submit(event?:FormEvent,skip=false){
  event?.preventDefault();if(!question?.item||(!audioReady&&!skip)||(!answer.trim()&&!skip))return;
  const action=startAction();
  try{
   const q=await request<Question>('/api/answer',{sessionId:question.sessionId,itemId:question.item.id,answer:skip?'':answer,responseMs:Math.round(performance.now()-readyAt.current),assisted},action.controller.signal);
   if(!current(action))return;if(q.stopped){await showQuestion(q,action);return;}setQuestion(q);setAnswer('');setHint(false);setAssisted(false);setAudioReady(false);
   const prepared=q.brainBreak?undefined:prepareQuestionAudio(q,action);
   if(!current(action))return;
   if(q.brainBreak&&!q.sessionEnded){setScreen('break');await say('break','Time for a movement break. Try a goanna walk, then come back when you’re ready.',action);}else await showQuestion(q,action,prepared);
  }catch(error){actionError(error,action);}finally{finishAction(action);}
 }
 async function stop(){
  const sessionId=question?.sessionId;cancelWork();const action=startAction();
  if(recordTimer.current)clearTimeout(recordTimer.current);if(media.current?.state==='recording')media.current.stop();stream.current?.getTracks().forEach(track=>track.stop());
  setRecording(false);setClip(null);setRecordingUrl('');setQuestion(null);setScreen('home');setCaption('Your session is saved. Come back when you’re ready.');
  try{if(sessionId)await request('/api/assessment',{action:'stop',sessionId},action.controller.signal);if(current(action))void refresh(action);}
  catch(error){if(!(error instanceof ApiError&&error.status===409))actionError(error,action);}finally{finishAction(action);}
 }
 async function hintPlease(){setHint(true);setAssisted(true);await replay('hint','Take your time. Think about the first step. Mum can help.');}
 async function continueAfterBreak(){if(!question)return;const action=startAction();try{await showQuestion(question,action);}catch(error){actionError(error,action);}finally{finishAction(action);}}
 async function finishWin(){const action=startAction();try{await say('finish','You kept going and gave it a try. We’ll build from here.',action);}catch(error){actionError(error,action);}finally{if(current(action)){setQuestion(null);setScreen('home');void refresh(action);}finishAction(action);}}
 async function startRecording(){
  const action=startAction();setClip(null);setRecordingUrl('');
  try{
   if(!window.isSecureContext||!navigator.mediaDevices?.getUserMedia||typeof MediaRecorder==='undefined')throw new Error('Ask Mum to open this app in Safari or Chrome using its secure web address.');
   const tracks=await navigator.mediaDevices.getUserMedia({audio:true});if(!current(action)){tracks.getTracks().forEach(track=>track.stop());return;}stream.current=tracks;
   const mime=['audio/mp4','audio/webm;codecs=opus','audio/webm'].find(type=>MediaRecorder.isTypeSupported(type));if(!mime){tracks.getTracks().forEach(track=>track.stop());throw new Error('This browser cannot record this reading. Try Safari or Chrome.');}
   const recorder=new MediaRecorder(tracks,{mimeType:mime}),chunks:BlobPart[]=[];media.current=recorder;
   recorder.ondataavailable=event=>{if(event.data.size)chunks.push(event.data);};
   recorder.onstop=()=>{tracks.getTracks().forEach(track=>track.stop());if(!current(action))return;if(recordTimer.current)clearTimeout(recordTimer.current);recordDuration.current=Math.min(65000,performance.now()-recordStart.current);const blob=new Blob(chunks,{type:mime});setClip(blob);setRecordingUrl(URL.createObjectURL(blob));setRecording(false);};
   recordStart.current=performance.now();recorder.start();setRecording(true);recordTimer.current=setTimeout(()=>{if(recorder.state==='recording')recorder.stop();},60000);
  }catch(error){if(!current(action))return;stream.current?.getTracks().forEach(track=>track.stop());setRecording(false);if(error instanceof Error&&error.name==='NotAllowedError')actionError(new Error('The microphone is off. Ask Mum to allow it, then tap again.'),action);else actionError(error,action);}finally{finishAction(action);}
 }
 async function sendReading(){
  if(!clip||!question?.item)return;const action=startAction();
  try{
   const form=new FormData();form.set('audio',clip,'reading');form.set('sessionId',question.sessionId);form.set('itemId',question.item.id);form.set('durationMs',String(Math.round(recordDuration.current)));form.set('assisted',String(assisted));
   const response=await fetch('/api/reading',{method:'POST',body:form,signal:action.controller.signal}),q=await response.json();if(!response.ok)throw new ApiError(q.error,response.status);
   if(!current(action))return;if(q.stopped){await showQuestion(q,action);return;}setQuestion(q);setClip(null);setRecordingUrl('');setAudioReady(false);
   const prepared=prepareQuestionAudio(q,action);
   if(current(action))await showQuestion(q,action,prepared);
  }catch(error){actionError(error,action);}finally{finishAction(action);}
 }
 async function signIn(event:FormEvent){event.preventDefault();const action=startAction();try{await request('/api/auth',{email,password},action.controller.signal);if(!current(action))return;setPassword('');await refresh(action);}catch(error){actionError(error,action);}finally{finishAction(action);}}
 async function unlock(event:FormEvent){event.preventDefault();const action=startAction(),until=Date.now()+10*60*1000;try{await request('/api/parent',{action:state?.hasPin?'unlock':'setPin',pin},action.controller.signal);if(!current(action))return;parentUnlockedUntil.current=until;setPin('');await refresh(action);if(!current(action))return;const next=await request<Report>('/api/parent',undefined,action.controller.signal);if(current(action))setReport(next);}catch(error){if(current(action)&&error instanceof ApiError&&error.code==='pin_already_set'){setPin('');setState(previous=>previous?{...previous,hasPin:true}:previous);await refresh(action);}actionError(error,action);}finally{finishAction(action);}}
 async function listenRecording(id:string){const action=startAction();try{const response=await fetch(`/api/parent?recording=${id}`,{signal:action.controller.signal});if(!response.ok)throw new ApiError('Unlock the parent area again, or check whether this recording has expired.',response.status);const blob=await response.blob();if(!current(action))return;if(audioUrl.current)URL.revokeObjectURL(audioUrl.current);audioUrl.current=URL.createObjectURL(blob);setParentRecording(id);}catch(error){actionError(error,action);}finally{finishAction(action);}}
 async function correctRecording(event:FormEvent<HTMLFormElement>,id:string){event.preventDefault();const form=new FormData(event.currentTarget),action=startAction();try{await request('/api/parent',{action:'correctReading',recordingId:id,accuracy:Number(form.get('accuracy'))},action.controller.signal);if(!current(action))return;const next=await request<Report>('/api/parent',undefined,action.controller.signal);if(current(action))setReport(next);}catch(error){actionError(error,action);}finally{finishAction(action);}}
 function clearAccountView(){refreshSequence.current++;parentUnlockedUntil.current=0;setState(previous=>previous?{...previous,signedIn:false}:previous);setReport(null);setTutorSetup('');setSetupCopied(false);setQuestion(null);setPin('');setPassword('');setAnswer('');setClip(null);setRecordingUrl('');setCaption('');setScreen('parent');}
 async function signOut(){clearPrivateAudio();const action=startAction();try{await request('/api/auth',{action:'signout'},action.controller.signal);if(current(action))clearAccountView();}catch(error){if(current(action)&&error instanceof ApiError&&error.signedOut)clearAccountView();actionError(error,action);}finally{finishAction(action);}}
 async function go(next:Screen){if(screen==='tutor'){setError('Use Stop for now in your lesson first.');return;}if(question?.sessionId&&['question','break'].includes(screen)&&next!=='parent'){setError('Tap Stop for today first. Your answers will be saved.');return;}cancelWork();setReport(null);setError('');setScreen(next);}
 const item=question?.item;
 const parts:WarmupPart[]=state?.warmup?.parts??[
  {part:'maths',completed:false,available:true,answered:0,total:12},
  {part:'english',completed:false,available:false,answered:0,total:12},
  {part:'reading',completed:false,available:false,answered:0,total:2},
 ];
 const completedParts=state?.warmup?.completedParts??0;
 const warmupPercent=state?.warmup?.percent??0;
 const followup=state?.warmup?.kind==='followup';
 const availablePart=parts.find(part=>part.available&&!part.completed);
 const partDetails={
  maths:{title:'Maths',description:'Numbers, patterns and problem solving.',icon:GraduationCap,tint:'sky'},
  english:{title:'English',description:'Spelling, words and understanding.',icon:BookOpen,tint:'pink'},
  reading:{title:'Reading',description:'Read a short passage in your own voice.',icon:Mic,tint:'lavender'},
 };
 const filteredParts=parts.filter(part=>{
  const detail=partDetails[part.part];
  return (lessonSubject==='all'||(lessonSubject==='maths'?part.part==='maths':part.part!=='maths'))
   &&(lessonStatus==='all'||(lessonStatus==='ready'?part.available&&!part.completed:part.completed))
   &&`${detail.title} ${detail.description}`.toLocaleLowerCase('en-AU').includes(lessonSearch.toLocaleLowerCase('en-AU').trim());
 });
 const currentPart=parts.find(part=>part.part===question?.part);
 const finishedPart=question?.part??lastPart.current;
 const questionProgress=question?.progress??{answered:currentPart?.answered??0,total:currentPart?.total??(question?.part==='reading'?2:12)};
 function dismissWelcome(){try{localStorage.setItem('summer-learning-welcome-dismissed','1');}catch{/* This preference never stores learning records. */}void go('home');}
 function startTutor(part:'maths'|'english',topicId?:string){if(!state?.signedIn||!state.hasPin){void go('parent');return;}if(!state.baselineComplete){setScreen('lessons');setError('Finish the starting-point check before opening daily lessons. Use the starting-point section marked Ready below.');return;}cancelWork();setCaption('');setQuestion(null);setTutorSubject(part);setTutorTopic(topicId);setScreen('tutor');}
 function openSection(part:Part){setLessonSubject(part==='maths'?'maths':'english');setLessonSearch(part==='reading'?'Reading':'');setLessonStatus('all');void go('lessons');}
 return <BusyContext.Provider value={busy||recording}>
 <div className={`lab-shell screen-${screen}`}>
  <header className="lab-header">
   <button className="brand" onClick={()=>void go('home')} aria-label="Summer’s Learning Lab home"><span className="brand-tile"><BookOpen aria-hidden="true" size={23} strokeWidth={1.8}/></span><span>Summer’s<br/><strong>Learning Lab</strong></span></button>
   <button className="icon-button" aria-label="Parent area" disabled={busy||recording} onClick={()=>void go('parent')}><Lock aria-hidden="true" size={22} strokeWidth={1.8}/></button>
  </header>
  {error&&<div className="error-message" role="alert">{error} <a href="/voice-check">Choose tutor voice</a></div>}
  {busy&&<p className="busy-note" role="status">{gettingVoice?'Getting the sound ready…':speaking?'Listen…':'Just a moment…'}</p>}
  <main>
   {screen==='welcome'&&<section className="welcome-screen card">
    <div className="welcome-art"><Illustration name="welcome-hero" width={640} height={640}/><span className="welcome-sticker" aria-hidden="true">Begin</span></div>
    <div className="welcome-copy"><p className="eyebrow">Made for Summer</p><h1 ref={heading} tabIndex={-1}>Your next<br/><span className="highlight-word">learning</span><br/><em>adventure</em></h1><p>Maths, English and a little more confidence. One step at a time.</p><div className="welcome-actions"><button className="secondary" onClick={dismissWelcome}>Skip</button><button className="primary attached-arrow" onClick={dismissWelcome}>Start<ArrowCircle/></button></div></div>
   </section>}
   {screen==='home'&&<section className="home-dashboard">
    <div className="home-greeting"><Illustration name="avatar" className="avatar" width={96} height={96}/><div className="home-meta"><h1 ref={heading} tabIndex={-1}>Hi Summer</h1><p><Target size={17} strokeWidth={1.8} aria-hidden="true"/>Warm-up progress {warmupPercent}%</p></div><Speaker onClick={()=>void replay('home','Hi, Summer. Take your time. Choose your warm-up when you’re ready.')} label="Hear the welcome message"/><button className="icon-button notification-button" onClick={()=>void go('bests')} aria-label={state?.schedule?.isDue?'View progress. Your four-week check is ready.':'View your progress'}><Bell size={23} strokeWidth={1.8} aria-hidden="true"/>{state?.schedule?.isDue&&<span className="notification-dot"/>}</button></div>
    <div className="stage-card card"><div className="stage-content"><p className="eyebrow">{followup?'Four-week check':'Your warm-up'}</p><h2>{followup?'See what has changed':'Starting point'}</h2><p>{completedParts===3?'Your warm-up is saved. You can see what you’ve completed.':'Find what you know and what to work on next.'}</p><div className="stage-progress-label"><span>{completedParts}/3 sections complete</span><span>{warmupPercent}%</span></div><ProgressTrack value={completedParts} total={3} label="Completed warm-up sections"/>{availablePart?<button className="primary attached-arrow" onClick={()=>void begin()} disabled={busy}>{availablePart.answered>0?'Continue warm-up':'Start warm-up'}<ArrowCircle/></button>:<button className="primary attached-arrow" onClick={()=>void go('bests')}>View progress<ArrowCircle/></button>}</div><Illustration name="trophy" className="stage-art" width={300} height={300}/></div>
    <div className="daily-learning card"><p className="eyebrow">Your AI tutor · Years 1–2</p><h2>Let’s work it out together</h2><p>{state?.baselineComplete?'Your lessons are chosen from your starting point and recent practice. Tell me how you worked it out, or ask me a question.':'Finish your starting-point check first. Then we’ll work through lessons together.'}</p><div className="daily-subjects"><button className="primary attached-arrow" disabled={busy} onClick={()=>startTutor('maths')}>{state?.baselineComplete?'Maths lesson':`Continue ${state?.warmup?.activePart==='maths'?'Maths':state?.warmup?.activePart==='reading'?'Reading':'English'} starting-point check`}<ArrowCircle/></button>{state?.baselineComplete&&<button className="secondary" disabled={busy} onClick={()=>startTutor('english')}>English lesson</button>}</div>{state?.baselineComplete&&state?.learning&&<p className="saved-note">{state.learning.completedSessions} lessons completed · {state.learning.answers} answers saved</p>}</div>
    <div className="section-icons" aria-label="Learning sections">{parts.map(part=>{const detail=partDetails[part.part];return <button key={part.part} className="section-shortcut" onClick={()=>openSection(part.part)}><span><Illustration name={`section-${part.part}`} width={96} height={96}/></span>{detail.title}</button>;})}</div>
    <div className="section-grid">{parts.map(part=>{const detail=partDetails[part.part],Icon=detail.icon;return <article key={part.part} className={`section-card card ${detail.tint}`}><div className="section-card-heading"><h2><Icon size={23} strokeWidth={1.8} aria-hidden="true"/>{detail.title}</h2><button className="round-arrow" onClick={()=>openSection(part.part)} aria-label={`View ${detail.title.toLocaleLowerCase('en-AU')} warm-up`}><ArrowCircle/></button></div><p>{detail.description}</p><Illustration name={`card-${part.part}`} className="section-card-art" width={480} height={320}/><span className="section-card-status">{part.completed?<><Check size={17} aria-hidden="true"/>Complete</>:part.available?'Ready when you are':<><Lock size={16} aria-hidden="true"/>After the previous section</>}</span></article>;})}</div>
    {state?.baselineComplete&&!followup&&<p className="support-note">Your starting point is saved. Try a lesson and talk through your thinking.</p>}
   </section>}
   {screen==='lessons'&&<section className="lesson-list">
    <PageTitle first="Choose your" second="next section" headingRef={heading}><p>{followup?'Fresh questions for your four-week check.':'Choose a recommended lesson, or review your starting-point check.'}</p></PageTitle>
    <div className="lesson-toolbar"><label className="search-field"><Search size={21} strokeWidth={1.8} aria-hidden="true"/><span className="sr-only">Search warm-up sections</span><input type="search" placeholder="Search sections" value={lessonSearch} onChange={event=>setLessonSearch(event.target.value)}/></label><button className="icon-button filter-button" aria-label="Show section filters" aria-expanded={showFilters} aria-controls="section-filters" onClick={()=>setShowFilters(!showFilters)}><SlidersHorizontal size={22} strokeWidth={1.8} aria-hidden="true"/></button></div>
    <div className="chips" aria-label="Filter by subject">{[['all','All'],['maths','Maths'],['english','English']].map(([value,label])=><button type="button" className={`chip ${lessonSubject===value?'active':''}`} key={value} onClick={()=>setLessonSubject(value)} aria-pressed={lessonSubject===value}>{label}</button>)}</div>
    {showFilters&&<div className="chips status-chips" id="section-filters" aria-label="Filter by availability">{[['all','All sections'],['ready','Ready'],['complete','Completed']].map(([value,label])=><button type="button" className={`chip ${lessonStatus===value?'active':''}`} key={value} onClick={()=>setLessonStatus(value)} aria-pressed={lessonStatus===value}>{label}</button>)}</div>}
    {state?.baselineComplete&&<><div className="card"><h2>Your starting point</h2><p>{state.startingPoint?.checkedSkills||0} skills checked · {state.startingPoint?.correct||0} of {state.startingPoint?.independentAnswers||0} independent answers correct.</p><p>This is an early picture of the skills checked, not a whole-year grade. Helped answers and likely guesses do not decide your recommendations.</p>{state.curationReady===false&&<p>Mum needs to apply the lesson planning update in the parent area.</p>}</div><div className="lesson-grid">{(state.recommendations||[]).filter(r=>(lessonSubject==='all'||r.subject===lessonSubject)&&(!lessonSearch||r.title.toLowerCase().includes(lessonSearch.toLowerCase()))&&lessonStatus!=='complete').map(r=><article className={`lesson-card card ${r.subject==='maths'?'sky':'pink'}`} key={r.topicId}><div className="lesson-copy"><p className="eyebrow">{r.subject==='maths'?'Maths':'English'} · Year {r.yearLevel} entry</p><h2>{r.title}</h2><p>{r.reason}</p><button className="primary" disabled={busy||!state.tutorReady||state.curationReady===false} onClick={()=>startTutor(r.subject,r.topicId)}>Start lesson<ArrowCircle/></button></div><Illustration name={`card-${r.subject}`} className="lesson-art" width={480} height={320}/></article>)}</div></>}
    {state?.baselineComplete&&<div className="daily-subjects card"><div><p className="eyebrow">Daily learning · Years 1–2</p><h2>Talk with your AI tutor</h2><p>Five questions, with time to explain your thinking.</p></div><button className="primary attached-arrow" onClick={()=>startTutor(lessonSubject==='english'?'english':'maths')}>Start {lessonSubject==='english'?'English':'maths'} lesson<ArrowCircle/></button>{lessonSubject==='all'&&<button className="secondary" onClick={()=>startTutor('english')}>Choose English</button>}</div>}
    <div className="lesson-grid">{filteredParts.map(part=>{const detail=partDetails[part.part];return <article className={`lesson-card card ${detail.tint}`} key={part.part}><div className="lesson-copy"><p className="eyebrow">{followup?'Four-week check':'Warm-up'} · {part.part==='reading'?'English':detail.title}</p><h2>{detail.title==='Reading'?<>Read <span className="circled-word">aloud</span></>:detail.title}</h2><p>{detail.description}</p>{part.available&&!part.completed?<button className="primary" disabled={busy} onClick={()=>void begin()}>{part.answered>0?'Continue':'Start'}<ArrowCircle/></button>:part.completed?<button className="secondary" onClick={()=>void go('bests')}><Check size={18} aria-hidden="true"/>Done</button>:<div className="locked-label"><Lock size={19} aria-hidden="true"/>Complete the previous section</div>}</div><ProgressRing value={part.answered} total={part.total} label={`${detail.title} answered questions`}/><Illustration name={`card-${part.part}`} className="lesson-art" width={480} height={320}/></article>;})}</div>
    {!filteredParts.length&&<div className="empty-state card"><Search size={30} aria-hidden="true"/><h2>No sections match</h2><p>Try another word or change the filters.</p><button className="secondary" onClick={()=>{setLessonSearch('');setLessonSubject('all');setLessonStatus('all');}}>Clear filters</button></div>}
   </section>}
   {screen==='tutor'&&<TutorLesson subject={tutorSubject} topicId={tutorTopic} onClose={()=>{setScreen('home');void refresh();}} onComplete={()=>{setScreen('home');void refresh();}} onAuthRequired={()=>{clearPrivateAudio();clearAccountView();}}/>}
   {screen==='question'&&item&&<section className="warmup">
    <div className="lesson-bar"><div><p className="eyebrow">{question.part==='maths'?'Maths':question.part==='reading'?'Reading':'English'} warm-up</p><span>{item.yearLevel===0?'Pre-primary':`Year ${item.yearLevel}`} · {questionProgress.answered}/{questionProgress.total} answered</span></div><button className="secondary" onClick={()=>void stop()}>Stop for today</button></div><ProgressTrack value={questionProgress.answered} total={questionProgress.total} label="Answered questions in this section" className="lesson-progress"/>
    <div className="card question-panel"><div className="read-row"><h1 ref={heading} tabIndex={-1}>{item.kind==='spelling'?'Listen, then spell':item.kind==='reading'?'Read this passage':words(item.prompt)}</h1><Speaker label={item.kind==='spelling'?'Hear the spelling word and sentence':'Hear the question'} onClick={()=>void replay('item',item.kind==='spelling'?'Listen to the word and its sentence. Then type the word.':item.prompt)} disabled={busy||recording}/></div>
     {item.kind==='reading'?<><p className="reading-instruction">Read aloud at your own pace.</p><div className="passage">{item.passage}</div><p className="mic-note">Mum can help with the microphone. Tap Allow if your device asks.</p><div className="recording-actions"><Speaker label="Hear microphone instructions" onClick={()=>void replay('recording','Tap the microphone and read the passage. Tap stop when you’re done.')} disabled={recording}/>{recording?<button className="primary mic-button recording" onClick={()=>media.current?.stop()}><Square size={23} fill="currentColor" aria-hidden="true"/>Stop recording</button>:<button className={clip?'secondary mic-button':'primary mic-button'} disabled={busy||!audioReady} onClick={()=>void startRecording()}><Mic size={25} strokeWidth={1.8} aria-hidden="true"/>{clip?'Record again':'Start recording'}</button>}</div>{clip&&<div className="recorded-preview"><audio src={recordingUrl} controls aria-label="Listen to this reading before sending"/><button className="primary attached-arrow" disabled={busy} onClick={()=>void sendReading()}>Save reading<ArrowCircle/></button></div>}</>:<form onSubmit={submit}>{item.kind==='spelling'&&<p>Listen again whenever you need to.</p>}{item.choices?<div className="choices">{item.choices.map(choice=><button type="button" key={choice} className={`choice ${answer===choice?'selected':''}`} disabled={!audioReady||busy} onClick={()=>setAnswer(choice)} aria-pressed={answer===choice}><span>{choice}</span>{answer===choice&&<Check size={23} strokeWidth={2} aria-hidden="true"/>}</button>)}</div>:<><label htmlFor="answer">Your answer</label><input id="answer" value={answer} onChange={event=>setAnswer(event.target.value)} inputMode={item.kind==='number'?'decimal':'text'} autoComplete="off" autoCapitalize="none" spellCheck={false} maxLength={160} disabled={!audioReady||busy}/></>}<button className="primary attached-arrow" disabled={busy||!answer.trim()||!audioReady}>Check answer<ArrowCircle/></button></form>}
     {!audioReady&&!busy&&item.kind!=='spelling'&&<button className="secondary" onClick={()=>{readyAt.current=performance.now();setAudioReady(true);setError('');}}>I’ll read the question myself</button>}<div className="question-support"><button className="skip-button" onClick={()=>void submit(undefined,true)} disabled={busy||recording}>I’m not sure yet</button><button className="hint-button" onClick={()=>void hintPlease()} disabled={busy||recording}><Lightbulb size={22} strokeWidth={1.8} aria-hidden="true"/>Hint</button></div>{hint&&<div className="hint-card tutor-message"><Lightbulb size={24} strokeWidth={1.8} aria-hidden="true"/><p>Think about the first step. Mum can help.</p><Speaker onClick={()=>void replay('hint','Take your time. Think about the first step. Mum can help.')}/></div>}
    </div><div className="gentle-row"><p>Take your time. You can stop for a break.</p><Speaker onClick={()=>void replay('start','Try a few questions. There’s no rush. You can stop for a break.')} label="Hear the break reminder"/></div>
   </section>}
   {screen==='break'&&<section className="centre-card card"><Illustration name="movement-break" className="scene-art" width={480} height={320}/><PageTitle first="Take a" second="movement break" headingRef={heading}/><p>Try a goanna walk. Come back when you’re ready.</p><Speaker onClick={()=>void replay('break','Time for a movement break. Try a goanna walk, then come back when you’re ready.')} label="Hear the movement break"/><button className="primary attached-arrow" disabled={busy} onClick={()=>void continueAfterBreak()}>Keep going<ArrowCircle/></button><button className="secondary" onClick={()=>void stop()}>Stop for today</button></section>}
   {screen==='win'&&<section className="centre-card card completion-panel">
    <Illustration name="lesson-complete" className="scene-art" width={480} height={320}/>
    <PageTitle first={question?.assessmentComplete?'Warm-up done.':'Session done.'} second="Nice work." headingRef={heading}/>
    {question?.completion&&question.completion.independentAnswers>0&&<div className="completion-score"><span>{question.completion.correct}<small>/{question.completion.independentAnswers}</small></span><p>Correct answers on your own</p></div>}
    {question?.completion?.strength?<p className="completion-strength">Nice work on:<br/><strong>{question.completion.strength}</strong></p>:<p>{finishedPart==='maths'?'You made time to work on maths.':finishedPart==='reading'?'You made time to practise reading.':finishedPart==='english'?'You made time to work on English.':'You made time for your learning.'}</p>}
    <p className="saved-note"><Check size={18} aria-hidden="true"/>Your answers are saved.</p>
    <Speaker onClick={()=>void replay('win','Session done. Nice work. Your answers are saved.')} label="Hear the session finish"/>
    <div className="reward-space" aria-hidden="true"/>
    <button className="primary attached-arrow" disabled={busy} onClick={()=>void finishWin()}>Keep going<ArrowCircle/></button>
   </section>}
   {screen==='bests'&&<section className="progress-screen"><PageTitle first="See your" second="progress" headingRef={heading}><p>{followup?'Your four-week check':'Your starting point'}, one section at a time.</p></PageTitle><div className="card progress-summary"><Illustration name="trophy" className="progress-summary-art" width={220} height={220}/><div><h2>{completedParts}/3 sections complete</h2><p>{completedParts===3?'Your warm-up is saved. Mum can see your skill-by-skill results in the parent area.':'A warm-up helps us find the right place to begin. It isn’t a race.'}</p><ProgressTrack value={completedParts} total={3} label="Completed warm-up sections"/></div></div><div className="progress-part-list">{parts.map(part=>{const detail=partDetails[part.part],Icon=detail.icon;return <article className="card progress-part" key={part.part}><Icon size={28} strokeWidth={1.8} aria-hidden="true"/><div><h2>{detail.title}</h2><p>{part.completed?'Complete':part.answered>0?'In progress':'Not started'}</p></div><ProgressRing value={part.answered} total={part.total} label={`${detail.title} answered questions`}/></article>;})}</div>{availablePart&&<button className="primary attached-arrow" onClick={()=>void begin()} disabled={busy}>Continue warm-up<ArrowCircle/></button>}{state?.schedule?.dueAt&&<p className="support-note">Your four-week check {state.schedule.isDue?'is ready':`is due on ${date(state.schedule.dueAt)}`}.</p>}</section>}
   {screen==='me'&&<section className="centre-card card"><Illustration name="sidekick" className="scene-art" width={480} height={320}/><PageTitle first="Your learning" second="space" headingRef={heading}/><p>A little space for your favourite things.</p><p>Choosing your reptile sidekick comes next.</p><Speaker onClick={()=>void replay('hello','Hi, Summer. I’m your computer voice. Let’s find your starting point.')} label="Hear your tutor’s introduction"/><button className="primary attached-arrow" onClick={()=>void go('home')}>Back home<ArrowCircle/></button></section>}
 {screen==='parent'&&<section className="parent-screen"><PageTitle first="Summer’s learning" second="Parent area" headingRef={heading}/>{!state?.configured?<div className="card setup-panel"><h2>Connect the family app</h2><p>Connect the private database, voice and parent account to begin.</p><ol><li>In Supabase, run the supplied database setup in SQL Editor.</li><li>Add your project URL, publishable key and parent email in environment settings.</li><li>Enter your OpenAI key securely as SUMMER_OPENAI_KEY.</li><li>Create your parent sign-in in Supabase, then return here.</li></ol><p>Summer’s warm-up opens once the service connections and curriculum checks are complete.</p></div>:!state.signedIn?<form className="card parent-form" onSubmit={signIn}><h2>Parent sign-in</h2><label htmlFor="email">Your email</label><input id="email" type="email" value={email} onChange={e=>setEmail(e.target.value)} autoComplete="username" required/><label htmlFor="password">Password</label><input id="password" type="password" value={password} onChange={e=>setPassword(e.target.value)} autoComplete="current-password" required/><button className="primary" disabled={busy}>Sign in</button><p>Only the parent account configured for this family can sign in.</p></form>:!report?<form className="card parent-form" onSubmit={unlock}><h2>{state.hasPin?'Unlock the parent area':'Choose your parent PIN'}</h2><label htmlFor="pin">Six-digit PIN</label><input id="pin" type="password" inputMode="numeric" pattern="[0-9]{6}" maxLength={6} value={pin} onChange={e=>setPin(e.target.value)} autoComplete="off" required/><button className="primary" disabled={busy}>{state.hasPin?'Unlock':'Save PIN'}</button><p>The parent area locks again after ten minutes. Five wrong PIN attempts pause access for ten minutes.</p></form>:<>
 <div className="card summary-card"><h2>Summer’s starting point</h2><p><a href="/voice-check">Choose and test the AI tutor voice</a></p><p>Baseline: {date(report.baseline?.completed_at)}. Follow-up: {date(report.later?.completed_at)}.</p><p>{report.schedule.dueAt?`Four-week check due ${date(report.schedule.dueAt)}. ${report.schedule.learningSessions} learning sessions recorded.`:'The four-week clock starts with the start of her first completed daily lesson.'}</p><p>{report.curriculumVerified?'Curriculum sources checked.':'Curriculum mapping is a draft and still needs official SCSA verification.'}</p><p>{report.guessCount} likely guesses, treated as rechecks rather than confirmed gaps.</p><p>AI and transcription spending reservation this UTC month: US${(report.estimatedSpendCents/100).toFixed(2)} of US${(report.budgetCents/100).toFixed(2)}. This is a conservative app estimate, not your OpenAI invoice.</p></div>
 <ParentReset ready={Boolean(state?.resetReady)} onReset={async()=>{clearPrivateAudio();setQuestion(null);setAnswer('');setClip(null);setRecordingUrl('');setCaption('');await refresh();const next=await request<Report>('/api/parent');setReport(next);setError('');}}/>
 {report.learning&&<div className="card summary-card"><h2>Daily lessons · Years 1–2</h2><p>{report.learning.sessions.filter(s=>s.status==='completed').length} lessons completed. {report.learning.answers} answers saved; {report.learning.correct} correct without a tutor hint.</p><p>Summer’s conversation is temporary. Only results and brief observations about strategies are remembered.</p>{report.learning.observations.length>0&&<><h3>Strategies she has explained</h3>{report.learning.observations.map(code=><p key={code}>{code}</p>)}<p>These are observations, rather than fixed learning styles.</p></>}{report.learning.sessions.map(s=><p key={s.id}>{date(s.started_at)} · {s.subject==='maths'?'Maths':'English'} · {s.status==='completed'?'Finished':s.status==='stopped'?'Stopped early':'In progress'}{s.summary?.total?` · ${s.summary.correct??0}/${s.summary.total} correct in practice`:''}</p>)}{(!report.learning.ready||!state?.resetReady||state?.curationReady===false)&&<div className="tutor-setup-panel"><h3>Enable personalised lessons</h3><p>This adds lesson planning support, lesson tables and the parent reset control. Running the update keeps all current results; only Start fresh clears active progress.</p><ol><li>Tap Copy database update.</li><li>Open your Supabase project → SQL Editor → New query.</li><li>Paste the update and tap Run. Then return here and refresh.</li></ol><button className="primary" disabled={!tutorSetup} onClick={()=>void copyTutorSetup()}>{setupCopied?'Copied':'Copy database update'}</button>{tutorSetup&&<details><summary>Show database update</summary><label className="sr-only" htmlFor="tutor-setup-sql">Database update SQL</label><textarea id="tutor-setup-sql" readOnly rows={8} value={tutorSetup} onFocus={event=>event.currentTarget.select()}/></details>}</div>}</div>}
 <div className="card summary-card"><h2>Skill-by-skill progress</h2><p>These are early observations. Unchecked skills stay unassessed. A secure skill needs strong results across at least three learning sessions.</p><label htmlFor="subject-filter">Show subject</label><select id="subject-filter" value={subject} onChange={e=>setSubject(e.target.value)}><option value="all">Both subjects</option><option value="maths">Maths</option><option value="english">English</option></select><div className="skill-list">{report.skills.filter(s=>subject==='all'||s.subject===subject).map(s=>{const before=report.baselineSummary.find(x=>x.skillId===s.id),after=report.laterSummary.find(x=>x.skillId===s.id),change=report.comparison.find(x=>x.skillId===s.id);return <article key={s.id} className="skill-row"><h3>{s.description}</h3><p>{s.yearLevel===0?'Pre-primary':`Year ${s.yearLevel}`} · {s.subject==='maths'?'Maths':'English'}</p><p>Starting point: {level[before?.status||'unassessed']} · confidence: {before?.confidence||'none'}</p>{before&&before.independentAttempts>0&&<p>Independent answers: {before.correct} of {before.independentAttempts}. Helped answers: {before.assistedAttempts}. Likely guesses: {before.likelyGuessAttempts}.</p>}{report.later&&<p>Later: {level[after?.status||'unassessed']} · confidence: {after?.confidence||'none'}</p>}{change?.levels.map((l,i)=><p key={i}>Matched questions: {l.baseline.correct}/{l.baseline.total} before; {l.followup.correct}/{l.followup.total} later. {l.confidence} confidence.</p>)}</article>;})}</div></div>
 <div className="card summary-card"><h2>Reading recordings</h2><p>Speech recognition may turn what Summer said into what it thinks she meant. Scores are estimates, not reliable reading grades. Listen and add your own score. Recordings become inaccessible after 30 days and are deleted by the scheduled job; review corrections stay saved.</p>{!report.recordings.length&&<p>No current recordings.</p>}{report.recordings.map(r=><article key={r.id} className="recording-row"><h3>{r.description||'Reading observation'}</h3><p>{date(r.created_at)} · deletes {date(r.expires_at)}</p>{r.passage&&<blockquote>{r.passage}</blockquote>}<p>Computer estimate: {r.accuracy_estimate===null?'Unavailable':`${r.accuracy_estimate}%`}. Your review: {r.parent_accuracy===null?'Not reviewed':`${r.parent_accuracy}%`}.</p><button className="secondary" onClick={()=>void listenRecording(r.id)}>Load recording</button>{parentRecording===r.id&&<audio ref={audio} src={audioUrl.current} controls aria-label="Play this private reading recording"/>}<form onSubmit={e=>void correctRecording(e,r.id)}><label htmlFor={`score-${r.id}`}>Your accuracy score (%)</label><input id={`score-${r.id}`} name="accuracy" type="number" min="0" max="100" step="1" defaultValue={r.parent_accuracy??''} required/><button className="secondary" disabled={busy}>Save my review</button></form></article>)}</div>
 <div className="card summary-card"><h2>Saved reading reviews</h2><p>Your reviews stay here when the audio expires. The original warm-up record stays unchanged.</p>{report.reviews.length?report.reviews.map((r,i)=><p key={i}>{date(r.created_at)} · {r.description} · your review: {r.parent_accuracy}% · original computer estimate: {r.original_estimate===null?'Unavailable':`${r.original_estimate}%`}</p>):<p>No parent reviews yet.</p>}</div><div className="card summary-card"><h2>Warm-up sessions</h2>{report.sessions.length?report.sessions.map(s=><p key={s.id}>{date(s.started_at)} · {s.part} · {s.status==='stopped'?'Stopped early':s.status==='completed'?'Finished':'In progress'} · {s.completed_at?`${Math.max(1,Math.round((Date.parse(s.completed_at)-Date.parse(s.started_at))/60000))} minutes`:'Not finished yet'}</p>):<p>No sessions yet.</p>}</div>
 </>}{state?.signedIn&&<button className="secondary" onClick={()=>void signOut()}>Sign out</button>}</section>}

   {caption&&screen!=='parent'&&screen!=='welcome'&&screen!=='tutor'&&<div className="voice-caption tutor-message" aria-live="polite"><Volume2 size={20} strokeWidth={1.8} aria-hidden="true"/><p>{item?.kind==='spelling'?caption:words(caption)}</p></div>}
  </main>
 </div>
 {screen!=='welcome'&&<div className="nav-wrap"><nav className="bottom-nav" aria-label="Summer’s menu">{([['home',House,'Home'],['lessons',BookOpen,'Learn'],['bests',Target,'Progress'],['me',UserRound,'Me']] as const).map(([target,Icon,label])=>{const active=screen===target||(target==='lessons'&&['question','break','win','tutor'].includes(screen));return <button key={target} aria-current={active?'page':undefined} onClick={()=>void go(target)} disabled={busy||recording}><span className="nav-icon"><Icon size={23} strokeWidth={1.7} aria-hidden="true"/></span><span>{label}</span></button>;})}<Speaker label="Hear the menu" onClick={()=>void replay('menu','Home. Learn. Progress. Me.')} disabled={recording}/></nav></div>}
 </BusyContext.Provider>;
}
