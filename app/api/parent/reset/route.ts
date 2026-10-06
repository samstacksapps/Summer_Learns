import {requireParent} from '@/lib/pin';
import {failure,json,sameOrigin,uuid} from '@/lib/http';
export async function POST(request:Request){try{
 sameOrigin(request); const {db}=await requireParent();
 const body=await request.json();
 if(body.confirmation!=='START_FRESH'||!uuid(body.requestId))return json({error:'Confirm Start fresh in the parent area.'},400);
 const result=await db.rpc('archive_learning_results',{p_request_id:body.requestId});
 if(result.error){if(['PGRST202','42883'].includes(result.error.code))return json({error:'Run the parent database update first.',code:'reset_setup_required'},503);throw new Error('SAVE_FAILED');}
 return json({ok:true,...result.data});
}catch(error){if(error instanceof Error&&error.message==='BAD_ORIGIN')return json({error:'Open the app to use Start fresh.'},403);return failure(error);}}
