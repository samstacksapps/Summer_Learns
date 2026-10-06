import {readFile} from 'node:fs/promises';
import {join} from 'node:path';
import {requireParent} from '@/lib/pin';
import {failure,json} from '@/lib/http';

export async function GET(){try{
 await requireParent();
 const sql=(await Promise.all(['20261006_conversational_tutor.sql','20261006_start_fresh.sql'].map(file=>readFile(join(process.cwd(),'supabase/migrations',file),'utf8')))).join('\n');
 return json({sql});
}catch(error){return failure(error);}}
