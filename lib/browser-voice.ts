/** Device speech avoids an extra audio-generation request and never chooses a US fallback. */
export type NativeVoiceOutcome = 'played' | 'cancelled';
export type BrowserVoiceErrorCode = 'unsupported' | 'loading' | 'unavailable' | 'timeout' | 'playback';
export type AustralianVoice = Pick<SpeechSynthesisVoice, 'voiceURI' | 'name' | 'lang' | 'localService' | 'default'>;

export class BrowserVoiceError extends Error {
  constructor(public readonly code: BrowserVoiceErrorCode, message: string) {
    super(message);
    this.name = 'BrowserVoiceError';
  }
}

type VoiceDriver = {
  synthesis: Pick<SpeechSynthesis, 'getVoices' | 'speak' | 'cancel' | 'addEventListener' | 'removeEventListener'>;
  utterance: (text: string) => SpeechSynthesisUtterance;
  storage?: Pick<Storage, 'getItem' | 'setItem'>;
  startTimeoutMs?: number;
};

const preferenceKey = 'summer.au-voice.v1';
const isAustralian = (voice: AustralianVoice) => /^en-au(?:-|$)/i.test(voice.lang.replaceAll('_', '-'));

/** Exported for tests with a browser driver; no window access happens at module import. */
export function createNativeVoiceEngine(driver: VoiceDriver) {
  let active: {cancel: () => void} | undefined;
  let preferredURI: string | null = null;
  try { preferredURI = driver.storage?.getItem(preferenceKey) ?? null; } catch { /* Private browsing can deny storage. */ }

  function voices(): SpeechSynthesisVoice[] {
    const seen = new Set<string>();
    return driver.synthesis.getVoices().filter(voice => {
      if (!isAustralian(voice) || seen.has(voice.voiceURI)) return false;
      seen.add(voice.voiceURI);
      return true;
    }).sort((left, right) => {
      const rank = (voice: SpeechSynthesisVoice) => Number(voice.localService) * 4 + Number(/enhanced|premium|natural/i.test(voice.name)) * 2 + Number(voice.default);
      return rank(right) - rank(left) || left.name.localeCompare(right.name);
    });
  }

  function list(): AustralianVoice[] {
    return voices().map(({voiceURI, name, lang, localService, default: isDefault}) => ({voiceURI, name, lang, localService, default: isDefault}));
  }

  function preferred(): string | null {
    const available = voices();
    return available.find(voice => voice.voiceURI === preferredURI)?.voiceURI ?? available[0]?.voiceURI ?? null;
  }

  function select(voiceURI: string) {
    if (!voices().some(voice => voice.voiceURI === voiceURI)) throw new BrowserVoiceError('unavailable', 'Choose an Australian voice that is available on this device.');
    preferredURI = voiceURI;
    try { driver.storage?.setItem(preferenceKey, voiceURI); } catch { /* Keep the choice for this visit even without storage. */ }
  }

  function cancel() {
    if (active) active.cancel();
  }

  function subscribe(listener: (available: AustralianVoice[]) => void) {
    const changed = () => listener(list());
    driver.synthesis.addEventListener('voiceschanged', changed);
    changed();
    return () => driver.synthesis.removeEventListener('voiceschanged', changed);
  }

  function say(text: string, onStart?: () => void, signal?: AbortSignal, onBoundary?: (charIndex: number) => void): Promise<NativeVoiceOutcome> {
    if (signal?.aborted) return Promise.resolve('cancelled');
    const available = voices();
    const voice = available.find(candidate => candidate.voiceURI === preferredURI) ?? available[0];
    if (!voice) {
      const loading = driver.synthesis.getVoices().length === 0;
      return Promise.reject(new BrowserVoiceError(loading ? 'loading' : 'unavailable', loading
        ? 'The phone’s voices are still loading. Try again in a moment.'
        : 'An Australian voice is not available on this device yet. Open Choose voice to set one up.'));
    }
    if (!text.trim() || text.length > 4096) return Promise.reject(new BrowserVoiceError('playback', 'This message could not be read aloud.'));
    cancel();

    // This promise executor runs now. Never await loading, a silent clip or a timer before speak().
    return new Promise<NativeVoiceOutcome>((resolve, reject) => {
      let settled = false;
      let started = false;
      let startTimer: ReturnType<typeof setTimeout> | undefined;
      let endTimer: ReturnType<typeof setTimeout> | undefined;
      const utterance = driver.utterance(text);
      utterance.voice = voice;
      utterance.lang = 'en-AU';
      utterance.rate = 1;
      utterance.pitch = 1;
      utterance.volume = 1;

      function finish(result: NativeVoiceOutcome | BrowserVoiceError) {
        if (settled) return;
        settled = true;
        clearTimeout(startTimer);
        clearTimeout(endTimer);
        signal?.removeEventListener('abort', cancelled);
        utterance.onstart = null;
        utterance.onboundary = null;
        utterance.onend = null;
        utterance.onerror = null;
        if (active === operation) active = undefined;
        if (result instanceof BrowserVoiceError) reject(result); else resolve(result);
      }
      function cancelled() {
        finish('cancelled');
        driver.synthesis.cancel();
      }
      function began() {
        if (settled || started) return;
        started = true;
        clearTimeout(startTimer);
        // Some browsers omit onend. A bounded wait leaves the controls recoverable.
        endTimer = setTimeout(() => {
          finish(new BrowserVoiceError('timeout', 'The voice stopped responding. Tap Hear again to retry.'));
          driver.synthesis.cancel();
        }, Math.min(180_000, Math.max(30_000, text.length * 120)));
        onStart?.();
      }
      const operation = {cancel: cancelled};
      active = operation;
      utterance.onstart = began;
      utterance.onboundary = event => {
        if (settled || active !== operation) return;
        began();
        // onStart can cancel or replace this utterance, so check again before highlighting.
        if (settled || active !== operation) return;
        if ((event.name === 'word' || event.name === 'sentence') && Number.isInteger(event.charIndex) && event.charIndex >= 0 && event.charIndex <= text.length) onBoundary?.(event.charIndex);
      };
      utterance.onend = () => finish('played');
      utterance.onerror = event => {
        if (event.error === 'canceled' || event.error === 'interrupted') finish('cancelled');
        else finish(new BrowserVoiceError('playback', 'The voice could not start. Check the volume and tap Hear again.'));
      };
      signal?.addEventListener('abort', cancelled, {once: true});
      startTimer = setTimeout(() => {
        finish(new BrowserVoiceError('timeout', 'The voice did not start. Tap Hear again, or open Choose voice.'));
        driver.synthesis.cancel();
      }, driver.startTimeoutMs ?? 8_000);
      try {
        driver.synthesis.speak(utterance);
      } catch {
        finish(new BrowserVoiceError('playback', 'The voice could not start. Tap Hear again to retry.'));
      }
    });
  }

  return {getAustralianVoices: list, getPreferredAustralianVoiceURI: preferred, setPreferredAustralianVoice: select, subscribeAustralianVoices: subscribe, sayNative: say, cancelNative: cancel};
}

let browserEngine: ReturnType<typeof createNativeVoiceEngine> | undefined;
function engine() {
  if (typeof window === 'undefined' || !('speechSynthesis' in window) || !('SpeechSynthesisUtterance' in window)) return undefined;
  if (!browserEngine) {
    let storage: Storage | undefined;
    try { storage = window.localStorage; } catch { /* Storage is optional. */ }
    browserEngine = createNativeVoiceEngine({synthesis: window.speechSynthesis, utterance: text => new SpeechSynthesisUtterance(text), storage});
  }
  return browserEngine;
}

export const getAustralianVoices = () => engine()?.getAustralianVoices() ?? [];
export const getPreferredAustralianVoiceURI = () => engine()?.getPreferredAustralianVoiceURI() ?? null;
export function setPreferredAustralianVoice(voiceURI: string) {
  const current = engine();
  if (!current) throw new BrowserVoiceError('unsupported', 'This browser does not support spoken lessons. Try Safari or Chrome.');
  current.setPreferredAustralianVoice(voiceURI);
}
export function subscribeAustralianVoices(listener: (available: AustralianVoice[]) => void) {
  const current = engine();
  if (current) return current.subscribeAustralianVoices(listener);
  listener([]);
  return () => {};
}
export const cancelNative = () => engine()?.cancelNative();
export function sayNative(text: string, onStart?: () => void, signal?: AbortSignal, onBoundary?: (charIndex: number) => void): Promise<NativeVoiceOutcome> {
  const current = engine();
  return current ? current.sayNative(text, onStart, signal, onBoundary)
    : Promise.reject(new BrowserVoiceError('unsupported', 'This browser does not support spoken lessons. Try Safari or Chrome.'));
}
