import {configured,family} from '@/lib/db';
import {json,failure} from '@/lib/http';
import {history,schedule} from '@/lib/progress';
import {curriculumVerified} from '@/lib/catalogue';
import {warmupProgress} from '@/lib/presentation-progress';
export async function GET(){
 if(!configured())return json({configured:false,signedIn:false,voiceConfigured:Boolean(process.env.SUMMER_OPENAI_KEY),curriculumVerified});
 try{const {db,user}=await family();const h=await history(db,user.id);const {data,error}=await db.from('profiles').select('parent_pin_hash').eq('owner_id',user.id).single();if(error)throw new Error('DATABASE_NOT_READY');
 const timing=schedule(h);
 return json({configured:true,signedIn:true,hasPin:Boolean(data?.parent_pin_hash),voiceConfigured:Boolean(process.env.SUMMER_OPENAI_KEY),curriculumVerified,baselineComplete:h.runs.some(r=>r.kind==='baseline'&&r.status==='completed'),baselineStarted:h.runs.some(r=>r.kind==='baseline'),schedule:timing,warmup:warmupProgress(h,timing.isDue)});
 }catch(error){if(error instanceof Error&&error.message==='SIGN_IN_REQUIRED')return json({configured:true,signedIn:false,voiceConfigured:Boolean(process.env.SUMMER_OPENAI_KEY),curriculumVerified});return failure(error);}
}
