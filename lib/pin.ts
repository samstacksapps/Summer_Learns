import 'server-only';
import {randomBytes,scryptSync,timingSafeEqual,createHmac} from 'node:crypto';
import {cookies} from 'next/headers';
import {family} from './db';
export function hashPin(pin:string){const salt=randomBytes(16).toString('hex');return `${salt}:${scryptSync(pin,salt,32).toString('hex')}`;}
export function matchesPin(pin:string,hash:string){try{const [salt,digest]=hash.split(':');const expected=Buffer.from(digest,'hex');const actual=scryptSync(pin,salt,32);return expected.length===actual.length&&timingSafeEqual(expected,actual);}catch{return false;}}
export async function unlockParent(userId:string,hash:string){const expires=Date.now()+10*60*1000;const body=`${userId}.${expires}`;const signature=createHmac('sha256',hash).update(body).digest('hex');(await cookies()).set('summer_parent',`${body}.${signature}`,{httpOnly:true,secure:process.env.NODE_ENV==='production',sameSite:'strict',path:'/',maxAge:600});}
export async function requireParent(){
 const {db,user}=await family();
 const {data,error}=await db.from('profiles').select('parent_pin_hash').eq('owner_id',user.id).single();
 if(error||!data?.parent_pin_hash)throw new Error('PIN_REQUIRED');
 const token=(await cookies()).get('summer_parent')?.value;
 const [id,expiry,signature]=token?.split('.')??[];
 if(id!==user.id||!expiry||Number(expiry)<Date.now()||!signature)throw new Error('PIN_REQUIRED');
 const expected=createHmac('sha256',data.parent_pin_hash).update(`${id}.${expiry}`).digest('hex');
 if(!/^[0-9a-f]{64}$/.test(signature)||!timingSafeEqual(Buffer.from(expected,'hex'),Buffer.from(signature,'hex')))throw new Error('PIN_REQUIRED');
 return {db,user};
}
