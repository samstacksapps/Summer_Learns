'use client';
import {useRef,useState} from 'react';
export default function ParentReset({ready,onReset}:{ready:boolean;onReset:()=>Promise<void>}){
 const [confirm,setConfirm]=useState(false),[busy,setBusy]=useState(false),[error,setError]=useState(''),[done,setDone]=useState(false);
 const pending=useRef<string|null>(null);
 async function reset(){setBusy(true);setError('');pending.current??=crypto.randomUUID();try{
  const response=await fetch('/api/parent/reset',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({confirmation:'START_FRESH',requestId:pending.current}),signal:AbortSignal.timeout(20000)});
  const data=await response.json();if(!response.ok)throw new Error(data.error||'The results could not be cleared. Try again.');
  pending.current=null;setConfirm(false);await onReset();setDone(true);
 }catch(error){setError(error instanceof Error&&error.name==='TimeoutError'?'The reset has not been confirmed. Tap Start fresh again to safely retry.':error instanceof Error?error.message:'Please try again.');}finally{setBusy(false);}}
 return <section className="card summary-card"><h2>Testing before Summer starts</h2><p>Try the app yourself, then clear your trial results before Summer takes her starting check.</p>
 {!ready?<p>Run the database update below to enable Start fresh.</p>:!confirm?<button className="secondary" onClick={()=>setConfirm(true)}>Start fresh</button>:<div role="group" aria-label="Confirm clearing current results"><h3>Clear the current results?</h3><p>This clears the starting check, lesson progress and remembered tutor strategies from Summer’s active record. Her four-week clock will start again with her first completed lesson.</p><p>Previous records are archived separately. Your sign-in, parent PIN and spending history stay in place.</p><div className="daily-subjects"><button className="primary" disabled={busy} onClick={()=>void reset()}>{busy?'Clearing results…':'Yes, start fresh'}</button><button className="secondary" disabled={busy||pending.current!==null} onClick={()=>setConfirm(false)}>Keep current results</button></div></div>}
 {done&&<p role="status">Trial results cleared. Summer can take a new starting check.</p>}{error&&<p role="alert">{error}</p>}
 </section>;
}
