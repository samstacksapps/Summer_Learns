import {family} from '@/lib/db';
import {hashPin,matchesPin,unlockParent,requireParent} from '@/lib/pin';
import {failure,json,sameOrigin,uuid} from '@/lib/http';
import {history,schedule,attemptRows} from '@/lib/progress';
import {summariseSkills,comparison} from '@/lib/assessment';
import {skills,items,curriculumVerified} from '@/lib/catalogue';
export async function GET(request:Request){try{
 const {db,user}=await requireParent();const recordingId=new URL(request.url).searchParams.get('recording');
 if(recordingId){if(!uuid(recordingId))return json({error:'Recording not found.'},404);const {data,error}=await db.from('reading_recordings').select('audio_base64,mime_type').eq('id',recordingId).eq('owner_id',user.id).gt('expires_at',new Date().toISOString()).single();if(error||!data)return json({error:'This recording has expired or is not available.'},404);return new Response(Buffer.from(data.audio_base64,'base64'),{headers:{'Content-Type':data.mime_type,'Cache-Control':'no-store'}});}
 const h=await history(db,user.id);
 const [r,v,reviews]=await Promise.all([db.from('reading_recordings').select('id,item_id,assessment_id,accuracy_estimate,parent_accuracy,created_at,expires_at').eq('owner_id',user.id).gt('expires_at',new Date().toISOString()).order('created_at',{ascending:false}),db.from('voice_usage').select('amount_cents').eq('owner_id',user.id).gte('created_at',new Date(Date.UTC(new Date().getUTCFullYear(),new Date().getUTCMonth(),1)).toISOString()),db.from('reading_reviews').select('*').eq('owner_id',user.id)]);
 if(r.error||v.error||reviews.error)throw new Error('DATABASE_NOT_READY');
 const baseline=h.runs.find(run=>run.kind==='baseline'&&run.status==='completed')??h.runs.find(run=>run.kind==='baseline');
 const later=h.runs.find(run=>run.kind==='followup'&&run.status==='completed')??h.runs.find(run=>run.kind==='followup');
 const before=baseline?attemptRows(h.attempts.filter(a=>a.assessment_id===baseline.id),'baseline'):[];
 const after=later?attemptRows(h.attempts.filter(a=>a.assessment_id===later.id),'followup'):[];
 return json({curriculumVerified,baseline,later,schedule:schedule(h),skills:skills.map(s=>({id:s.id,subject:s.subject,description:s.description,yearLevel:s.yearLevel,strand:s.strand})),baselineSummary:summariseSkills(skills,before),laterSummary:summariseSkills(skills,after),comparison:comparison(skills,before,after,items),sessions:h.sessions,recordings:r.data.map(r=>({...r,passage:items.find(i=>i.id===r.item_id)?.passage,description:skills.find(s=>s.id===items.find(i=>i.id===r.item_id)?.skillId)?.description})),reviews:reviews.data.map(r=>({...r,description:skills.find(s=>s.id===items.find(i=>i.id===r.item_id)?.skillId)?.description||'Reading observation'})),estimatedSpendCents:v.data.reduce((sum,row)=>sum+row.amount_cents,0),budgetCents:1500,guessCount:before.concat(after).filter(a=>a.likelyGuess).length});
}catch(error){return failure(error);}}
export async function POST(request:Request){try{
 sameOrigin(request);const body=await request.json();
 if(body.action==='setPin'||body.action==='unlock'){
  const {db,user}=await family();
  if(typeof body.pin!=='string'||!/^\d{6}$/.test(body.pin))return json({error:'Use a six-digit PIN.'},400);
  const {data,error}=await db.from('profiles').select('parent_pin_hash,parent_pin_locked_until').eq('owner_id',user.id).single();if(error||!data)throw new Error('DATABASE_NOT_READY');
  if(data.parent_pin_locked_until&&Date.parse(data.parent_pin_locked_until)>Date.now())return json({error:'Too many PIN tries. Please wait ten minutes.'},429);
  if(body.action==='setPin'){
   if(data.parent_pin_hash)return json({error:'A parent PIN is already set.',code:'pin_already_set'},409);
   const hash=hashPin(body.pin);const {data:updated,error}=await db.from('profiles').update({parent_pin_hash:hash}).eq('owner_id',user.id).is('parent_pin_hash',null).select('parent_pin_hash').maybeSingle();if(error)throw new Error('SAVE_FAILED');if(!updated)return json({error:'A parent PIN was just saved. Refresh and unlock with that PIN.',code:'pin_already_set'},409);await unlockParent(user.id,updated.parent_pin_hash);
  }else{
   if(!data.parent_pin_hash||!matchesPin(body.pin,data.parent_pin_hash)){const {error}=await db.rpc('record_pin_failure');if(error)throw new Error('PIN_RATE_LIMIT_UNAVAILABLE');return json({error:'Please check your PIN.'},403);}
   const {error}=await db.from('profiles').update({parent_pin_failures:0,parent_pin_locked_until:null}).eq('owner_id',user.id);if(error)throw new Error('SAVE_FAILED');await unlockParent(user.id,data.parent_pin_hash);
  }
  return json({ok:true});
 }
 const {db,user}=await requireParent();
 if(body.action==='correctReading'&&uuid(body.recordingId)&&typeof body.accuracy==='number'&&Number.isFinite(body.accuracy)&&body.accuracy>=0&&body.accuracy<=100){
  const {data,error}=await db.from('reading_recordings').select('item_id,assessment_id,accuracy_estimate').eq('id',body.recordingId).eq('owner_id',user.id).gt('expires_at',new Date().toISOString()).single();if(error||!data)return json({error:'This recording is no longer available.'},404);
  const review=await db.from('reading_reviews').upsert({owner_id:user.id,assessment_id:data.assessment_id,item_id:data.item_id,parent_accuracy:body.accuracy,original_estimate:data.accuracy_estimate,updated_at:new Date().toISOString()},{onConflict:'owner_id,assessment_id,item_id'});if(review.error)throw new Error('SAVE_FAILED');
  const saved=await db.from('reading_recordings').update({parent_accuracy:body.accuracy}).eq('id',body.recordingId).eq('owner_id',user.id);if(saved.error)throw new Error('SAVE_FAILED');return json({ok:true});
 }
 return json({error:'That parent action is not available.'},400);
}catch(error){return failure(error);}}
