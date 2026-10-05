import type {RunRow,SessionRow} from './progress';

export interface RecoveryHistory {
  runs: RunRow[];
  sessions: SessionRow[];
  attempts: Record<string,unknown>[];
}

/** A saved item can be replayed only through its original owned session/run. */
export function savedAttempt(h:RecoveryHistory,owner:string,sessionId:string,itemId:string){
  const session=h.sessions.find(s=>s.id===sessionId&&s.owner_id===owner);
  const run=session&&h.runs.find(r=>r.id===session.assessment_id);
  const attempt=run&&session&&h.attempts.find(a=>a.owner_id===owner&&a.session_id===session.id&&a.assessment_id===run.id&&a.item_id===itemId);
  return attempt&&run&&session?{run,session,attempt}:undefined;
}

export function needsCompletionRepair(run:RunRow,sessions:readonly SessionRow[]):boolean{
  const finished=new Set(sessions.filter(s=>s.assessment_id===run.id&&s.status==='completed').map(s=>s.part));
  return run.status==='in_progress'&&(['maths','english','reading'] as const).every(part=>finished.has(part));
}

export function savedFeedback(attempt:Record<string,unknown>){
  return attempt.correct===null?'skip':attempt.likely_guess===true?'rush':attempt.correct===true?'good':'try';
}
