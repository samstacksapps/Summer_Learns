import {cookies} from 'next/headers';
import {database,configured} from '@/lib/db';
import {failure,json,sameOrigin} from '@/lib/http';
export async function POST(request:Request){try{
 sameOrigin(request);if(!configured())throw new Error('SETUP_REQUIRED');
 const body=await request.json();const db=await database();
 if(body.action==='signout'){await db.auth.signOut();(await cookies()).delete('summer_parent');return json({ok:true});}
 if(typeof body.email!=='string'||typeof body.password!=='string'||body.password.length>200)return json({error:'Enter your email and password.'},400);
 if(body.email.trim().toLowerCase()!==process.env.SUMMER_PARENT_EMAIL!.trim().toLowerCase())return json({error:'Please check your sign-in details.'},401);
 const {data,error}=await db.auth.signInWithPassword({email:body.email.trim(),password:body.password});
 if(error||!data.user)return json({error:'Please check your sign-in details.'},401);
 const {data:profile,error:readError}=await db.from('profiles').select('owner_id').eq('owner_id',data.user.id).maybeSingle();
 if(readError)throw new Error('DATABASE_NOT_READY');
 if(!profile){const {error}=await db.from('profiles').insert({owner_id:data.user.id,first_name:'Summer'});if(error)throw new Error('DATABASE_NOT_READY');}
 return json({ok:true});
}catch(error){return failure(error);}}
