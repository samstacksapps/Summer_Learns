import type { history, Part } from './progress';

/** Read-only display of the existing assessment order and saved answers. */
export function warmupProgress(h: Awaited<ReturnType<typeof history>>, followupDue: boolean) {
  const baselineComplete = h.runs.some(r => r.kind === 'baseline' && r.status === 'completed');
  const followup = h.runs.find(r => r.kind === 'followup');
  const run = followup ?? (baselineComplete && followupDue ? undefined : h.runs.find(r => r.kind === 'baseline'));
  const kind = run?.kind ?? (baselineComplete && followupDue ? 'followup' : 'baseline');
  const order: Part[] = ['maths', 'english', 'reading'];
  const finished = new Set(h.sessions.filter(s => s.assessment_id === run?.id && s.status === 'completed').map(s => s.part));
  const next = order.find(part => !finished.has(part));
  const canStart = run?.status !== 'completed' && (!baselineComplete || followupDue);
  const parts = order.map(part => {
    const sessionIds = new Set(h.sessions.filter(s => s.assessment_id === run?.id && s.part === part).map(s => s.id));
    const total = part === 'reading' ? 2 : 12;
    return { part, completed: finished.has(part), available: Boolean(canStart && part === next), answered: Math.min(total, h.attempts.filter(a => sessionIds.has(String(a.session_id))).length), total };
  });
  return { kind, completedParts: finished.size, totalParts: 3, percent: Math.round(finished.size / 3 * 100), parts, ...(canStart && next ? { activePart: next } : {}) };
}

/** Display existing marked answers without adding a new grade or using reading estimates. */
export function completionProgress(h: Awaited<ReturnType<typeof history>>, runId: string, part: Part) {
  const sessions = new Set(h.sessions.filter(s => s.assessment_id === runId && s.part === part).map(s => s.id));
  const saved = h.attempts.filter(a => sessions.has(String(a.session_id)));
  const independent = saved.filter(a => typeof a.correct === 'boolean' && !a.assisted && !a.likely_guess);
  const correct = independent.filter(a => a.correct === true);
  return { part, savedAnswers: saved.length, independentAnswers: independent.length, correct: correct.length, strongSkillId: correct.length ? String(correct[0].skill_id) : undefined };
}
