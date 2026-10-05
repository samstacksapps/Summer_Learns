import test from 'node:test';
import assert from 'node:assert/strict';
import {BrowserVoiceError, createNativeVoiceEngine} from '../lib/browser-voice.ts';

const voice = (name: string, lang: string, localService = true): SpeechSynthesisVoice => ({name, lang, voiceURI:name, localService, default:false});
class FakeSynthesis extends EventTarget {
  voices: SpeechSynthesisVoice[] = [];
  spoken: SpeechSynthesisUtterance[] = [];
  cancellations = 0;
  getVoices() {return this.voices;}
  speak(utterance: SpeechSynthesisUtterance) {this.spoken.push(utterance);}
  cancel() {this.cancellations++;}
}
function setup(available = [voice('Karen', 'en-AU')], initialPreference?: string, denyStorage = false) {
  const synthesis = new FakeSynthesis(); synthesis.voices = available;
  const storage = new Map<string, string>(); if (initialPreference) storage.set('summer.au-voice.v1', initialPreference);
  const engine = createNativeVoiceEngine({
    synthesis,
    utterance: text => ({text, onstart:null, onboundary:null, onend:null, onerror:null} as SpeechSynthesisUtterance),
    storage: {getItem: key => {if (denyStorage) throw new Error('Denied'); return storage.get(key) ?? null;}, setItem: (key, value) => {if (denyStorage) throw new Error('Denied'); storage.set(key, value);}},
    startTimeoutMs: 50,
  });
  return {engine, synthesis, storage};
}
const end = (utterance: SpeechSynthesisUtterance) => utterance.onend?.({} as SpeechSynthesisEvent);
const start = (utterance: SpeechSynthesisUtterance) => utterance.onstart?.({} as SpeechSynthesisEvent);

test('speaks the actual text synchronously on a tap and uses an Australian voice', async () => {
  const {engine, synthesis} = setup([voice('US voice', 'en-US'), voice('Karen', 'en-AU')]);
  let starts = 0;
  const pending = engine.sayNative('Tell me how you worked it out.', () => starts++);
  assert.equal(synthesis.spoken.length, 1, 'no fetch, promise or silent primer may precede speak');
  const utterance = synthesis.spoken[0];
  assert.equal(utterance.text, 'Tell me how you worked it out.');
  assert.equal(utterance.voice?.lang, 'en-AU');
  assert.equal(utterance.lang, 'en-AU');
  start(utterance); utterance.onboundary?.({} as SpeechSynthesisEvent);
  assert.equal(starts, 1);
  end(utterance); assert.equal(await pending, 'played');
});

test('never substitutes a US or British voice when Australian speech is unavailable', async () => {
  const {engine, synthesis} = setup([voice('Samantha', 'en-US'), voice('Daniel', 'en-GB')]);
  assert.deepEqual(engine.getAustralianVoices(), []);
  await assert.rejects(engine.sayNative('Try this voice.'), (error: unknown) => error instanceof BrowserVoiceError && error.code === 'unavailable');
  assert.equal(synthesis.spoken.length, 0);
  assert.throws(() => engine.setPreferredAustralianVoice('Samantha'), BrowserVoiceError);
});

test('empty initial voice lists can populate later without overwriting other voiceschanged listeners', async () => {
  const {engine, synthesis} = setup([]);
  const observed: string[][] = []; let otherEvents = 0;
  synthesis.addEventListener('voiceschanged', () => otherEvents++);
  const unsubscribe = engine.subscribeAustralianVoices(available => observed.push(available.map(entry => entry.name)));
  await assert.rejects(engine.sayNative('Try this voice.'), (error: unknown) => error instanceof BrowserVoiceError && error.code === 'loading');
  synthesis.voices = [voice('Karen', 'en_AU'), voice('Samantha', 'en-US')];
  synthesis.dispatchEvent(new Event('voiceschanged'));
  assert.deepEqual(observed, [[], ['Karen']]);
  assert.equal(otherEvents, 1);
  unsubscribe(); synthesis.dispatchEvent(new Event('voiceschanged'));
  assert.equal(observed.length, 2); assert.equal(otherEvents, 2);
});

test('device preferences select only an available Australian voice and survive denied storage', async () => {
  const available = [voice('Karen', 'en-AU'), voice('Lee', 'en-AU')];
  const {engine, synthesis, storage} = setup(available);
  engine.setPreferredAustralianVoice('Lee');
  assert.equal(storage.get('summer.au-voice.v1'), 'Lee');
  const pending = engine.sayNative('Try this voice.');
  assert.equal(synthesis.spoken[0].voice?.name, 'Lee'); end(synthesis.spoken[0]); await pending;
  const privateVisit = setup(available, undefined, true);
  privateVisit.engine.setPreferredAustralianVoice('Lee');
  assert.equal(privateVisit.engine.getPreferredAustralianVoiceURI(), 'Lee');
  const oldDevice = setup(available, 'Removed Australian voice');
  assert.equal(oldDevice.engine.getPreferredAustralianVoiceURI(), 'Karen');
});

test('prefer a downloaded enhanced voice and deduplicate browser voice entries', () => {
  const normal = voice('Karen', 'en-AU');
  const enhanced = voice('Karen Enhanced', 'en-AU');
  const remote = voice('Online Natural', 'en-AU', false);
  const {engine} = setup([normal, remote, normal, enhanced]);
  assert.deepEqual(engine.getAustralianVoices().map(entry => entry.name), ['Karen Enhanced', 'Karen', 'Online Natural']);
});

test('abort cancels playback and a cancelled request cannot start or finish a later one', async () => {
  const {engine, synthesis} = setup(); const controller = new AbortController();
  let starts = 0;
  const first = engine.sayNative('First message.', () => starts++, controller.signal);
  const oldUtterance = synthesis.spoken[0];
  const lateStart = oldUtterance.onstart; const lateEnd = oldUtterance.onend;
  controller.abort(); assert.equal(await first, 'cancelled'); assert.equal(synthesis.cancellations, 1);
  const second = engine.sayNative('Second message.', () => starts++);
  lateStart?.call(oldUtterance, {} as SpeechSynthesisEvent);
  lateEnd?.call(oldUtterance, {} as SpeechSynthesisEvent);
  assert.equal(starts, 0);
  start(synthesis.spoken[1]); end(synthesis.spoken[1]);
  assert.equal(await second, 'played'); assert.equal(starts, 1);
});

test('a new speech request cancels the previous request instead of queueing stale tutor messages', async () => {
  const {engine, synthesis} = setup();
  const first = engine.sayNative('First message.');
  const second = engine.sayNative('Second message.');
  assert.equal(await first, 'cancelled'); assert.equal(synthesis.cancellations, 1);
  end(synthesis.spoken[1]); assert.equal(await second, 'played');
});

test('missing start events time out and recover rather than leaving the app at Just a moment', async context => {
  context.mock.timers.enable({apis:['setTimeout']});
  const {engine, synthesis} = setup(); let starts = 0;
  const pending = engine.sayNative('Try this voice.', () => starts++);
  const lateStart = synthesis.spoken[0].onstart;
  const rejected = assert.rejects(pending, (error: unknown) => error instanceof BrowserVoiceError && error.code === 'timeout');
  context.mock.timers.tick(50); await rejected;
  assert.equal(synthesis.cancellations, 1);
  lateStart?.call(synthesis.spoken[0], {} as SpeechSynthesisEvent); assert.equal(starts, 0);
  const retry = engine.sayNative('Try this voice.'); start(synthesis.spoken[1]); end(synthesis.spoken[1]);
  assert.equal(await retry, 'played');
});

test('a voice that never finishes also times out, and reported playback failures remain failures', async context => {
  context.mock.timers.enable({apis:['setTimeout']});
  const {engine, synthesis} = setup();
  const pending = engine.sayNative('Try this voice.');
  const rejected = assert.rejects(pending, (error: unknown) => error instanceof BrowserVoiceError && error.code === 'timeout');
  start(synthesis.spoken[0]); context.mock.timers.tick(30_000); await rejected;
  const failed = engine.sayNative('Try again.');
  const failure = assert.rejects(failed, (error: unknown) => error instanceof BrowserVoiceError && error.code === 'playback');
  synthesis.spoken[1].onerror?.({error:'not-allowed'} as SpeechSynthesisErrorEvent); await failure;
});

test('already aborted and empty messages never play or interrupt other speech', async () => {
  const {engine, synthesis} = setup(); const controller = new AbortController(); controller.abort();
  assert.equal(await engine.sayNative('Try this voice.', undefined, controller.signal), 'cancelled');
  await assert.rejects(engine.sayNative('  '), BrowserVoiceError);
  assert.equal(synthesis.spoken.length, 0); assert.equal(synthesis.cancellations, 0);
});

test('word and sentence boundaries highlight valid positions and ignore cancelled utterances', async () => {
  const {engine, synthesis} = setup(); const positions: number[] = []; let starts = 0;
  const first = engine.sayNative('Tell me how.', () => starts++, undefined, position => positions.push(position));
  const utterance = synthesis.spoken[0]; const oldBoundary = utterance.onboundary!;
  const boundary = (name: string, charIndex: number) => oldBoundary.call(utterance, {name, charIndex} as SpeechSynthesisEvent);
  boundary('word', 0); boundary('sentence', 5); boundary('word', 8);
  assert.equal(starts, 1);
  assert.deepEqual(positions, [0, 5, 8]);
  boundary('mark', 0); boundary('word', NaN); boundary('word', Infinity); boundary('word', -1); boundary('word', 1000); boundary('word', 0.5);
  assert.deepEqual(positions, [0, 5, 8]);
  const second = engine.sayNative('Another question.', undefined, undefined, position => positions.push(position));
  assert.equal(await first, 'cancelled');
  boundary('word', 10); assert.deepEqual(positions, [0, 5, 8]);
  synthesis.spoken[1].onboundary?.({name:'word', charIndex:8} as SpeechSynthesisEvent);
  assert.deepEqual(positions, [0, 5, 8, 8]); end(synthesis.spoken[1]); await second;
});

test('a boundary that triggers cancellation from onStart cannot also change the question highlight', async () => {
  const {engine, synthesis} = setup(); const positions: number[] = [];
  const pending = engine.sayNative('Tell me how.', () => engine.cancelNative(), undefined, position => positions.push(position));
  synthesis.spoken[0].onboundary?.({name:'word', charIndex:0} as SpeechSynthesisEvent);
  assert.equal(await pending, 'cancelled'); assert.deepEqual(positions, []);
});
