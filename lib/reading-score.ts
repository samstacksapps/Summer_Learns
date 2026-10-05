/** Text alignment estimate only; speech recognition can overstate actual reading accuracy. */
export function estimateReading(expected:string,transcribed:string){
 const words=(text:string)=>text.toLowerCase().replace(/[^a-z'\s]/g,' ').split(/\s+/).filter(Boolean);
 const a=words(expected),b=words(transcribed);
 const rows=Array.from({length:a.length+1},()=>Array(b.length+1).fill(0) as number[]);
 for(let i=0;i<=a.length;i++)rows[i][0]=i;
 for(let j=0;j<=b.length;j++)rows[0][j]=j;
 for(let i=1;i<=a.length;i++)for(let j=1;j<=b.length;j++)rows[i][j]=Math.min(rows[i-1][j]+1,rows[i][j-1]+1,rows[i-1][j-1]+(a[i-1]===b[j-1]?0:1));
 return a.length?Math.max(0,Math.round((1-rows[a.length][b.length]/a.length)*100)):0;
}
