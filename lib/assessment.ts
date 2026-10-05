/** Pure assessment rules. No clocks, notifications, network calls or storage writes. */
export type Subject = 'maths' | 'english';
export type ItemKind = 'number' | 'choice' | 'spelling' | 'reading';
export type YearLevel = 0 | 1 | 2 | 3 | 4;
export type AssessmentForm = 'baseline' | 'followup';
export type SessionKind = 'baseline' | 'learning' | 'reassessment';

export interface Item {
  id: string;
  skillId: string;
  subject: Subject;
  kind: ItemKind;
  yearLevel: YearLevel;
  prompt: string;
  spokenPrompt: string;
  acceptedAnswers: string[];
  choices?: string[];
  passage?: string;
  form: AssessmentForm;
  difficulty: number;
}

export interface Skill {
  id: string;
  subject: Subject;
  strand: string;
  yearLevel: YearLevel;
  description: string;
  prerequisites: string[];
  exampleItems: Item[];
  curriculumSource: string;
  curriculumVerified: boolean;
}

export interface Attempt {
  itemId: string;
  skillId: string;
  correct: boolean | null;
  responseMs: number;
  assisted: boolean;
  likelyGuess: boolean;
  sessionId: string;
  createdAt: string;
  yearLevel?: YearLevel;
  /** Only real learning sessions can establish secure skills. */
  sessionKind?: SessionKind;
  /** Unverified reading observation/estimate, 0–100; never a graded score. */
  readingEstimate?: number | null;
  readingEstimateSource?: 'transcription' | 'parent';
}

export interface AttemptInput {
  answer: string;
  responseMs: number;
  assisted: boolean;
  sessionId: string;
  createdAt?: string;
  sessionKind?: SessionKind;
  readingEstimate?: number | null;
  readingEstimateSource?: 'transcription' | 'parent';
}

export const ASSESSMENT_PARTS = Object.freeze([
  Object.freeze({ id: 'maths', label: 'Maths', subject: 'maths' as const, kinds: ['number', 'choice'] as const, maxDurationMs: 12 * 60_000 }),
  Object.freeze({ id: 'english', label: 'Spelling and understanding', subject: 'english' as const, kinds: ['spelling', 'choice'] as const, maxDurationMs: 12 * 60_000 }),
  Object.freeze({ id: 'reading', label: 'Reading aloud', subject: 'english' as const, kinds: ['reading'] as const, maxDurationMs: 12 * 60_000 }),
]);
export const BASELINE_PARTS = ASSESSMENT_PARTS;
export const FAST_WRONG_MS = 1_500;
export const SECURE_ACCURACY = 0.9;

function normaliseAnswer(value: string): string {
  const normalised = value.normalize('NFKC').toLocaleLowerCase('en-AU').trim().replace(/[‘’]/g, "'").replace(/\s+/g, ' ');
  // Permit conventional numeric grouping, but never evaluate expressions or guess intent.
  const number = normalised.replace(/,/g, '');
  if (/^[+-]?(?:\d+(?:\.\d*)?|\.\d+)$/.test(number)) return String(Number(number));
  return normalised;
}

export function markAttempt(item: Item, input: AttemptInput): Attempt {
  const answer = normaliseAnswer(input.answer);
  const responseMs = Number.isFinite(input.responseMs) ? Math.max(0, input.responseMs) : 0;
  // Speech transcription is not a measure of a child's reading accuracy.
  const correct = item.kind === 'reading' || answer === ''
    ? null
    : item.acceptedAnswers.some((accepted) => normaliseAnswer(accepted) === answer);
  const observation = input.readingEstimate;
  return {
    itemId: item.id,
    skillId: item.skillId,
    correct,
    responseMs,
    assisted: input.assisted,
    likelyGuess: correct === false && responseMs < FAST_WRONG_MS,
    sessionId: input.sessionId,
    createdAt: input.createdAt ?? new Date().toISOString(),
    yearLevel: item.yearLevel,
    sessionKind: input.sessionKind ?? 'baseline',
    ...(item.kind === 'reading' && observation != null && Number.isFinite(observation)
      ? { readingEstimate: Math.min(100, Math.max(0, observation)), readingEstimateSource: input.readingEstimateSource ?? 'transcription' }
      : {}),
  };
}

export function isIndependent(attempt: Attempt): boolean {
  return attempt.correct !== null && !attempt.assisted && !attempt.likelyGuess;
}

/**
 * Start at the supplied initial level (Pre-primary by default). Two independent successes allow a gentle step up;
 * two independent errors step down. One error/fast response gets a fresh
 * recheck, not a confirmed gap. Exhausted easier forms end the part rather
 * than forcing increasingly difficult questions. Caller enforces time caps.
 * Supply only attempts for the current assessment run.
 */
export function chooseNextItem(
  items: readonly Item[],
  attempts: readonly Attempt[],
  subject: Subject,
  kind?: ItemKind,
  form: AssessmentForm = 'baseline',
  initialYearLevel: YearLevel = 0,
): Item | undefined {
  const pool = items.filter((item) => item.subject === subject && (!kind || item.kind === kind) && item.form === form);
  const byId = new Map(pool.map((item) => [item.id, item]));
  const relevant = attempts.filter((attempt) => byId.has(attempt.itemId));
  const used = new Set(relevant.map((attempt) => attempt.itemId));
  const remaining = pool.filter((item) => !used.has(item.id));
  if (!remaining.length) return undefined;

  // Reading uses a fixed easy pair. Transcription estimates must never route a
  // child to a higher grade or establish competence without human review.
  if (pool.every((item) => item.kind === 'reading')) {
    const observedLevels = new Set(relevant.map((attempt) => byId.get(attempt.itemId)!.yearLevel));
    const readingLevels = [...new Set(pool.map((item) => item.yearLevel))].sort((a, b) => a - b).slice(0, 2);
    const nextLevel = readingLevels.find((level) => !observedLevels.has(level));
    return remaining.filter((item) => item.yearLevel === nextLevel).sort((a, b) => a.id.localeCompare(b.id))[0];
  }

  const lowestLevel = Math.min(...pool.map((item) => item.yearLevel));
  const highestLevel = Math.max(...pool.map((item) => item.yearLevel));
  let target = initialYearLevel;
  let successes = 0;
  let errors = 0;
  let steppedDown = false;
  for (const attempt of relevant) {
    if (!isIndependent(attempt)) continue;
    const level = byId.get(attempt.itemId)!.yearLevel;
    if (attempt.correct) {
      successes += 1;
      errors = 0;
      steppedDown = false;
      if (successes >= 2) {
        target = Math.min(highestLevel, level + 1) as YearLevel;
        successes = 0;
      }
    } else {
      successes = 0;
      errors += 1;
      if (errors >= 2) {
        target = Math.max(lowestLevel, level - 1) as YearLevel;
        errors = 0;
        steppedDown = true;
      }
    }
  }

  const last = [...relevant].reverse().find((attempt) => attempt.correct !== null && !attempt.assisted);
  const lastItem = last ? byId.get(last.itemId) : undefined;
  const eligible = remaining.filter((item) => item.yearLevel <= target);
  if (!eligible.length) return undefined;

  if (lastItem && last?.correct === false && (!steppedDown || last.likelyGuess)) {
    const recheck = eligible.filter((item) => item.skillId === lastItem.skillId && item.difficulty <= lastItem.difficulty);
    if (recheck.length) return recheck.sort((a, b) => b.difficulty - a.difficulty || a.id.localeCompare(b.id))[0];
  }

  const skillExposure = new Map<string, number>();
  for (const attempt of relevant) skillExposure.set(attempt.skillId, (skillExposure.get(attempt.skillId) ?? 0) + 1);
  return eligible.sort((a, b) =>
    Math.abs(a.yearLevel - target) - Math.abs(b.yearLevel - target)
    || (skillExposure.get(a.skillId) ?? 0) - (skillExposure.get(b.skillId) ?? 0)
    || a.difficulty - b.difficulty
    || a.id.localeCompare(b.id),
  )[0];
}

/** Fresh equivalents follow the original assessed path, even after an error. */
export function chooseFollowupItem(
  items: readonly Item[],
  baseline: readonly Attempt[],
  followup: readonly Attempt[],
  subject: Subject,
  kind?: ItemKind,
): Item | undefined {
  const byId = new Map(items.map((item) => [item.id, item]));
  const used = new Set(followup.map((attempt) => attempt.itemId));
  const equivalent = (original: Item, item: Item) => item.form === 'followup'
    && item.skillId === original.skillId && item.subject === subject
    && item.kind === original.kind && item.yearLevel === original.yearLevel
    && item.difficulty === original.difficulty && (!kind || item.kind === kind);
  const assigned = new Set<string>();
  for (const attempt of baseline) {
    const original = byId.get(attempt.itemId);
    if (!original || original.form !== 'baseline' || original.subject !== subject || (kind && original.kind !== kind)) continue;
    // A skip has no baseline result; do not add a test of an unassessed skill.
    if (attempt.correct === null && original.kind !== 'reading') continue;
    const counterpart = items.filter((item) => equivalent(original, item) && !assigned.has(item.id)).sort((a, b) => a.id.localeCompare(b.id))[0];
    if (!counterpart) continue;
    assigned.add(counterpart.id);
    if (!used.has(counterpart.id)) return counterpart;
  }
  return undefined;
}

export type SkillStatus = 'unassessed' | 'needs_practice' | 'developing' | 'provisional_strength' | 'secure';
export type Confidence = 'none' | 'low' | 'medium' | 'high';
export interface SkillSummary {
  skillId: string;
  status: SkillStatus;
  independentAttempts: number;
  correct: number;
  accuracy: number | null;
  distinctSessions: number;
  learningSessions: number;
  assistedAttempts: number;
  likelyGuessAttempts: number;
  readingObservations: number;
  yearLevel: YearLevel;
  confidence: Confidence;
}

export function summariseSkills(skills: readonly Skill[], attempts: readonly Attempt[]): SkillSummary[] {
  return skills.map((skill) => {
    const observed = attempts.filter((attempt) => attempt.skillId === skill.id);
    const independent = observed.filter(isIndependent);
    const correct = independent.filter((attempt) => attempt.correct).length;
    const accuracy = independent.length ? correct / independent.length : null;
    const learning = independent.filter((attempt) => attempt.sessionKind === 'learning');
    const learningBySession = new Map<string, Attempt[]>();
    for (const attempt of learning) {
      const session = learningBySession.get(attempt.sessionId) ?? [];
      session.push(attempt);
      learningBySession.set(attempt.sessionId, session);
    }
    // Repeated questions within a single run cannot manufacture secure evidence.
    const recentSessions = [...learningBySession.values()].sort((a, b) =>
      Math.max(...b.map((attempt) => Date.parse(attempt.createdAt))) - Math.max(...a.map((attempt) => Date.parse(attempt.createdAt))),
    ).slice(0, 3);
    const qualifyingSessions = recentSessions.filter((session) => session.length >= 2);
    const secureEvidence = qualifyingSessions.flat();
    const secureAccuracy = secureEvidence.length ? secureEvidence.filter((attempt) => attempt.correct).length / secureEvidence.length : 0;
    let status: SkillStatus = 'unassessed';
    if (independent.length) {
      if (qualifyingSessions.length >= 3 && secureAccuracy >= SECURE_ACCURACY) status = 'secure';
      else if (independent.length >= 2 && accuracy! >= SECURE_ACCURACY) status = 'provisional_strength';
      else if (independent.filter((attempt) => attempt.correct === false).length >= 2 && accuracy! < 0.5) status = 'needs_practice';
      else status = 'developing';
    }
    return {
      skillId: skill.id,
      status,
      independentAttempts: independent.length,
      correct,
      accuracy,
      distinctSessions: new Set(independent.map((attempt) => attempt.sessionId)).size,
      learningSessions: learningBySession.size,
      assistedAttempts: observed.filter((attempt) => attempt.assisted).length,
      likelyGuessAttempts: observed.filter((attempt) => attempt.likelyGuess && !attempt.assisted).length,
      readingObservations: observed.filter((attempt) => attempt.readingEstimate != null).length,
      yearLevel: skill.yearLevel,
      confidence: !independent.length ? 'none'
        : independent.length >= 6 && learningBySession.size >= 3 ? 'high'
        : independent.length >= 4 && learningBySession.size >= 2 ? 'medium'
        : 'low',
    };
  });
}

export interface ScoreSample {
  correct: number;
  total: number;
  accuracy: number;
  distinctSessions: number;
}
export interface MatchedLevelComparison {
  yearLevel: YearLevel;
  difficulty: number;
  baseline: ScoreSample;
  followup: ScoreSample;
  changePercentagePoints: number;
  confidence: Confidence;
}
export interface SkillComparison {
  skillId: string;
  status: 'comparable' | 'insufficient_evidence' | 'unassessed';
  levels: MatchedLevelComparison[];
  baselineIndependent: number;
  followupIndependent: number;
  baselineReadingObservations: number;
  followupReadingObservations: number;
  note: string;
  confidence: Confidence;
}

/** Compare only fresh forms of the same skill at the same difficulty. No total-score claim. */
export function comparison(
  skills: readonly Skill[],
  baseline: readonly Attempt[],
  followup: readonly Attempt[],
  items: readonly Item[],
): SkillComparison[] {
  const byId = new Map(items.map((item) => [item.id, item]));
  return skills.map((skill) => {
    const first = baseline.filter((attempt) => attempt.skillId === skill.id && byId.get(attempt.itemId)?.form === 'baseline' && isIndependent(attempt));
    const later = followup.filter((attempt) => attempt.skillId === skill.id && byId.get(attempt.itemId)?.form === 'followup' && isIndependent(attempt));
    const groupKey = (attempt: Attempt) => {
      const item = byId.get(attempt.itemId)!;
      return `${item.yearLevel}:${item.difficulty}`;
    };
    const keys = [...new Set(first.map(groupKey))].filter((key) => later.some((attempt) => groupKey(attempt) === key));
    const score = (sample: Attempt[]): ScoreSample => ({ correct: sample.filter((attempt) => attempt.correct).length, total: sample.length, accuracy: sample.filter((attempt) => attempt.correct).length / sample.length, distinctSessions: new Set(sample.map((attempt) => attempt.sessionId)).size });
    const levels = keys.map((key): MatchedLevelComparison => {
      const before = first.filter((attempt) => groupKey(attempt) === key);
      const after = later.filter((attempt) => groupKey(attempt) === key);
      const item = byId.get(before[0].itemId)!;
      const baselineScore = score(before);
      const followupScore = score(after);
      const confidence: Confidence = baselineScore.total < 4 || followupScore.total < 4 || baselineScore.distinctSessions < 2 || followupScore.distinctSessions < 2
        ? 'low'
        : baselineScore.total >= 8 && followupScore.total >= 8 && baselineScore.distinctSessions >= 3 && followupScore.distinctSessions >= 3 ? 'high' : 'medium';
      return { yearLevel: item.yearLevel, difficulty: item.difficulty, baseline: baselineScore, followup: followupScore, changePercentagePoints: Math.round((followupScore.accuracy - baselineScore.accuracy) * 10_000) / 100, confidence };
    }).sort((a, b) => a.yearLevel - b.yearLevel || a.difficulty - b.difficulty);
    const hasEvidence = first.length > 0 || later.length > 0;
    return {
      skillId: skill.id,
      status: levels.length ? 'comparable' : hasEvidence ? 'insufficient_evidence' : 'unassessed',
      levels,
      baselineIndependent: first.length,
      followupIndependent: later.length,
      baselineReadingObservations: baseline.filter((attempt) => attempt.skillId === skill.id && attempt.readingEstimate != null).length,
      followupReadingObservations: followup.filter((attempt) => attempt.skillId === skill.id && attempt.readingEstimate != null).length,
      confidence: !hasEvidence ? 'none' : !levels.length || levels.some((level) => level.confidence === 'low') ? 'low' : levels.every((level) => level.confidence === 'high') ? 'high' : 'medium',
      note: levels.length
        ? 'Fresh questions at matching skill and difficulty. Evidence is limited when either sample has fewer than four answers or two sessions. Treat change as provisional; adaptive totals are not comparable.'
        : hasEvidence ? 'No independent answers at matching skill and difficulty yet.' : 'Not independently assessed. Unverified reading observations and transcription estimates are not graded scores.',
    };
  });
}

export interface BaselineSnapshot {
  readonly id: string;
  readonly kind: 'baseline';
  readonly completedAt: string;
  readonly attempts: readonly Readonly<Attempt>[];
}
/** Storage must insert this baseline once and must never overwrite it with later learning. */
export function createBaseline(attempts: readonly Attempt[], completedAt = new Date().toISOString()): BaselineSnapshot {
  if (!Number.isFinite(Date.parse(completedAt))) throw new Error('A valid baseline completion time is required.');
  const frozen = Object.freeze(attempts.map((attempt) => Object.freeze({ ...attempt, sessionKind: 'baseline' as const })));
  return Object.freeze({ id: `baseline:${completedAt}`, kind: 'baseline' as const, completedAt, attempts: frozen });
}

export interface LearningActivity {
  id: string;
  kind: 'learning' | 'baseline' | 'reassessment' | 'visit';
  startedAt: string;
}
export interface AssessmentSchedule {
  firstLearningAt: string | null;
  dueAt: string | null;
  learningSessions: number;
  isDue: boolean;
  completed: boolean;
}
const FOUR_WEEKS_MS = 28 * 24 * 60 * 60 * 1_000;

export function followupDueAt(activities: readonly LearningActivity[]): string | null {
  const starts = activities.filter((activity) => activity.kind === 'learning').map((activity) => Date.parse(activity.startedAt)).filter(Number.isFinite);
  return starts.length ? new Date(Math.min(...starts) + FOUR_WEEKS_MS).toISOString() : null;
}

/** Dates become an in-app invitation only. Missing days never incur a penalty. */
export function assessmentSchedule(
  activities: readonly LearningActivity[],
  now: string | number | Date = new Date(),
  completedAt?: string | null,
): AssessmentSchedule {
  const learning = activities.filter((activity) => activity.kind === 'learning' && Number.isFinite(Date.parse(activity.startedAt)));
  const firstLearningAt = learning.length ? new Date(Math.min(...learning.map((activity) => Date.parse(activity.startedAt)))).toISOString() : null;
  const dueAt = followupDueAt(learning);
  const nowMs = now instanceof Date ? now.getTime() : typeof now === 'number' ? now : Date.parse(now);
  const completed = Boolean(completedAt && Number.isFinite(Date.parse(completedAt)));
  return {
    firstLearningAt,
    dueAt,
    learningSessions: new Set(learning.map((activity) => activity.id)).size,
    isDue: Boolean(dueAt && Number.isFinite(nowMs) && nowMs >= Date.parse(dueAt) && !completed),
    completed,
  };
}
