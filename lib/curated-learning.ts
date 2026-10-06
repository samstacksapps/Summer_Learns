import 'server-only';
import type {SupabaseClient} from '@supabase/supabase-js';
import {history,attemptRows} from './progress';
import {recommendLessons} from './lesson-recommendations';
import type {Attempt} from './assessment';
export async function curatedLearning(db:SupabaseClient,owner:string,existingHistory?:Awaited<ReturnType<typeof history>>){
 const h=existingHistory??await history(db,owner),baseline=h.runs.find(r=>r.kind==='baseline'&&r.status==='completed');
 if(!baseline)return {recommendations:[],startingPoint:{independentAnswers:0,correct:0,checkedSkills:0}};
 const before=attemptRows(h.attempts.filter(a=>a.assessment_id===baseline.id),'baseline');
 const [sessions,answers]=await Promise.all([db.from('learning_sessions').select('id,is_archived,status').eq('owner_id',owner),db.from('learning_attempts').select('*').eq('owner_id',owner)]);
 if(sessions.error||answers.error)throw new Error('DATABASE_NOT_READY');
 const ids=new Set(sessions.data.filter(s=>!s.is_archived&&s.status==='completed').map(s=>s.id));
 const daily:Attempt[]=answers.data.filter(a=>ids.has(a.session_id)).map(a=>({itemId:a.item_id,skillId:a.skill_id,sessionId:a.session_id,correct:a.correct,assisted:a.assisted,responseMs:a.response_ms,likelyGuess:a.response_ms<1500,createdAt:a.created_at,yearLevel:a.year_level,sessionKind:'learning'}));
 const independent=before.filter(a=>a.correct!==null&&!a.assisted&&!a.likelyGuess);
 return {recommendations:recommendLessons([...before,...daily]),startingPoint:{independentAnswers:independent.length,correct:independent.filter(a=>a.correct).length,checkedSkills:new Set(independent.map(a=>a.skillId)).size}};
}
