import {lessonTopics,type Recommendation} from './lesson-recommendations';
import {shuffledChoices} from './choice-order';
/** Daily practice is deliberately separate from the baseline and follow-up item bank. */
export type TutorSubject='maths'|'english';
export type ObservationCode='tens-and-ones'|'counting-on'|'equal-groups'|'drawing-a-model'|'rereading-clues'|'checking-word-parts'|'explaining-a-reason'|'trying-another-way';
export const observationLabels:Record<ObservationCode,string>={
 'tens-and-ones':'Used tens and ones', 'counting-on':'Counted on', 'equal-groups':'Used equal groups',
 'drawing-a-model':'Used a drawing or model', 'rereading-clues':'Reread the clues',
 'checking-word-parts':'Checked word parts', 'explaining-a-reason':'Explained a reason', 'trying-another-way':'Tried another approach',
};
export type TutorItem={id:string;skillId:string;subject:TutorSubject;yearLevel:1|2;kind:'number'|'choice';prompt:string;acceptedAnswers:string[];teachingNote:string;choices?:string[];passage?:string};
export type PublicTutorItem=Omit<TutorItem,'acceptedAnswers'|'teachingNote'|'subject'>;
export type TutorPlan={version:1;subject:TutorSubject;focus?:Recommendation;items:{year1:TutorItem;year2:TutorItem;entryYear?:1|2}[]};
export type TutorState={index:number;correct:number;incorrectStreak:number;helped:boolean;observations:ObservationCode[]};
export type TutorPayload={sessionId:string;revision:number;subject:TutorSubject;focus?:Recommendation;item:PublicTutorItem|null;message:string;progress:{answered:number;total:5;correct:number};complete:boolean;stopped?:true;observations?:string[];result?:{correct:boolean;assisted:boolean;yearLevel:1|2}};
export function initialTutorState():TutorState{return {index:0,correct:0,incorrectStreak:0,helped:false,observations:[]};}
export function publicTutorItem(item:TutorItem):PublicTutorItem{const {acceptedAnswers:_answers,teachingNote:_note,subject:_subject,...shown}=item;return {...shown,choices:shuffledChoices(item.choices,item.id)};}
function normalise(value:string){const normalised=value.normalize('NFKC').trim().toLocaleLowerCase('en-AU').replace(/[‘’]/g,"'").replace(/\s+/g,' ');return /^[+-]?(?:\d+(?:\.\d*)?|\.\d+)$/.test(normalised)?String(Number(normalised)):normalised;}
export function gradeTutorAnswer(item:TutorItem,answer:string){
 // Capitalisation is itself the learning target in some choice questions.
 const choiceValue=(value:string)=>value.normalize('NFKC').trim().replace(/[‘’]/g,"'").replace(/\s+/g,' ');
 return item.kind==='choice'?item.acceptedAnswers.some(a=>choiceValue(a)===choiceValue(answer)):item.acceptedAnswers.some(a=>normalise(a)===normalise(answer));
}
/** Year 2 is the entry point. Two consecutive misses offer Year 1 support. */
export function currentTutorItem(plan:TutorPlan,state:TutorState){const slot=plan.items[state.index];return slot?(state.incorrectStreak>=2||slot.entryYear===1?slot.year1:slot.year2):null;}
export function advanceTutorState(state:TutorState,correct:boolean):TutorState{return {...state,index:state.index+1,correct:state.correct+(correct?1:0),incorrectStreak:correct?0:state.incorrectStreak+1,helped:false};}
function numberItem(id:string,yearLevel:1|2,skill:string,prompt:string,answer:number,note:string):TutorItem{return {id,subject:'maths',yearLevel,skillId:`maths-y${yearLevel}-${skill}`,kind:'number',prompt,acceptedAnswers:[String(answer)],teachingNote:note};}
type EnglishTemplate={skill:string;prompt:string;choices:string[];answer:string;note:string;passage?:string};
const englishYear1:EnglishTemplate[][]=[
 [
  {skill:'story-order',passage:'Mia packed her lunch. Then she put on her shoes. Last, she walked to school.',prompt:'What did Mia do just before she walked to school?',choices:['Packed her lunch','Put on her shoes','Ate her lunch'],answer:'Put on her shoes',note:'Use the order words then and last. The event before the last one is putting on her shoes.'},
  {skill:'story-order',passage:'Ben watered the seedlings. He put the watering can away. Then he washed his hands.',prompt:'What did Ben do after watering the seedlings?',choices:['Washed his hands','Put the watering can away','Picked a flower'],answer:'Put the watering can away',note:'Reread the event straight after watering. Distinguish the next event from the final event.'},
  {skill:'story-order',passage:'Asha mixed the batter. Next she baked the cake. Once it cooled, she cut a slice.',prompt:'What happened before Asha baked the cake?',choices:['She mixed the batter','She cut a slice','The cake cooled'],answer:'She mixed the batter',note:'Before means earlier. Follow the sequence of the three events.'},
 ],
 [
  {skill:'everyday-word-meaning',prompt:'The box was empty. Which word means the opposite of empty?',choices:['Small','Full','Open'],answer:'Full',note:'Empty means there is nothing inside; full means there is no space left.'},
  {skill:'everyday-word-meaning',prompt:'The path is wide. Which word means the opposite of wide?',choices:['Long','Narrow','Bumpy'],answer:'Narrow',note:'Wide describes a lot of space across. Narrow means little space across.'},
  {skill:'everyday-word-meaning',prompt:'The kitten was quiet. Which word means the opposite of quiet?',choices:['Loud','Gentle','Tiny'],answer:'Loud',note:'Quiet and loud describe the amount of sound.'},
 ],
 [
  {skill:'spell-consonant-blends',prompt:'Which word correctly completes this sentence? I put a ___ on the envelope.',choices:['stap','stamp','samp'],answer:'stamp',note:'Listen for both sounds in st at the start and mp at the end. We use a stamp on an envelope.'},
  {skill:'spell-consonant-blends',prompt:'Which word correctly completes this sentence? The frog can ___.',choices:['jump','jup','jum'],answer:'jump',note:'Jump ends with both m and p. Say the word slowly and check the end.'},
  {skill:'spell-consonant-blends',prompt:'Which word correctly completes this sentence? The bird made a ___.',choices:['nest','nes','net'],answer:'nest',note:'Nest has both s and t at the end. Check the word against the meaning of the sentence.'},
 ],
 [
  {skill:'spell-digraphs',prompt:'Which word names something you can sit on?',choices:['chair','shair','cair'],answer:'chair',note:'The letters ch work together at the start of chair.'},
  {skill:'spell-digraphs',prompt:'Which word completes this sentence? We saw a ___ sail past.',choices:['sip','chip','ship'],answer:'ship',note:'Sh makes one sound in ship. Check which word makes sense for something that sails.'},
  {skill:'spell-digraphs',prompt:'Which word completes this sentence? I brush my ___ every day.',choices:['teeth','teet','teech'],answer:'teeth',note:'The letters th work together at the end of teeth.'},
 ],
 [
  {skill:'story-order',passage:'Leo put a banana in his bag. At the park, he shared it with his sister.',prompt:'What did Leo share with his sister?',choices:['His bag','A banana','A book'],answer:'A banana',note:'Find the named object in the first sentence. It in the second sentence refers to that banana.'},
  {skill:'story-order',passage:'Eva took a blue towel to the pool. She hung it on a hook before swimming.',prompt:'What colour was Eva’s towel?',choices:['Green','Blue','Pink'],answer:'Blue',note:'Find the describing word next to towel in the first sentence.'},
  {skill:'story-order',passage:'Noah found a smooth stone near the creek. He left it beside a tall tree.',prompt:'Where did Noah leave the stone?',choices:['Beside a tall tree','In his pocket','At home'],answer:'Beside a tall tree',note:'The first sentence says where he found it. The second says where he left it.'},
 ],
];
const englishYear2:EnglishTemplate[][]=[
 [
  {skill:'cause-and-effect',passage:'Priya covered the seedlings with a clear lid. That night the air was very cold. In the morning, the covered seedlings were still healthy.',prompt:'Why did Priya cover the seedlings?',choices:['To protect them from the cold','To make the soil dry','To stop them growing'],answer:'To protect them from the cold',note:'Connect the very cold air to the protective cover. Use clues in more than one sentence.'},
  {skill:'cause-and-effect',passage:'The library was closing soon. Oliver checked the clock and quickly chose one book instead of three.',prompt:'Why did Oliver choose only one book?',choices:['He already owned the other books','He had little time left','The library had only one book'],answer:'He had little time left',note:'The library was closing soon, which explains his quick choice. Do not invent facts outside the passage.'},
  {skill:'cause-and-effect',passage:'The footpath was wet after the rain. Ruby slowed down and held the handrail as she stepped down.',prompt:'Why did Ruby slow down?',choices:['The wet path could be slippery','She forgot where she was going','She wanted to get wetter'],answer:'The wet path could be slippery',note:'Connect the wet surface and holding a handrail to moving safely.'},
 ],
 [
  {skill:'meaning-from-context',prompt:'The puppy was weary after its long walk and curled up to sleep. What does weary mean here?',choices:['Very tired','Very noisy','Very thirsty'],answer:'Very tired',note:'The long walk and curling up to sleep are clues that weary means tired.'},
  {skill:'meaning-from-context',prompt:'The delicate shell cracked when the heavy stone touched it. What does delicate mean here?',choices:['Easy to break','Hard to find','Very dirty'],answer:'Easy to break',note:'The shell cracking tells us delicate means easily damaged or broken.'},
  {skill:'meaning-from-context',prompt:'The room was dim, so Arlo switched on a lamp to read. What does dim mean here?',choices:['Not very bright','Very warm','Full of people'],answer:'Not very bright',note:'Needing a lamp to read is the clue about low light.'},
 ],
 [
  {skill:'spell-simple-suffixes',prompt:'Which word completes this sentence? Yesterday, I ___ my friend to carry the books.',choices:['helping','helped','helps'],answer:'helped',note:'Yesterday tells us this happened in the past. Add ed to help to make helped.'},
  {skill:'spell-simple-suffixes',prompt:'Which word completes this sentence? Right now, the children are ___ the seeds.',choices:['planted','planting','plants'],answer:'planting',note:'Are and right now describe an action happening now. Plant plus ing is planting.'},
  {skill:'spell-simple-suffixes',prompt:'Which word completes this sentence? Last night, Dad ___ the plates.',choices:['washing','washes','washed'],answer:'washed',note:'Last night is in the past. Wash plus ed makes washed.'},
 ],
 [
  {skill:'spell-long-vowels',prompt:'Which correctly spelt word completes this sentence? We followed the ___ to the beach.',choices:['trail','tral','trale'],answer:'trail',note:'The ai letter team represents the long a sound in trail.'},
  {skill:'spell-long-vowels',prompt:'Which correctly spelt word completes this sentence? I will ___ my favourite book.',choices:['reed','read','red'],answer:'read',note:'In this sentence read has a long e sound written ea. Red is a colour; reed is a plant.'},
  {skill:'spell-long-vowels',prompt:'Which correctly spelt word completes this sentence? The boat will ___ on the water.',choices:['flote','float','flot'],answer:'float',note:'The oa letter team represents the long o sound in float.'},
 ],
 [
  {skill:'cause-and-effect',passage:'Zara heard thunder as she reached the oval. She turned around and went back inside with her class.',prompt:'Which clue best explains why Zara went inside?',choices:['She was with her class','She reached the oval','She heard thunder'],answer:'She heard thunder',note:'Thunder signals a storm. It is the clue connected to going inside for safety.'},
  {skill:'cause-and-effect',passage:'Finn’s first paper bridge bent under three blocks. He folded the edges of a new bridge, and it held five blocks.',prompt:'Why did Finn fold the edges of his second bridge?',choices:['To make it stronger','To make it shorter','To hide the blocks'],answer:'To make it stronger',note:'Compare how many blocks each bridge held. Folding the edges improved its strength.'},
  {skill:'cause-and-effect',passage:'Lila noticed her plant leaning towards the window. She turned the pot so the other side faced the sunlight.',prompt:'Why did Lila turn the pot?',choices:['So the other side could get sunlight','So the plant would lose its leaves','So the soil would be cold'],answer:'So the other side could get sunlight',note:'The direction of the window and sunlight explains why she changed the pot’s direction.'},
 ],
];
englishYear1.push(
 [{skill:'sentence-punctuation',prompt:'Which sentence begins with a capital letter and ends with a full stop?',choices:['My dog is brown.','my dog is brown.','My dog is brown'],answer:'My dog is brown.',note:'A sentence starts with a capital letter and ends with punctuation.'},
  {skill:'sentence-punctuation',prompt:'Which sentence is written correctly?',choices:['We went to the park.','we went to the park.','We went to the park'],answer:'We went to the park.',note:'Check the capital W at the start and the full stop at the end.'},
  {skill:'sentence-punctuation',prompt:'Which sentence is written correctly?',choices:['The bus has arrived.','the bus has arrived.','The bus has arrived'],answer:'The bus has arrived.',note:'A complete telling sentence needs a capital at the start and a full stop at the end.'}],
 [{skill:'word-classes',prompt:'Which word names a thing you can carry?',choices:['Bag','Quickly','Jump'],answer:'Bag',note:'Bag is a naming word, or noun. Jump is an action; quickly describes how an action happens.'},
  {skill:'word-classes',prompt:'Which word names a person?',choices:['Teacher','Happy','Run'],answer:'Teacher',note:'Teacher is a noun naming a person.'},
  {skill:'word-classes',prompt:'Which word names a place?',choices:['Beach','Splash','Blue'],answer:'Beach',note:'Beach is a noun naming a place. Splash is an action and blue is a colour.'}],
 [{skill:'verb-agreement',prompt:'Which word makes this sentence sound right? The birds ___ in the tree.',choices:['sing','sings','singing'],answer:'sing',note:'We say the birds sing because birds is plural.'},
  {skill:'verb-agreement',prompt:'Which word makes this sentence sound right? A rabbit ___ across the grass.',choices:['hops','hop','hopping'],answer:'hops',note:'One rabbit hops. Hopping would need another word, such as is.'},
  {skill:'verb-agreement',prompt:'Which word makes this sentence sound right? The children ___ to school.',choices:['walk','walks','walking'],answer:'walk',note:'Children means more than one child, so the children walk.'}],
);
englishYear2.push(
 [{skill:'sentence-punctuation',prompt:'Which punctuation mark completes this sentence? Where did you put my pencil',choices:['A question mark (?)','A full stop (.)','A comma (,)'],answer:'A question mark (?)',note:'The sentence asks for information, so it ends with a question mark.'},
  {skill:'sentence-punctuation',prompt:'Which sentence uses commas correctly in a list?',choices:['We packed apples, pears and grapes.','We packed, apples pears and grapes.','We packed apples pears, and grapes.'],answer:'We packed apples, pears and grapes.',note:'Commas separate list items. Do not put a comma between packed and its first item.'},
  {skill:'sentence-punctuation',prompt:'Which sentence uses capital letters correctly?',choices:['On Friday, Ava visited Perth.','On friday, Ava visited perth.','On Friday, ava visited Perth.'],answer:'On Friday, Ava visited Perth.',note:'Days, people’s names and place names need capital letters.'}],
 [{skill:'word-classes',prompt:'Which word describes the noun in this sentence? The narrow path twisted through the garden.',choices:['Narrow','Twisted','Garden'],answer:'Narrow',note:'Narrow is an adjective describing the path. Twisted tells us what it did.'},
  {skill:'word-classes',prompt:'Which word is the action verb? The cheerful swimmer splashed into the pool.',choices:['Splashed','Cheerful','Pool'],answer:'Splashed',note:'Splashed tells what the swimmer did, so it is the action verb.'},
  {skill:'word-classes',prompt:'Which word could replace the name? Tahlia packed her lunch. ___ put it in her bag.',choices:['She','They','It'],answer:'She',note:'She is a pronoun referring to Tahlia; it would refer to a thing.'}],
 [{skill:'verb-agreement',prompt:'Which word correctly completes this sentence? Yesterday the children ___ to the museum.',choices:['went','go','going'],answer:'went',note:'Yesterday needs the past tense. Went is the past form of go.'},
  {skill:'verb-agreement',prompt:'Which word correctly completes this sentence? The two geese ___ across the pond.',choices:['swim','swims','swimming'],answer:'swim',note:'Two geese is plural, so use swim. Swimming would need are.'},
  {skill:'verb-agreement',prompt:'Which word correctly completes this sentence? Every morning, our neighbour ___ the plants.',choices:['waters','water','watering'],answer:'waters',note:'One neighbour does this regularly, so use waters.'}],
);
function englishItem(id:string,yearLevel:1|2,template:EnglishTemplate):TutorItem{return {id,subject:'english',yearLevel,skillId:`english-y${yearLevel}-${template.skill}`,kind:'choice',prompt:template.prompt,choices:template.choices,acceptedAnswers:[template.answer],teachingNote:template.note,...(template.passage?{passage:template.passage}:{})};}
function seedValue(seed:string){let value=2166136261;for(const c of seed)value=Math.imul(value^c.charCodeAt(0),16777619);return value>>>0;}
/** Authored templates and bounded numeric variants; the model cannot alter answer keys. */
export function createTutorPlan(subject:TutorSubject,seed:string,focus?:Recommendation):TutorPlan{
 if(focus){
  const topic=lessonTopics.find(t=>t[0]===subject&&t[1]===focus.topicId);
  if(!topic)throw new Error("INVALID_LESSON_TOPIC");
  // Focus questions use distinct authored English variants; maths uses fresh numeric variants with a short mixed review.
  const items=Array.from({length:5},(_,i)=>{
   const raw=createTutorPlan(subject,`${seed}-${i}-bank`);
   return raw.items[i];
  });
  // The internal bank mode selects all topics without publishing any answer keys.
  const seen=new Set<string>();
  for(let i=0;i<(subject==='english'||[0,1,2,3,4].includes(topic[3])?3:1);i++){
   const available=tutorBank(subject,`${seed}-${i}`);
   let selected=available[topic[3]];
   for(let retry=0;seen.has(selected.year1.prompt+'|'+selected.year2.prompt)&&retry<100;retry++)selected=tutorBank(subject,`${seed}-${i}-${retry}`)[topic[3]];
   seen.add(selected.year1.prompt+'|'+selected.year2.prompt);
   items[i]=selected;
  }
  return {version:1,subject,focus,items:items.map(slot=>({...slot,entryYear:focus.yearLevel}))};
 }
 const value=seedValue(seed),bank=tutorBank(subject,seed);
 return {version:1,subject,items:Array.from({length:5},(_,i)=>bank[(value+i*(subject==='english'?3:5))%bank.length])};
}
function tutorBank(subject:TutorSubject,seed:string):TutorPlan['items']{
 const value=seedValue(seed),n=value%6,t=(value>>>4)%6,prefix=`daily-${subject}-${seed}`;
 if(subject==='english')return Array.from({length:englishYear2.length},(_,i)=>{const topic=i,variant=(value>>>i)%3;return {year1:englishItem(`${prefix}-${i}-y1`,1,englishYear1[topic][variant]),year2:englishItem(`${prefix}-${i}-y2`,2,englishYear2[topic][variant])};});
 const hundreds=3+n,tens=2+t,ones=4+n,groups=3+n%3,perGroup=4+t%3,a=31+n%3,b=22+t%3,whole=75+n%3,removed=21+t%3,units=6+n;
 const bank=[
  {year2:numberItem(`${prefix}-0-y2`,2,'hundreds-tens-ones',`A display has ${hundreds} hundreds, ${tens} tens and ${ones} ones. What number is on the display?`,hundreds*100+tens*10+ones,'Combine the hundreds, tens and ones; each column has a different value.'),year1:numberItem(`${prefix}-0-y1`,1,'tens-and-ones',`A jar label shows ${tens} tens and ${ones} ones. What number is on the label?`,tens*10+ones,'Each ten is ten, so add the tens value and the ones.')},
  {year2:numberItem(`${prefix}-1-y2`,2,'equal-groups',`There are ${groups} picnic rugs. Each rug has ${perGroup} cups. How many cups are there altogether?`,groups*perGroup,'Use equal groups: add the same number for each rug, or multiply.'),year1:numberItem(`${prefix}-1-y1`,1,'skip-count-2-5-10',`A necklace pattern counts in twos: ${2+n*2}, ${4+n*2}, ${6+n*2}. What number comes next?`,8+n*2,'Each step adds two. Continue the same rule once more.')},
  {year2:numberItem(`${prefix}-2-y2`,2,'add-two-digits',`One basket has ${a} mandarins and another has ${b}. How many mandarins are there altogether?`,a+b,'Add the tens together, then the ones. Check that no regrouping is needed.'),year1:numberItem(`${prefix}-2-y1`,1,'add-within-20',`A basket has ${7+n} mandarins. Summer adds 4 more. How many are in the basket now?`,11+n,'Keep the first amount and count on four, or use a known addition fact.')},
  {year2:numberItem(`${prefix}-3-y2`,2,'subtract-two-digits',`The class made ${whole} paper flowers. They gave ${removed} to another class. How many flowers are left?`,whole-removed,'Subtract the tens, then the ones. Check each column and whether exchanging is needed.'),year1:numberItem(`${prefix}-3-y1`,1,'subtract-within-20',`The class made ${14+n} paper flowers and gave away 5. How many are left?`,9+n,'Subtract five by counting back or using a related addition fact.')},
  {year2:numberItem(`${prefix}-4-y2`,2,'measure-equal-units',`A ribbon fits exactly ${units} equal blocks, placed end to end with no gaps. Each block is 2 cm long. How long is the ribbon in centimetres?`,units*2,'Count each equal unit as two centimetres; do not count the joins as extra units.'),year1:numberItem(`${prefix}-4-y1`,1,'skip-count-2-5-10',`A ribbon has marks at 5 cm, 10 cm and 15 cm. The marks are equally spaced. What number goes on the next mark?`,20,'The sequence increases by five each time.')},
  {year2:numberItem(`${prefix}-5-y2`,2,'add-two-digits-regroup',`The library shelf has ${27+n} books. A teacher adds ${16+t} more. How many books are on the shelf now?`,43+n+t,'Make ten from the ones when needed, then add the tens. Counting on in tens and ones is also valid.'),year1:numberItem(`${prefix}-5-y1`,1,'add-within-20',`The library shelf has 8 books. A teacher adds ${5+n} more. How many are on the shelf now?`,13+n,'Make ten from eight and two, then add the remaining books.')},
  {year2:numberItem(`${prefix}-6-y2`,2,'subtract-two-digits-exchange',`A craft box has ${52+n} buttons. Summer uses ${18+t} buttons. How many are left?`,34+n-t,'Use a tens-and-ones exchange when needed, or count up from the amount used to the starting amount.'),year1:numberItem(`${prefix}-6-y1`,1,'subtract-within-20',`A craft box has ${12+n} buttons. Summer uses 7. How many are left?`,5+n,'Subtract seven, or count up from seven to the starting amount.')},
  {year2:numberItem(`${prefix}-7-y2`,2,'money-values',`Summer has a 50-cent coin, two 20-cent coins and a 5-cent coin. How many cents does she have?`,95,'Add the values, not the number of coins: 50 plus 20 plus 20 plus 5.'),year1:numberItem(`${prefix}-7-y1`,1,'recognise-money-values',`Which is worth more: a 10-cent coin or a 20-cent coin? Write the larger number of cents.`,20,'Compare the stated values, not the size or number of coins.')},
  {year2:numberItem(`${prefix}-8-y2`,2,'time-duration',`A game starts at 3:15 pm and finishes at 3:45 pm. How many minutes does the game last?`,30,'From fifteen minutes past the hour to forty-five minutes past is a difference of thirty minutes.'),year1:numberItem(`${prefix}-8-y1`,1,'hour-half-hour',`The clock shows 4:00 pm. Write the number of the hour.`,4,'At 4:00 the hour is four; the zero minutes tell us it is exactly on the hour.')},
  {year2:numberItem(`${prefix}-9-y2`,2,'equal-parts',`A tray holds ${8+n%3*4} sandwiches. One quarter of them are wrapped for a picnic. How many sandwiches are wrapped?`,(8+n%3*4)/4,'A quarter is one of four equal parts. Share the total equally into four groups.'),year1:numberItem(`${prefix}-9-y1`,1,'equal-groups',`Two friends share ${8+n%3*2} crackers equally. How many crackers does each friend get?`,4+n%3,'Share equally between two people; each must get the same number.')},
  {year2:numberItem(`${prefix}-10-y2`,2,'number-patterns',`A scoreboard follows this rule: add ${3+n%3} each time. The scores are ${12+t}, ${15+t+n%3}, ${18+t+2*(n%3)}. What score comes next?`,21+t+3*(n%3),'Check the same difference between each adjacent pair, then add it once more.'),year1:numberItem(`${prefix}-10-y1`,1,'skip-count-2-5-10',`A scoreboard counts in fives: 15, 20, 25. What score comes next?`,30,'Keep adding five each time.')},
  {year2:numberItem(`${prefix}-11-y2`,2,'solid-shapes',`A cube has six square faces. How many edges does a cube have?`,12,'Count the four edges on top, four on the bottom and four joining them; faces and edges are different.'),year1:numberItem(`${prefix}-11-y1`,1,'shape-features',`A square has four sides. How many corners does it have?`,4,'Each place where two sides meet is a corner; a square has four.')},
 ];
 return bank;
}
