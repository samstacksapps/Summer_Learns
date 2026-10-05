'use client';

import Link from 'next/link';
import {useEffect, useState} from 'react';
import {ArrowLeft, BookOpen, Volume2} from 'lucide-react';
import {cancelNative, getPreferredAustralianVoiceURI, sayNative, setPreferredAustralianVoice, subscribeAustralianVoices, type AustralianVoice} from '../../lib/browser-voice';

const preview = 'Hi there. Tell me how you worked it out. We can use a different method if that helps.';

export default function VoiceCheck() {
  const [voices, setVoices] = useState<AustralianVoice[]>([]);
  const [selected, setSelected] = useState('');
  const [loading, setLoading] = useState(true);
  const [state, setState] = useState<'ready'|'preparing'|'speaking'>('ready');
  const [message, setMessage] = useState('');

  useEffect(() => {
    const unsubscribe = subscribeAustralianVoices(available => {
      setVoices(available);
      setSelected(getPreferredAustralianVoiceURI() ?? '');
      if (available.length) setLoading(false);
    });
    const timer = setTimeout(() => setLoading(false), 5_000);
    return () => {clearTimeout(timer); unsubscribe(); cancelNative();};
  }, []);

  function choose(voiceURI: string) {
    cancelNative(); setState('ready');
    try {setPreferredAustralianVoice(voiceURI); setSelected(voiceURI); setMessage('Your voice choice is saved on this device.');}
    catch (error) {setMessage(error instanceof Error ? error.message : 'Choose an available voice.');}
  }

  function play() {
    setMessage(''); setState('preparing');
    // The actual speech call happens inside this tap, preserving phone playback permission.
    void sayNative(preview, () => setState('speaking')).then(result => {
      setState('ready');
      if (result === 'played') setMessage('Your voice choice is saved on this device.');
    }, error => {setState('ready'); setMessage(error instanceof Error ? error.message : 'The voice could not start. Try again.');});
  }

  return <main className="lab-shell screen-welcome">
    <header className="lab-header"><Link className="brand" href="/"><span className="brand-tile"><BookOpen size={24}/></span><span><strong>Summer’s Learning Lab</strong><br/>Maths and English</span></Link></header>
    <section className="warmup">
      <div className="page-intro"><h1><span className="title-line">Choose an</span><span className="title-italic">Australian voice</span></h1><p>Choose the voice you want to hear in lessons.</p></div>
      <div className="card question-panel">
        {voices.length ? <>
          <label htmlFor="australian-voice" style={{marginTop:0}}>Voice</label>
          <select id="australian-voice" value={selected} onChange={event => choose(event.target.value)}>{voices.map(voice => <option key={voice.voiceURI} value={voice.voiceURI}>{voice.name}</option>)}</select>
          <button className="primary" style={{width:'100%', marginTop:24}} disabled={state !== 'ready'} onClick={play}><Volume2 size={21}/>{state === 'speaking' ? 'Listening…' : state === 'preparing' ? 'Starting the voice…' : 'Try this voice'}</button>
          {state !== 'ready' && <button className="secondary" style={{marginTop:16}} onClick={() => {cancelNative(); setState('ready');}}>Stop</button>}
        </> : <>
          <h2>{loading ? 'Looking for Australian voices…' : 'Add an Australian voice'}</h2>
          {!loading && <p style={{marginTop:16}}>On iPhone, open Settings → Accessibility → Read &amp; Speak (or Spoken Content) → Voices → English. Download an Australian voice, then reopen this page.</p>}
          <p style={{marginTop:16, color:'var(--muted)'}}>The app uses Australian voices only.</p>
        </>}
        <p role="status" aria-live="polite" style={{marginTop:20}}>{message}</p>
      </div>
      <Link className="secondary" style={{marginTop:24}} href="/"><ArrowLeft size={19}/>Back to lessons</Link>
    </section>
  </main>;
}
