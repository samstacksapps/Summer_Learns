import 'server-only';
import type {SupabaseClient} from '@supabase/supabase-js';
import {observationLabels,type ObservationCode} from './tutor-content';

const missingSchema=(error:{code?:string}|null)=>Boolean(error&&['42703','42P01','PGRST204','PGRST205'].includes(error.code||''));

/** Daily evidence stays separate from immutable starting-point assessments. */
export async function learningProgress(db:SupabaseClient,owner:string){
 const [sessions,attempts]=await Promise.all([
  db.from('learning_sessions').select('*').eq('owner_id',owner).order('started_at',{ascending:false}),
  db.from('learning_attempts').select('session_id,correct,assisted').eq('owner_id',owner),
 ]);
 if(missingSchema(sessions.error)||missingSchema(attempts.error))return {ready:false,sessions:[],answers:0,correct:0,observations:[] as string[],completedSessions:0};
 if(sessions.error||attempts.error)throw new Error('DATABASE_NOT_READY');
 sessions.data=sessions.data.filter(s=>!s.is_archived);const ids=new Set(sessions.data.map(s=>s.id));attempts.data=attempts.data.filter(a=>ids.has(a.session_id));
 const observations=[...new Set(sessions.data.flatMap(s=>Array.isArray(s.tutor_state?.observations)?s.tutor_state.observations.filter((v:unknown):v is string=>typeof v==='string'):[]))] as string[];
 return {ready:true,sessions:sessions.data.map(({tutor_state:_,plan:__,...session})=>session),answers:attempts.data.length,correct:attempts.data.filter(a=>a.correct&&!a.assisted).length,observations:observations.filter(code=>Object.hasOwn(observationLabels,code)).map(code=>observationLabels[code as ObservationCode]),completedSessions:sessions.data.filter(s=>s.status==='completed').length};
}
