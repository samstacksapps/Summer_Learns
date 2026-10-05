import {NextResponse} from 'next/server';
export function json(data:unknown,status=200){return NextResponse.json(data,{status,headers:{'Cache-Control':'no-store'}});}
export function failure(error:unknown){
 const reason=error instanceof Error?error.message:'';
 if(reason==='SETUP_REQUIRED')return json({error:'Mum needs to connect the app before we start.',code:'setup_required'},503);
 if(reason==='SIGN_IN_REQUIRED')return json({error:'Ask Mum to sign in first.',code:'sign_in_required'},401);
 if(reason==='PIN_REQUIRED')return json({error:'Please unlock the parent area with your PIN.',code:'pin_required'},403);
 if(reason==='OPENAI_QUOTA')return json({error:'Ask Mum to check the computer voice’s API credit.',code:'openai_quota'},503);
 if(reason==='OPENAI_RATE_LIMIT')return json({error:'The computer voice is busy. Please try again in a moment.',code:'openai_rate_limit'},429);
 if(reason==='BUDGET_LIMIT')return json({error:'Voice has reached the app’s monthly spending cap. Ask Mum for help.',code:'budget_limit'},429);
 if(reason==='VOICE_NOT_CONFIGURED')return json({error:'The computer voice is not connected yet. Ask Mum for help.',code:'voice_not_configured'},503);
 return json({error:'That did not work. Please try again with Mum.'},500);
}
export function sameOrigin(request:Request){
 const origin=request.headers.get('origin');
 if(origin && origin!==new URL(request.url).origin)throw new Error('BAD_ORIGIN');
}
export function uuid(value:unknown):value is string{return typeof value==='string'&&/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(value);}
