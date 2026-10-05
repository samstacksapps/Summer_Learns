import {createHash} from 'node:crypto';

/** Stable for one session/question, and independent of which answer is correct. */
export function shuffledChoices(choices:readonly string[]|undefined,seed:string):string[]|undefined{
 if(!choices)return undefined;
 const result=[...choices];
 let block=Buffer.alloc(0),offset=0,counter=0;
 const randomIndex=(size:number)=>{
  // Rejection sampling avoids giving early positions extra probability.
  const ceiling=Math.floor(0x1_0000_0000/size)*size;
  let value:number;
  do{
   if(offset>=block.length){block=createHash('sha256').update(JSON.stringify([seed,counter++])).digest();offset=0;}
   value=block.readUInt32BE(offset);offset+=4;
  }while(value>=ceiling);
  return value%size;
 };
 for(let i=result.length-1;i>0;i--){const j=randomIndex(i+1);[result[i],result[j]]=[result[j],result[i]];}
 return result;
}
