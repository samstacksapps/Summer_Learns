import {readFile} from 'node:fs/promises';
import {join} from 'node:path';
import {requireParent} from '@/lib/pin';
import {failure,json} from '@/lib/http';

export async function GET(){try{
 await requireParent();
 const sql=await readFile(join(process.cwd(),'supabase/migrations/20261006_conversational_tutor.sql'),'utf8');
 return json({sql});
}catch(error){return failure(error);}}
