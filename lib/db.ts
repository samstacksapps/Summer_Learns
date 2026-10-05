import 'server-only';
import {createServerClient} from '@supabase/ssr';
import {cookies} from 'next/headers';
export function configured(){return Boolean(process.env.SUPABASE_URL && process.env.SUPABASE_PUBLISHABLE_KEY && process.env.SUMMER_PARENT_EMAIL);}
export async function database(){
 if(!configured())throw new Error('SETUP_REQUIRED');
 const store=await cookies();
 return createServerClient(process.env.SUPABASE_URL!,process.env.SUPABASE_PUBLISHABLE_KEY!,{cookies:{getAll(){return store.getAll();},setAll(values){for(const {name,value,options} of values)store.set(name,value,{...options,httpOnly:true,sameSite:'lax',secure:process.env.NODE_ENV==='production'});}}});
}
export async function family(){
 const db=await database();
 const {data:{user},error}=await db.auth.getUser();
 if(error || !user || user.email?.toLowerCase()!==process.env.SUMMER_PARENT_EMAIL!.trim().toLowerCase())throw new Error('SIGN_IN_REQUIRED');
 return {db,user};
}
