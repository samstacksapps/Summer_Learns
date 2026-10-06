import {readFile} from 'node:fs/promises';
import {join} from 'node:path';
import {requireParent} from '@/lib/pin';
import {failure,json} from '@/lib/http';

export async function GET(){try{
 const {db,user}=await requireParent();
 const [tutor,reset]=await Promise.all([db.from('learning_attempts').select('id').eq('owner_id',user.id).limit(1),db.from('assessments').select('is_archived').eq('owner_id',user.id).limit(1)]);
 const files=tutor.error||reset.error?['20261006_conversational_tutor.sql','20261006_start_fresh.sql','20261006_curated_learning.sql']:['20261006_curated_learning.sql'];
 const sql=(await Promise.all(files.map(file=>readFile(join(process.cwd(),'supabase/migrations',file),'utf8')))).join('\n');
 return json({sql});
}catch(error){return failure(error);}}
