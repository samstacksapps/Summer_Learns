import test from 'node:test';
import assert from 'node:assert/strict';
import { AudioCache } from '../lib/audio-cache.ts';

const create = (maxEntries = 3, maxBytes = 20, ttlMs?: number) => new AudioCache<string>({maxEntries, maxBytes, sizeOf: value => value.length, ttlMs});
function deferred<Value>() {
  let resolve!: (value: Value) => void;
  let reject!: (error: Error) => void;
  const promise = new Promise<Value>((done, fail) => {resolve = done; reject = fail;});
  return {promise, resolve, reject};
}

test('two first requests and later replay share one successful loader', async () => {
  const cache = create(); const pending = deferred<string>(); let paidCalls = 0;
  const load = () => {paidCalls++; return pending.promise;};
  const first = cache.get('voice-v2:home', load);
  const second = cache.get('voice-v2:home', load);
  await Promise.resolve(); assert.equal(paidCalls, 1);
  pending.resolve('audio');
  assert.deepEqual(await Promise.all([first, second]), ['audio','audio']);
  assert.equal(await cache.get('voice-v2:home', load), 'audio');
  assert.equal(paidCalls, 1);
});

test('a failed or aborted load is not cached and retry can succeed', async () => {
  const cache = create(); let calls = 0;
  await assert.rejects(cache.get('item', async () => {calls++; throw new DOMException('Cancelled', 'AbortError');}), {name:'AbortError'});
  assert.equal(await cache.get('item', async () => {calls++; return 'complete';}), 'complete');
  assert.equal(await cache.get('item', async () => {throw new Error('Must not run');}), 'complete');
  assert.equal(calls, 2);
});

test('entry and byte limits discard oldest successes; oversize values are returned without retention', async () => {
  const count = create(2, 30);
  await count.get('a', async () => 'first'); await count.get('b', async () => 'second');
  await count.get('a', async () => 'unused'); // A replay does not change FIFO order.
  await count.get('c', async () => 'third');
  assert.equal(await count.get('a', async () => 'reloaded'), 'reloaded');
  const bytes = create(5, 6);
  await bytes.get('a', async () => '1234'); await bytes.get('b', async () => '5678');
  assert.equal(await bytes.get('a', async () => 'new'), 'new');
  let oversizedCalls = 0;
  const loadLarge = async () => {oversizedCalls++; return 'too-large';};
  await bytes.get('large', loadLarge); await bytes.get('large', loadLarge);
  assert.equal(oversizedCalls, 2);
});

test('clear discards successes and a pending result cannot resurrect cleared audio', async () => {
  const cache = create(); const old = deferred<string>();
  await cache.get('home', async () => 'cached');
  const oldRequest = cache.get('item', () => old.promise);
  await Promise.resolve(); cache.clear();
  assert.equal(await cache.get('home', async () => 'new'), 'new');
  const fresh = deferred<string>(); let calls = 0;
  const freshRequest = cache.get('item', () => {calls++; return fresh.promise;});
  await Promise.resolve(); old.resolve('old'); assert.equal(await oldRequest, 'old');
  const sameFresh = cache.get('item', () => {calls++; return Promise.resolve('wrong');});
  fresh.resolve('fresh');
  assert.deepEqual(await Promise.all([freshRequest, sameFresh]), ['fresh','fresh']);
  assert.equal(calls, 1);
  assert.equal(await cache.get('item', async () => 'wrong'), 'fresh');
});

test('expired audio loads again without timer side effects', async (context) => {
  context.mock.timers.enable({apis:['Date'], now:1000});
  const cache = create(2, 20, 10); let calls = 0;
  const load = async () => `audio-${++calls}`;
  assert.equal(await cache.get('home', load), 'audio-1');
  context.mock.timers.tick(9); assert.equal(await cache.get('home', load), 'audio-1');
  context.mock.timers.tick(1); assert.equal(await cache.get('home', load), 'audio-2');
});

test('different voice revisions and item identities never replay the previous spelling audio', async () => {
  const cache = create(); let calls = 0;
  const load = async () => `audio-${++calls}`;
  await cache.get('v1:item:session:cat', load);
  await cache.get('v2:item:session:cat', load);
  await cache.get('v2:item:session:dog', load);
  assert.equal(calls, 3);
});

test('invalid cache sizes reject rather than disabling memory bounds', async () => {
  assert.throws(() => create(0), RangeError);
  const cache = new AudioCache<string>({maxEntries:1,maxBytes:5,sizeOf:() => NaN});
  await assert.rejects(cache.get('home', async () => 'audio'), RangeError);
});
