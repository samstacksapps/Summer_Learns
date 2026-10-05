'use client';

import { useEffect, useRef, useState, type FormEvent } from 'react';
import { BookOpen, Check, Lightbulb, Mic, Send, Square, Volume2, VolumeX } from 'lucide-react';
import { ArrowCircle, Illustration, PageTitle, ProgressTrack } from '@/app/ui/presentation';
import { cancelNative, getAustralianVoices, sayNative, subscribeAustralianVoices } from '@/lib/browser-voice';
import type { TutorPayload } from '@/lib/tutor-content';

type Subject = 'maths' | 'english';
type TurnKind = 'start' | 'respond' | 'message' | 'stop';
type TurnBody = { action: TurnKind; requestId: string; subject?: Subject; sessionId?: string; revision?: number; itemId?: string; answer?: string; explanation?: string; responseMs?: number; message?: string; conversation?: ConversationTurn[] };
type ConversationTurn = { role: 'user' | 'assistant'; content: string };
type Bubble = ConversationTurn & { id: string };
type RequestFailure = { body: TurnBody; kind: TurnKind };
type Props = { subject: Subject; onClose: () => void; onComplete: () => void | Promise<void>; onAuthRequired?: () => void };

class TutorRequestError extends Error {
  constructor(message: string, readonly status: number, readonly code?: string, readonly current?: TutorPayload) { super(message); }
}

const makeId = () => crypto.randomUUID();
const subjectTitle: Record<Subject, string> = { maths: 'Maths', english: 'English' };
const intro = 'Hi Summer. Tell me how you worked it out, and we’ll work through a question together.';
function boundedConversation(turns: ConversationTurn[]): ConversationTurn[] {
  const bounded = turns.slice(-8).map(turn => ({ ...turn, content: turn.content.slice(0, 900) }));
  while (bounded.length && bounded.reduce((count, turn) => count + turn.content.length, 0) > 5000) bounded.shift();
  return bounded;
}

/** Normal learning is separate from the independent starting and four-week tests. */
export default function TutorLesson({ subject, onClose, onComplete, onAuthRequired }: Props) {
  const [lesson, setLesson] = useState<TutorPayload | null>(null);
  const [nextLesson, setNextLesson] = useState<TutorPayload | null>(null);
  const [bubbles, setBubbles] = useState<Bubble[]>([]);
  const [answer, setAnswer] = useState('');
  const [explanation, setExplanation] = useState('');
  const [message, setMessage] = useState('');
  const [busy, setBusy] = useState(false);
  const [stopping, setStopping] = useState(false);
  const [error, setError] = useState('');
  const [errorCode, setErrorCode] = useState('');
  const [retryable, setRetryable] = useState(false);
  const [voiceOn, setVoiceOn] = useState(true);
  const [voiceAvailable, setVoiceAvailable] = useState(false);
  const [speaking, setSpeaking] = useState(false);
  const [voiceError, setVoiceError] = useState('');
  const [recording, setRecording] = useState(false);
  const [micPending, setMicPending] = useState(false);
  const [recordSeconds, setRecordSeconds] = useState(0);

  const mounted = useRef(true);
  const busyRef = useRef(false);
  const voiceOnRef = useRef(true);
  const sequence = useRef(0);
  const controller = useRef<AbortController | null>(null);
  const activeTurn = useRef<TurnKind | null>(null);
  const latest = useRef<TutorPayload | null>(null);
  const failed = useRef<RequestFailure | null>(null);
  const speakingSequence = useRef(0);
  const questionStart = useRef(0);
  const conversation = useRef<ConversationTurn[]>([]);
  const recorder = useRef<MediaRecorder | null>(null);
  const stream = useRef<MediaStream | null>(null);
  const recordingTimer = useRef<ReturnType<typeof setInterval> | null>(null);
  const recordingStart = useRef(0);
  const recordingDiscarded = useRef(false);
  const micSequence = useRef(0);
  const chatEnd = useRef<HTMLDivElement | null>(null);
  const feedbackEnd = useRef<HTMLDivElement | null>(null);
  const scrollConversation = useRef(false);
  const lessonRoot = useRef<HTMLElement | null>(null);
  const questionHeading = useRef<HTMLHeadingElement | null>(null);
  const chatInput = useRef<HTMLTextAreaElement | null>(null);

  function cancelSpeech() {
    speakingSequence.current++;
    cancelNative();
    if (mounted.current) setSpeaking(false);
  }

  function releaseMic(discard = true) {
    if (discard) {
      micSequence.current++;
      recordingDiscarded.current = true;
    }
    if (recordingTimer.current) clearInterval(recordingTimer.current);
    recordingTimer.current = null;
    if (recorder.current?.state === 'recording') recorder.current.stop();
    recorder.current = null;
    stream.current?.getTracks().forEach(track => track.stop());
    stream.current = null;
    if (mounted.current) { setRecording(false); setMicPending(false); }
  }

  useEffect(() => {
    mounted.current = true;
    const unsubscribe = subscribeAustralianVoices(voices => { if (mounted.current) setVoiceAvailable(voices.length > 0); });
    return () => {
      mounted.current = false;
      sequence.current++;
      controller.current?.abort();
      releaseMic();
      cancelSpeech();
      unsubscribe();
      conversation.current = [];
      failed.current = null;
    };
  }, []);

  useEffect(() => {
    if (!bubbles.length || !scrollConversation.current) return;
    scrollConversation.current = false;
    const behavior = window.matchMedia('(prefers-reduced-motion: reduce)').matches ? 'auto' : 'smooth';
    chatEnd.current?.scrollIntoView({ block: 'nearest', behavior });
    if (nextLesson) feedbackEnd.current?.scrollIntoView({ block: 'nearest', behavior });
  }, [bubbles.length]);

  function speak(text: string) {
    cancelSpeech();
    if (!voiceOnRef.current || !text.trim()) return;
    const id = ++speakingSequence.current;
    setVoiceError('');
    // Called directly in a tap when possible; the native voice avoids a second AI audio request.
    void sayNative(text, () => { if (mounted.current && id === speakingSequence.current) setSpeaking(true); }).then(() => {
      if (mounted.current && id === speakingSequence.current) setSpeaking(false);
    }).catch((failure: unknown) => {
      if (!mounted.current || id !== speakingSequence.current) return;
      setSpeaking(false);
      setVoiceError(failure instanceof Error ? failure.message : 'The voice did not start. You can read the reply and try Hear again.');
    });
  }

  function toggleVoice() {
    const next = !voiceOnRef.current;
    voiceOnRef.current = next;
    setVoiceOn(next);
    if (!next) cancelSpeech();
    else {
      const text = bubbles.filter(bubble => bubble.role === 'assistant').at(-1)?.content;
      if (text) speak(text);
    }
  }

  function appendBubble(role: ConversationTurn['role'], content: string) {
    const bubble = { role, content, id: makeId() };
    scrollConversation.current = true;
    setBubbles(previous => [...previous, bubble]);
    conversation.current = boundedConversation([...conversation.current, { role, content }]);
  }

  async function fetchTurn(body: TurnBody, signal: AbortSignal): Promise<TutorPayload> {
    const response = await fetch('/api/tutor', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body), cache: 'no-store', signal });
    const result = await response.json();
    if (!response.ok) throw new TutorRequestError(result.error || 'The tutor could not reply just yet. Try again.', response.status, result.code, result.current);
    return result as TutorPayload;
  }

  async function runTurn(body: TurnBody, kind: TurnKind) {
    if (busyRef.current || !mounted.current) return;
    busyRef.current = true;
    activeTurn.current = kind;
    setBusy(true);
    setStopping(kind === 'stop');
    setError('');
    setErrorCode('');
    setRetryable(false);
    failed.current = null;
    if (kind !== 'start') cancelSpeech();
    const id = ++sequence.current;
    const operation = new AbortController();
    controller.current = operation;
    const timeout = setTimeout(() => operation.abort('timeout'), 45_000);
    try {
      const result = await fetchTurn(body, operation.signal);
      if (!mounted.current || id !== sequence.current) return;
      latest.current = result;
      if (kind === 'stop' || result.stopped) {
        releaseMic();
        cancelSpeech();
        onClose();
        return;
      }
      if (kind === 'start') {
        setLesson(result);
        setNextLesson(null);
        scrollConversation.current = false;
        setBubbles([{ id: makeId(), role: 'assistant', content: result.message }]);
        conversation.current = boundedConversation([{ role: 'assistant', content: result.message }]);
        questionStart.current = Date.now();
      } else {
        appendBubble('assistant', result.message);
        if (kind === 'respond' || kind === 'message' && nextLesson) setNextLesson(result);
        else setLesson(result);
      }
      if (result.message) speak(result.message + (kind === 'start' && result.item ? ` ${result.item.passage ? `${result.item.passage} ` : ''}${result.item.prompt}` : ''));
    } catch (failure: unknown) {
      if (!mounted.current || id !== sequence.current) return;
      if (failure instanceof TutorRequestError && failure.status === 401) {
        cancelSpeech();
        releaseMic();
        onAuthRequired?.();
        setError('Ask Mum to sign in again, then we can carry on.');
        return;
      }
      if (failure instanceof TutorRequestError && failure.code === 'stale_turn' && failure.current) {
        const previousItem = latest.current?.item?.id;
        latest.current = failure.current;
        setLesson(failure.current);
        setNextLesson(null);
        if (previousItem !== failure.current.item?.id) {
          setAnswer('');
          setExplanation('');
          setMessage('');
          setBubbles([{ id: makeId(), role: 'assistant', content: failure.current.message }]);
          conversation.current = boundedConversation([{ role: 'assistant', content: failure.current.message }]);
          questionStart.current = Date.now();
        }
        setError('The lesson was updated. Your saved progress is here; carry on when you are ready.');
        return;
      }
      const timedOut = operation.signal.aborted && operation.signal.reason === 'timeout';
      const cancelled = operation.signal.aborted && operation.signal.reason === 'cancelled';
      setError(timedOut ? 'The tutor took too long to reply. Try again to pick up the same turn.' : cancelled ? 'Paused while waiting. Try the same turn again to pick up any reply your tutor has already saved.' : failure instanceof Error ? failure.message : 'The tutor could not reply just yet. Try again.');
      const code = failure instanceof TutorRequestError ? failure.code || '' : '';
      setErrorCode(code);
      if (code !== 'tutor_setup_required') {
        // Reuse the exact body and request ID: retrying must not save another answer.
        failed.current = { body, kind };
        setRetryable(true);
      }
    } finally {
      clearTimeout(timeout);
      if (mounted.current && id === sequence.current) {
        controller.current = null;
        activeTurn.current = null;
        busyRef.current = false;
        setBusy(false);
        setStopping(false);
      }
    }
  }

  function start() {
    if (busyRef.current || failed.current) return;
    if (voiceOnRef.current && getAustralianVoices().length) speak(intro);
    void runTurn({ action: 'start', subject, requestId: makeId() }, 'start');
  }

  function submitAnswer(event: FormEvent) {
    event.preventDefault();
    const state = latest.current;
    if (!state?.item || !answer.trim() || busyRef.current || failed.current || nextLesson || recording || micPending) return;
    const reasoning = explanation.trim();
    const spoken = reasoning ? `My answer is ${answer.trim()}. ${reasoning}` : `My answer is ${answer.trim()}.`;
    const previousConversation = conversation.current.slice(-8);
    appendBubble('user', spoken);
    void runTurn({ action: 'respond', sessionId: state.sessionId, revision: state.revision, requestId: makeId(), answer: answer.trim(), explanation: reasoning || undefined, responseMs: Math.min(720_000, Math.max(0, Date.now() - questionStart.current)), conversation: previousConversation }, 'respond');
  }

  function ask(text = message.trim()) {
    const state = latest.current;
    if (!state?.item || !lesson?.item || !text || busyRef.current || failed.current || nextLesson?.complete || recording || micPending) return;
    const previousConversation = conversation.current.slice(-8);
    appendBubble('user', text);
    setMessage('');
    void runTurn({ action: 'message', sessionId: state.sessionId, revision: state.revision, itemId: lesson.item.id, requestId: makeId(), message: text, conversation: previousConversation }, 'message');
  }

  function continueLesson() {
    if (!nextLesson || busyRef.current || failed.current || recording || micPending) return;
    cancelSpeech();
    setLesson(nextLesson);
    setNextLesson(null);
    setAnswer('');
    setExplanation('');
    setMessage('');
    setError('');
    setErrorCode('');
    failed.current = null;
    setRetryable(false);
    questionStart.current = Date.now();
    if (!nextLesson.complete && nextLesson.item) {
      const invitation = 'What do you think? You can tell me how you work it out.';
      scrollConversation.current = false;
      setBubbles([]);
      conversation.current = [];
      speak(`${nextLesson.item.passage ? `${nextLesson.item.passage} ` : ''}${nextLesson.item.prompt} ${invitation}`);
      requestAnimationFrame(() => {
        questionHeading.current?.focus({ preventScroll: true });
        lessonRoot.current?.scrollIntoView({ block: 'start', behavior: window.matchMedia('(prefers-reduced-motion: reduce)').matches ? 'auto' : 'smooth' });
      });
    }
  }

  function stop() {
    if (stopping || activeTurn.current === 'stop') return;
    if (failed.current?.kind === 'stop') { retry(); return; }
    // Stop is allowed to overtake a pending AI reply. Its owned server action
    // cancels that turn; a late response must never reopen this screen.
    if (busyRef.current) {
      sequence.current++;
      controller.current?.abort('stopped');
      controller.current = null;
      busyRef.current = false;
      setBusy(false);
    }
    releaseMic();
    cancelSpeech();
    const state = latest.current;
    if (!state || state.complete || state.stopped) { onClose(); return; }
    void runTurn({ action: 'stop', sessionId: state.sessionId, revision: state.revision, requestId: makeId() }, 'stop');
  }

  function cancelWaiting() {
    if (!busyRef.current || !controller.current) return;
    controller.current.abort('cancelled');
    // The server may already have saved this turn. Retry uses its original request ID.
    cancelSpeech();
  }

  async function transcribe(blob: Blob, durationMs: number, id: number) {
    if (!mounted.current || id !== micSequence.current) return;
    busyRef.current = true;
    setBusy(true);
    setError('');
    const operation = new AbortController();
    controller.current = operation;
    const timeout = setTimeout(() => operation.abort('timeout'), 35_000);
    try {
      const form = new FormData();
      form.set('audio', blob, blob.type.includes('mp4') ? 'summer-question.m4a' : 'summer-question.webm');
      form.set('durationMs', String(durationMs));
      const response = await fetch('/api/tutor/transcribe', { method: 'POST', body: form, cache: 'no-store', signal: operation.signal });
      const result = await response.json();
      if (!response.ok) throw new TutorRequestError(result.error || 'I could not hear that clearly. You can type your question instead.', response.status, result.code);
      if (!mounted.current || id !== micSequence.current) return;
      const text = typeof result.text === 'string' ? result.text.trim() : '';
      if (!text) throw new Error('I did not catch any words. Try the microphone again or type your idea.');
      setMessage(text.slice(0, 1200));
      if (text.length > 1200) setError('That was a long message. Check the words below before sending.');
      requestAnimationFrame(() => chatInput.current?.focus());
    } catch (failure: unknown) {
      if (!mounted.current || id !== micSequence.current) return;
      if (failure instanceof TutorRequestError && failure.status === 401) onAuthRequired?.();
      setError(operation.signal.aborted ? 'That recording took too long to send. You can type your idea or record it again.' : failure instanceof Error ? failure.message : 'I could not hear that clearly. Try again or type your idea.');
    } finally {
      clearTimeout(timeout);
      if (mounted.current && id === micSequence.current) {
        controller.current = null;
        busyRef.current = false;
        setBusy(false);
      }
    }
  }

  async function startRecording() {
    if (busyRef.current || failed.current || recording || micPending || nextLesson?.complete) return;
    cancelSpeech();
    setError('');
    if (!navigator.mediaDevices?.getUserMedia || typeof MediaRecorder === 'undefined') {
      setError('This browser cannot record here. You can type your idea or question below.');
      return;
    }
    const id = ++micSequence.current;
    recordingDiscarded.current = false;
    setMicPending(true);
    try {
      const input = await navigator.mediaDevices.getUserMedia({ audio: true });
      if (!mounted.current || id !== micSequence.current) { input.getTracks().forEach(track => track.stop()); return; }
      stream.current = input;
      const mime = ['audio/mp4', 'audio/webm;codecs=opus', 'audio/webm'].find(type => MediaRecorder.isTypeSupported(type));
      const media = new MediaRecorder(input, mime ? { mimeType: mime } : undefined);
      const chunks: Blob[] = [];
      recorder.current = media;
      media.ondataavailable = event => { if (event.data.size) chunks.push(event.data); };
      media.onerror = () => {
        if (mounted.current && id === micSequence.current) setError('The microphone stopped. Try again or type your idea.');
        releaseMic();
      };
      media.onstop = () => {
        if (recordingTimer.current) clearInterval(recordingTimer.current);
        recordingTimer.current = null;
        input.getTracks().forEach(track => track.stop());
        stream.current = null;
        recorder.current = null;
        if (!mounted.current || recordingDiscarded.current || id !== micSequence.current) return;
        setRecording(false);
        const duration = Math.min(60_000, Math.max(0, Date.now() - recordingStart.current));
        const blob = new Blob(chunks, { type: media.mimeType || mime || 'audio/webm' });
        if (!blob.size || duration < 500) { setError('Hold the microphone a little longer, then say your idea.'); return; }
        if (blob.size > 4 * 1024 * 1024) { setError('That recording was too large. Try a shorter question.'); return; }
        void transcribe(blob, duration, id);
      };
      recordingStart.current = Date.now();
      media.start();
      setMicPending(false);
      setRecordSeconds(0);
      setRecording(true);
      recordingTimer.current = setInterval(() => {
        const elapsed = Math.floor((Date.now() - recordingStart.current) / 1000);
        setRecordSeconds(Math.min(60, elapsed));
        if (elapsed >= 60) finishRecording();
      }, 250);
    } catch (failure: unknown) {
      if (!mounted.current || id !== micSequence.current) return;
      releaseMic();
      setError(failure instanceof DOMException && failure.name === 'NotAllowedError' ? 'The microphone is off. Ask Mum to allow it in the browser, or type your idea below.' : 'The microphone could not start. You can type your idea instead.');
    }
  }

  function finishRecording() {
    if (recorder.current?.state !== 'recording') return;
    if (recordingTimer.current) clearInterval(recordingTimer.current);
    recordingTimer.current = null;
    recorder.current.stop();
    stream.current?.getTracks().forEach(track => track.stop());
  }

  function retry() { const pending = failed.current; if (pending) void runTurn(pending.body, pending.kind); }
  const answerDisabled = busy || retryable || recording || micPending || !!nextLesson;
  const chatDisabled = busy || retryable || recording || micPending || !!nextLesson?.complete;
  const completed = !!lesson?.complete && !nextLesson;
  const progress = nextLesson?.progress || lesson?.progress;
  const activeSubject = lesson?.subject || subject;

  const errorPanel = error ? <div className="error-message tutor-error" role="alert"><p>{error}</p>{errorCode === 'tutor_setup_required' && <p>Ask Mum to finish the tutor database setup. Your starting test is kept separately.</p>}{retryable && <button type="button" className="secondary" disabled={busy} onClick={retry}>Try the same turn again</button>}</div> : null;
  const voiceNote = voiceError ? <p className="tutor-voice-note" role="status">{voiceError} <a href="/voice-check" target="_blank" rel="noreferrer">Check Australian voice</a></p> : !voiceAvailable && voiceOn ? <p className="tutor-voice-note">You can read every reply. <a href="/voice-check" target="_blank" rel="noreferrer">Set up Australian voice</a></p> : null;
  const voiceButton = <button type="button" className="speaker" aria-label={voiceOn ? 'Turn tutor voice off' : 'Turn tutor voice on'} aria-pressed={voiceOn} disabled={recording || micPending} onClick={toggleVoice}>{voiceOn ? <Volume2 size={23} aria-hidden="true" /> : <VolumeX size={23} aria-hidden="true" />}</button>;

  if (!lesson) return <section ref={lessonRoot} className="tutor-lesson" aria-label={`${subjectTitle[subject]} tutoring`}>
    {errorPanel}
    <div className="card centre-card tutor-start lavender">
      <Illustration name={subject === 'maths' ? 'card-maths' : 'card-english'} className="scene-art" />
      <p className="eyebrow">Year 1–2 · {subjectTitle[subject]}</p>
      <PageTitle first="Let’s work" second="it out together" />
      <p>Five questions, starting at Year 2. Tell your tutor what you think, ask a question, or try a hint.</p>
      <p>This is practice. Your starting test stays separate.</p>
      {voiceButton}
      {voiceNote}
      <button type="button" className="primary attached-arrow" disabled={busy || retryable} onClick={start}>{busy ? 'Opening your lesson…' : 'Start learning'}<ArrowCircle /></button>
      <button type="button" className="secondary" disabled={busy} onClick={onClose}>Back to lessons</button>
      {busy && <button type="button" className="skip-button" onClick={cancelWaiting}>Cancel waiting</button>}
    </div>
  </section>;

  if (completed) return <section ref={lessonRoot} className="tutor-lesson" aria-label="Lesson complete">
    {errorPanel}
    <div className="card centre-card completion-panel tutor-complete">
      <Illustration name="lesson-complete" className="scene-art" />
      <PageTitle first="Lesson done." second="Nice work." />
      <div className="completion-score"><span>{lesson.progress.correct}<small>/{lesson.progress.total}</small></span><p>Questions answered correctly in practice</p></div>
      <div className="tutor-chat-bubble assistant"><p>{lesson.message}</p></div>
      {voiceNote}
      <button type="button" className="speaker" aria-label="Hear your tutor’s feedback again" onClick={() => speak(lesson.message)}><Volume2 size={23} aria-hidden="true" /></button>
      <p className="saved-note"><Check size={17} aria-hidden="true" />Your lesson progress is saved.</p>
      <div className="reward-space" aria-hidden="true" />
      <button type="button" className="primary attached-arrow" onClick={() => { cancelSpeech(); void onComplete(); }}>Keep going<ArrowCircle /></button>
    </div>
  </section>;

  const item = lesson.item;
  return <section ref={lessonRoot} className="tutor-lesson" aria-label={`${subjectTitle[activeSubject]} tutoring`}>
    <div className="lesson-bar"><div><strong>{subjectTitle[activeSubject]} with your tutor</strong><br /><span>Year 1–2 practice</span></div><button type="button" className="secondary" disabled={stopping} onClick={stop}>{stopping ? 'Stopping…' : 'Stop for now'}</button></div>
    <div className="tutor-progress-copy"><span>Question {Math.min(5, (lesson.progress.answered || 0) + 1)} of {lesson.progress.total}</span><strong>{progress?.answered || 0}/{lesson.progress.total} done</strong></div>
    <ProgressTrack value={progress?.answered || 0} total={lesson.progress.total} label="Lesson progress" className="lesson-progress" />
    {errorPanel}
    {voiceNote}
    {item && <div className="tutor-layout">
      <div className="card tutor-question">
        <div className="read-row"><span className="tutor-year">Year {item.yearLevel} · {subjectTitle[activeSubject]}</span><button type="button" className="speaker" aria-label="Hear the question" disabled={recording || micPending} onClick={() => speak(`${item.passage ? `${item.passage} ` : ''}${item.prompt}`)}><Volume2 size={23} aria-hidden="true" /></button></div>
        {item.passage && <p className="passage">{item.passage}</p>}
        <h2 ref={questionHeading} tabIndex={-1} id="tutor-question-heading">{item.prompt}</h2>
        <form className="tutor-answer-form" onSubmit={submitAnswer} aria-labelledby="tutor-question-heading">
          <label id="tutor-answer-label" htmlFor={item.kind === 'choice' ? undefined : 'tutor-answer'}>Your answer</label>
          {item.kind === 'choice' && item.choices ? <div className="choices" role="group" aria-labelledby="tutor-answer-label">{item.choices.map(choice => <button key={choice} type="button" className={`choice ${answer === choice ? 'selected' : ''}`} aria-pressed={answer === choice} disabled={answerDisabled} onClick={() => setAnswer(choice)}>{choice}{answer === choice && <Check size={20} aria-hidden="true" />}</button>)}</div> : <input id="tutor-answer" value={answer} onChange={event => setAnswer(event.target.value)} maxLength={160} disabled={answerDisabled} inputMode={item.kind === 'number' ? 'decimal' : 'text'} autoComplete="off" />}
          <div className="tutor-explanation-label"><label htmlFor="tutor-explanation">How did you work it out?</label><small>Optional</small></div>
          <textarea id="tutor-explanation" value={explanation} onChange={event => setExplanation(event.target.value)} maxLength={1200} disabled={answerDisabled} placeholder="Tell me what you tried." rows={3} />
          {!nextLesson && <button type="submit" className="primary attached-arrow" disabled={answerDisabled || !answer.trim()}>{busy ? 'Your tutor is thinking…' : 'Tell my tutor'}<ArrowCircle /></button>}
        </form>
        {!nextLesson && <div className="tutor-hint-row"><button type="button" className="hint-button" disabled={chatDisabled} onClick={() => ask('Can you give me one small hint without telling me the answer?')}><Lightbulb size={19} aria-hidden="true" />One small hint</button><button type="button" className="skip-button" onClick={() => chatInput.current?.focus()} disabled={chatDisabled}>Ask a question</button></div>}
        {!nextLesson?.complete && <div className="tutor-recording-row"><button type="button" className={`primary mic-button ${recording ? 'recording' : ''}`} disabled={busy || retryable || micPending} onClick={() => recording ? finishRecording() : void startRecording()}>{recording ? <Square size={21} aria-hidden="true" /> : <Mic size={23} aria-hidden="true" />}{recording ? `Finish recording · ${recordSeconds}s` : micPending ? 'Allow the microphone…' : 'Talk to your tutor'}</button>{recording || micPending ? <button type="button" className="skip-button" onClick={() => releaseMic()}>Cancel recording</button> : <small>Say your idea or question, then check the words before sending. Audio is not saved.</small>}</div>}
      </div>
      <div className="card tutor-chat">
        <div className="tutor-chat-heading"><h2><BookOpen size={22} aria-hidden="true" />Your conversation</h2>{voiceButton}</div>
        <div className="tutor-chat-log" role="log" aria-label="Conversation with your tutor" aria-live="polite" aria-relevant="additions">
          {!bubbles.length && <p className="mic-note">Tell me what you think. I’ll help you with this question.</p>}
          {bubbles.map((bubble, index) => <div key={bubble.id} className={`tutor-chat-bubble ${bubble.role}`}><small>{bubble.role === 'user' ? 'Summer' : 'Your tutor'}</small><p>{bubble.content}</p>{bubble.role === 'assistant' && index === bubbles.length - 1 && <button type="button" className="speaker" aria-label="Hear your tutor’s reply again" disabled={recording || micPending} onClick={() => speak(bubble.content)}><Volume2 size={21} aria-hidden="true" /></button>}</div>)}
          <div ref={chatEnd} className="tutor-chat-end" />
        </div>
        {nextLesson && <div className="tutor-feedback" ref={feedbackEnd}><button type="button" className="primary attached-arrow" disabled={busy || retryable || recording || micPending} onClick={continueLesson}>{nextLesson.complete ? 'See my lesson summary' : 'Continue'}<ArrowCircle /></button><p>{nextLesson.complete ? 'Read or hear your tutor’s reply, then see how you did.' : 'You can keep talking about this question, or continue when you are ready.'}</p></div>}
        {!nextLesson?.complete && <form className="tutor-chat-form" onSubmit={event => { event.preventDefault(); ask(); }}><label htmlFor="tutor-message">What would you like to say?</label><textarea id="tutor-message" ref={chatInput} value={message} onChange={event => setMessage(event.target.value)} maxLength={1200} disabled={chatDisabled} rows={2} placeholder="Ask a question or tell me your idea." /><button type="submit" className="secondary" disabled={chatDisabled || !message.trim()}><Send size={18} aria-hidden="true" />Send to my tutor</button></form>}
        <p className="tutor-status" role="status">{recording ? 'The microphone is on. Finish recording when you are ready.' : busy ? 'Your tutor is thinking about what you said…' : speaking ? 'Your tutor is speaking. You can read along or switch the voice off.' : ''}</p>
        {busy && <button type="button" className="skip-button" onClick={cancelWaiting}>Cancel waiting</button>}
      </div>
    </div>}
  </section>;
}
