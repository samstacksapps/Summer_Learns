import test from 'node:test';
import assert from 'node:assert/strict';
import {
  ASSESSMENT_PARTS,
  assessmentSchedule,
  chooseFollowupItem,
  chooseNextItem,
  comparison,
  createBaseline,
  followupDueAt,
  markAttempt,
  summariseSkills,
} from '../lib/assessment.ts';
import type { Attempt, Item, LearningActivity, Skill, YearLevel } from '../lib/assessment.ts';

function item(id: string, level: YearLevel = 0, overrides: Partial<Item> = {}): Item {
  return {
    id, skillId: `number-${level}`, subject: 'maths', kind: 'number', yearLevel: level,
    prompt: 'How many?', spokenPrompt: 'How many?', acceptedAnswers: ['2'],
    form: 'baseline', difficulty: level, ...overrides,
  };
}
function attempt(question: Item, answer = '2', overrides: Partial<Parameters<typeof markAttempt>[1]> = {}): Attempt {
  return markAttempt(question, { answer, responseMs: 4_000, assisted: false, sessionId: 'baseline-1', createdAt: '2026-10-06T08:00:00Z', ...overrides });
}
function skill(question: Item): Skill {
  return {
    id: question.skillId, subject: question.subject, strand: 'Number', yearLevel: question.yearLevel,
    description: 'Count a small collection', prerequisites: [], exampleItems: [question],
    curriculumSource: 'Draft curriculum map', curriculumVerified: false,
  };
}

test('three parts are capped at 12 minutes, with spelling/comprehension separate from reading', () => {
  assert.equal(ASSESSMENT_PARTS.length, 3);
  assert.ok(ASSESSMENT_PARTS.every((part) => part.maxDurationMs <= 12 * 60_000));
  assert.deepEqual(ASSESSMENT_PARTS[1].kinds, ['spelling', 'choice']);
  assert.deepEqual(ASSESSMENT_PARTS[2].kinds, ['reading']);
});

test('adaptive baseline starts at Pre-primary, advances only after two independent successes', () => {
  const a = item('pp-a'); const b = item('pp-b'); const c = item('year1-a', 1); const d = item('year2-a', 2);
  const questions = [d, c, b, a];
  assert.equal(chooseNextItem(questions, [], 'maths')?.id, a.id);
  assert.equal(chooseNextItem(questions, [attempt(a)], 'maths')?.id, b.id);
  assert.equal(chooseNextItem(questions, [attempt(a), attempt(b)], 'maths')?.id, c.id);
  assert.equal(chooseNextItem(questions, [attempt(a), attempt(b, '2', { assisted: true })], 'maths'), undefined);
});

test('one considered error rechecks its skill; two errors step down to an unused easier item', () => {
  const a = item('pp-a'); const b = item('pp-b'); const easier = item('pp-c', 0, { skillId: 'pp-recheck' });
  const c = item('year1-a', 1); const d = item('year1-b', 1); const higher = item('year2-a', 2);
  const questions = [a, b, easier, c, d, higher];
  const start = [attempt(a), attempt(b)];
  assert.equal(chooseNextItem(questions, [...start, attempt(c, '9')], 'maths')?.id, d.id);
  assert.equal(chooseNextItem(questions, [...start, attempt(c, '9'), attempt(d, '8')], 'maths')?.id, easier.id);
});

test('very fast errors are possible guesses and do not establish a gap or cause a harder question', () => {
  const a = item('pp-a'); const b = item('pp-b'); const c = item('year1-a', 1);
  const fast = attempt(a, '99', { responseMs: 500 });
  assert.equal(fast.likelyGuess, true);
  assert.equal(chooseNextItem([a, b, c], [fast], 'maths')?.id, b.id);
  const result = summariseSkills([skill(a)], [fast])[0];
  assert.equal(result.status, 'unassessed');
  assert.equal(result.independentAttempts, 0);
  assert.equal(result.likelyGuessAttempts, 1);
  assert.equal(summariseSkills([skill(a)], [fast, attempt(b, '8')])[0].status, 'developing');
});

test('blank, assisted and untouched skills stay out of independent scores', () => {
  const a = item('pp-a'); const untouched = item('year1-a', 1);
  const skipped = attempt(a, '  ');
  const helped = attempt(a, '2', { assisted: true });
  assert.equal(skipped.correct, null);
  const summaries = summariseSkills([skill(a), skill(untouched)], [skipped, helped]);
  assert.equal(summaries[0].status, 'unassessed');
  assert.equal(summaries[0].assistedAttempts, 1);
  assert.equal(summaries[0].accuracy, null);
  assert.equal(summaries[1].status, 'unassessed');
});

test('answer matching accepts harmless case/spacing and number formatting, not partial guesses', () => {
  assert.equal(attempt(item('spell', 0, { kind: 'spelling', acceptedAnswers: ['cat'] }), ' CAT ').correct, true);
  assert.equal(attempt(item('number', 3, { acceptedAnswers: ['2500'] }), '2,500').correct, true);
  assert.equal(attempt(item('number'), '2 or 3').correct, false);
});

test('reading transcription is never converted into exact-match grading', () => {
  const reading = item('read', 0, { subject: 'english', kind: 'reading', acceptedAnswers: ['The cat sat.'], passage: 'The cat sat.' });
  const observed = attempt(reading, 'The cat sat.', { readingEstimate: 75 });
  assert.equal(observed.correct, null);
  assert.equal(observed.readingEstimate, 75);
  assert.equal(observed.readingEstimateSource, 'transcription');
  assert.equal(summariseSkills([skill(reading)], [observed])[0].accuracy, null);
});

test('a baseline remains provisional even when its parts use different session IDs', () => {
  const question = item('pp-a');
  const answers = ['part-1', 'part-2', 'part-3'].flatMap((sessionId) => [attempt(question, '2', { sessionId }), attempt(question, '2', { sessionId })]);
  const result = summariseSkills([skill(question)], answers)[0];
  assert.equal(result.status, 'provisional_strength');
  assert.equal(result.learningSessions, 0);
  assert.equal(result.distinctSessions, 3);
  assert.equal(result.confidence, 'low');
});

test('secure requires at least 90% independent evidence in three distinct normal learning sessions', () => {
  const question = item('pp-a');
  const answers = [1, 2, 3].flatMap((day) => [
    attempt(question, '2', { sessionKind: 'learning', sessionId: `day-${day}`, createdAt: `2026-10-0${day}T08:00:00Z` }),
    attempt(question, '2', { sessionKind: 'learning', sessionId: `day-${day}`, createdAt: `2026-10-0${day}T08:01:00Z` }),
  ]);
  assert.equal(summariseSkills([skill(question)], answers.slice(0, 4))[0].status, 'provisional_strength');
  assert.equal(summariseSkills([skill(question)], answers)[0].status, 'secure');
  assert.equal(summariseSkills([skill(question)], answers)[0].confidence, 'high');
  assert.notEqual(summariseSkills([skill(question)], [...answers.slice(0, 5), { ...answers[5], correct: false }])[0].status, 'secure');
  assert.notEqual(summariseSkills([skill(question)], [...answers, attempt(question, '8', { sessionKind: 'learning', sessionId: 'day-4', createdAt: '2026-10-04T08:00:00Z' })])[0].status, 'secure');
});

test('follow-up uses fresh equivalent items in baseline order instead of adapting onto a different path', () => {
  const a = item('base-0'); const b = item('base-1', 1); const skipped = item('base-2', 2);
  const freshA = item('fresh-0', 0, { form: 'followup', acceptedAnswers: ['3'] });
  const freshB = item('fresh-1', 1, { form: 'followup', acceptedAnswers: ['4'] });
  const freshSkipped = item('fresh-2', 2, { form: 'followup' });
  const questions = [a, b, skipped, freshB, freshA, freshSkipped];
  const initial = [attempt(a), attempt(b), attempt(skipped, '')];
  assert.equal(chooseFollowupItem(questions, initial, [], 'maths')?.id, freshA.id);
  assert.equal(chooseFollowupItem(questions, initial, [attempt(freshA, '9')], 'maths')?.id, freshB.id);
  assert.equal(chooseFollowupItem(questions, initial, [attempt(freshA), attempt(freshB)], 'maths'), undefined);
});

test('comparison includes only independent fresh forms at matching skill and difficulty', () => {
  const a = item('base-0'); const b = item('base-1', 1, { skillId: a.skillId });
  const fresh = item('fresh-0', 0, { form: 'followup' });
  const harder = item('fresh-2', 2, { form: 'followup', skillId: a.skillId });
  const result = comparison([skill(a)], [attempt(a, '9'), attempt(b)], [attempt(fresh), attempt(harder)], [a, b, fresh, harder])[0];
  assert.equal(result.status, 'comparable');
  assert.equal(result.levels.length, 1);
  assert.equal(result.levels[0].yearLevel, 0);
  assert.equal(result.levels[0].changePercentagePoints, 100);
  assert.equal(result.levels[0].confidence, 'low');
  assert.equal(result.confidence, 'low');
  assert.equal(result.baselineIndependent, 2);
  assert.equal(result.followupIndependent, 2);
  assert.match(result.note, /provisional/);
  assert.match(result.note, /limited/);
  assert.equal(comparison([skill(a)], [attempt(a)], [attempt(fresh, '2', { assisted: true })], [a, fresh])[0].status, 'insufficient_evidence');
  assert.equal(comparison([skill(a)], [attempt(a)], [attempt(a)], [a])[0].status, 'insufficient_evidence');
});

test('reading selects a fixed PP and Year1 pair and never adapts from transcription estimates', () => {
  const pp = item('read-pp', 0, { subject: 'english', kind: 'reading' });
  const anotherPP = item('read-pp2', 0, { subject: 'english', kind: 'reading' });
  const year1 = item('read-year1', 1, { subject: 'english', kind: 'reading' });
  const year2 = item('read-year2', 2, { subject: 'english', kind: 'reading' });
  const questions = [year2, anotherPP, year1, pp];
  assert.equal(chooseNextItem(questions, [], 'english', 'reading')?.id, pp.id);
  const observations = [attempt(pp, '', { readingEstimate: 100 })];
  assert.equal(chooseNextItem(questions, observations, 'english', 'reading')?.id, year1.id);
  observations.push(attempt(year1, '', { readingEstimate: 100 }));
  assert.equal(chooseNextItem(questions, observations, 'english', 'reading'), undefined);
});

test('baseline is an immutable copy and subsequent learning cannot rewrite it', () => {
  const question = item('pp-a'); const original = attempt(question);
  const baseline = createBaseline([original], '2026-10-06T08:00:00Z');
  original.correct = false;
  assert.equal(baseline.attempts[0].correct, true);
  assert.ok(Object.isFrozen(baseline));
  assert.ok(Object.isFrozen(baseline.attempts));
  assert.ok(Object.isFrozen(baseline.attempts[0]));
  assert.throws(() => { (baseline.attempts[0] as Attempt).correct = false; }, TypeError);
  assert.throws(() => createBaseline([], 'invalid'), /valid baseline/);
});

test('four weeks starts at first normal learning, not baseline, visit, or later sessions', () => {
  const activities: LearningActivity[] = [
    { id: 'baseline', kind: 'baseline', startedAt: '2026-10-01T02:00:00Z' },
    { id: 'visit', kind: 'visit', startedAt: '2026-10-02T02:00:00Z' },
    { id: 'session-2', kind: 'learning', startedAt: '2026-10-08T02:00:00Z' },
    { id: 'session-1', kind: 'learning', startedAt: '2026-10-06T02:00:00Z' },
    { id: 'session-1', kind: 'learning', startedAt: '2026-10-06T02:00:00Z' },
  ];
  assert.equal(followupDueAt(activities), '2026-11-03T02:00:00.000Z');
  assert.equal(followupDueAt(activities.slice(0, 2)), null);
  assert.equal(assessmentSchedule(activities, '2026-11-03T01:59:59Z').isDue, false);
  const due = assessmentSchedule(activities, '2026-11-03T02:00:00Z');
  assert.equal(due.isDue, true);
  assert.equal(due.learningSessions, 2);
  assert.equal(due.firstLearningAt, '2026-10-06T02:00:00.000Z');
  assert.equal(assessmentSchedule(activities, '2026-12-01T02:00:00Z', '2026-11-04T02:00:00Z').isDue, false);
  assert.equal(assessmentSchedule([], '2026-11-03T02:00:00Z').dueAt, null);
});
