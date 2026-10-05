import models from './config/models.json';

// Authored UI instructions only. Question words and child recordings never belong here.
export const lines={
 hello:'Hi, Summer. I’m your computer voice. Let’s find your starting point.',
 start:'Try a few questions. There’s no rush. You can stop for a break.',
 maths:'Maths. Have a listen, then type your answer.',
 english:'English. Have a listen, then type or tap your answer.',
 reading:'Read the passage aloud. Mum can help with the microphone. Your reading will be saved so Mum can listen later.',
 spelling:'Listen to the word and its sentence. Then type the word. You can listen again.',
 good:'Answer saved. Nice work.',
 skip:'Thanks for telling me. We can try that another time.',
 try:'We can practise that one later.',
 rush:'Take your time. Let’s check that one again.',
 hint:'Take your time. Think about the first step. Mum can help.',
 break:'Time for a movement break. Try a goanna walk, then come back when you’re ready.',
 finish:'You kept going and gave it a try. We’ll build from here.',
 win:'Session done. Nice work. Your answers are saved.',
 stop:'Your answers are saved. We can come back when you’re ready.',
 recording:'Tap the microphone and read the passage. Tap stop when you’re done.',
 replay:'Tap the speaker to hear the words again.',
 home:'Hi, Summer. Take your time. Choose your warm-up when you’re ready.',
 menu:'Home. Learn. Progress. Me.'
} as const;
export type FixedVoiceLine=keyof typeof lines;

export function fixedVoicePath(line:unknown):string|undefined{
 if(typeof line!=='string'||!Object.hasOwn(lines,line))return undefined;
 if(!/^[a-zA-Z0-9_-]+$/.test(models.voiceRevision))return undefined;
 return `/audio/${models.voiceRevision}/${line}.mp3`;
}
