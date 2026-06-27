// 「何が簡単だったか」を実例で：拍セルを学習(=数えるだけ)→自由生成(マルコフ)→音数指定(DP)。
import { readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";
import { parseMidi, notesOfTrackNamed, skylineMelody } from "./src/music/midi";
import { beatsPerBarFromBeats } from "./src/music/phrase";
type Note = { pitch: number; start: number; dur: number };
const NAME_PC: Record<string,number> = {C:0,D:2,E:4,F:5,G:7,A:9,B:11};
const pcOf=(r:string):number|null=>{const m=/^([A-G])([#b]?)/.exec(r.trim());if(!m)return null;let pc=NAME_PC[m[1]!]!;if(m[2]==="#")pc++;else if(m[2]==="b")pc--;return((pc%12)+12)%12;};
const QUAL:Record<string,number[]>={maj:[0,4,7],min:[0,3,7],dim:[0,3,6],aug:[0,4,8],maj7:[0,4,7,11],min7:[0,3,7,10],"7":[0,4,7,10],hdim7:[0,3,6,10],maj6:[0,4,7,9],min6:[0,3,7,9],sus2:[0,2,7],sus4:[0,5,7],"sus4(b7)":[0,5,7,10],dim7:[0,3,6,9],minmaj7:[0,3,7,11]};

// ===== ① 学習＝数えるだけ =====
const BPB=4;
const uni:Map<string,number>=new Map();                                  // セル頻度
const posUni:Map<number,Map<string,number>>=new Map();                   // 拍位置→セル頻度
const trans:Map<string,Map<string,number>>=new Map();                    // (位置,直前)→次セル頻度
const onsets=(c:string)=>(c.match(/x/g)??[]).length;
const cellOf=(starts:number[],b:number)=>{const g=[".",".",".","."];for(const s of starts){const i=Math.round((s-b)/0.25);if(i>=0&&i<4)g[i]="x";}return g.join("");};
function learnSong(dir:string,id:string){
  const base=join(dir,id);let bt:string,chTxt:string;
  try{bt=readFileSync(join(base,"beat_midi.txt"),"utf8");chTxt=readFileSync(join(base,"chord_midi.txt"),"utf8");}catch{return;}
  const bpb=beatsPerBarFromBeats(bt);if(bpb!==4)return;
  const beatSec=bt.trim().split(/\r?\n/).map((l)=>Number(l.trim().split(/\s+/)[0]));
  const s2b=(sec:number):number=>{if(sec<=beatSec[0]!)return 0;for(let i=1;i<beatSec.length;i++)if(sec<beatSec[i]!)return i-1+(sec-beatSec[i-1]!)/(beatSec[i]!-beatSec[i-1]!||1);return beatSec.length-1;};
  const chords=chTxt.trim().split(/\r?\n/).map((l)=>{const[s,e,lab]=l.trim().split(/\s+/);if(!lab||lab==="N")return null;const root=pcOf(lab.split(":")[0]!);const q=(lab.split(":")[1]??"maj").split("/")[0]!;const ints=QUAL[q];if(root==null||!ints)return null;return{sB:s2b(Number(s)),eB:s2b(Number(e)),pcs:ints.map((i)=>(root+i)%12)};}).filter(Boolean) as {sB:number;eB:number;pcs:number[]}[];
  if(chords.length<4)return;
  const mel=skylineMelody(notesOfTrackNamed(parseMidi(new Uint8Array(readFileSync(join(base,`${id}.mid`)))),"MELODY")).sort((a:Note,b:Note)=>a.start-b.start);
  if(mel.length<16)return;
  const at=(b:number)=>chords.find((c)=>b>=c.sB-1e-6&&b<c.eB);
  let best={phi:0,rate:0};
  for(let k=-8;k<=8;k++)for(let phi=0;phi<4;phi++){let ct=0,t=0;for(const n of mel){const pos=(((n.start-phi)%4)+4)%4;if(!(Math.abs(pos)<0.12||Math.abs(pos-2)<0.12))continue;const c=at(n.start+k);if(!c)continue;t++;if(c.pcs.includes(((n.pitch%12)+12)%12))ct++;}if(t>=8&&ct/t>best.rate)best={phi,rate:ct/t};}
  if(best.rate<0.85)return;
  const phi=best.phi,starts=mel.filter((n)=>n.start>=phi).map((n)=>n.start);if(!starts.length)return;
  const lo=Math.floor((Math.min(...starts)-phi)/1)*1+phi,hi=Math.max(...starts);
  let prev="";
  for(let b=lo;b<=hi+1e-6;b+=1){
    const cell=cellOf(starts,b);if(onsets(cell)===0){prev="";continue;}
    const pos=Math.round(((b-phi)%4+4)%4);
    uni.set(cell,(uni.get(cell)??0)+1);
    (posUni.get(pos)??posUni.set(pos,new Map()).get(pos)!).set(cell,((posUni.get(pos)!.get(cell))??0)+1);
    if(prev){const key=pos+"|"+prev;(trans.get(key)??trans.set(key,new Map()).get(key)!).set(cell,((trans.get(key)!.get(cell))??0)+1);}
    prev=cell;
  }
}
const dir=process.argv[2]!;
for(const id of readdirSync(dir).filter((d)=>/^\d{3}$/.test(d)).slice(0,250))learnSong(dir,id);

// 小さな seed RNG（再現用）
let seed=12345;const rnd=()=>{seed=(seed*1103515245+12345)&0x7fffffff;return seed/0x7fffffff;};
const pick=(m:Map<string,number>):string=>{const e=[...m.entries()];const t=e.reduce((a,b)=>a+b[1],0);let r=rnd()*t;for(const[k,c]of e){r-=c;if(r<=0)return k;}return e[0]![0];};

// ===== ② 自由生成＝位置条件マルコフを歩くだけ =====
function genBar(nBars:number):string{
  const out:string[]=[];let prev="";
  for(let i=0;i<nBars*4;i++){const pos=i%4;const key=pos+"|"+prev;const dist=(prev&&trans.get(key))?trans.get(key)!:posUni.get(pos)!;const cell=pick(dist);out.push(cell);prev=cell;}
  return out.map((c,i)=>(i%4===0?"":"")+c).reduce((s,c,i)=>s+(i%4===0&&i>0?" | ":i>0?" ":"")+c,"");
}

// ===== ③ 音数指定＝拍上DP（onset合計=目標）=====
function genCount(targetOnsets:number):string|null{
  // dp[beat] : Map<cumOnsets, {logp, seq}>
  let dp=new Map<number,{logp:number;seq:string[]}>();
  for(const[c,n]of posUni.get(0)!){const k=onsets(c);const cur=dp.get(k);const lp=Math.log(n);if(!cur||lp>cur.logp)dp.set(k,{logp:lp,seq:[c]});}
  for(let beat=1;beat<4;beat++){
    const nx=new Map<number,{logp:number;seq:string[]}>();
    for(const[cum,st]of dp){const prev=st.seq[st.seq.length-1]!;const key=beat+"|"+prev;const dist=trans.get(key)??posUni.get(beat)!;
      for(const[c,n]of dist){const k=cum+onsets(c);if(k>targetOnsets)continue;const lp=st.logp+Math.log(n);const cur=nx.get(k);if(!cur||lp>cur.logp)nx.set(k,{logp:lp,seq:[...st.seq,c]});}}
    dp=nx;
  }
  const hit=dp.get(targetOnsets);return hit?hit.seq.join(" | "):null;
}

console.log(`=== ① 学習＝数えるだけ（${[...uni.values()].reduce((a,b)=>a+b,0)}拍から）===`);
console.log(`拍セル語彙（頻度順・onset数）:`);
for(const[c,n]of[...uni.entries()].sort((a,b)=>b[1]-a[1]))console.log(`  ${c}  (${(100*n/[...uni.values()].reduce((a,b)=>a+b,0)).toFixed(1)}%, ${onsets(c)}音)`);
console.log(`\n遷移表の一例＝「拍2で直前が x... の次に来るセル」:`);
const ex=trans.get("2|x...");if(ex){const t=[...ex.values()].reduce((a,b)=>a+b,0);for(const[c,n]of[...ex.entries()].sort((a,b)=>b[1]-a[1]).slice(0,5))console.log(`  → ${c} (${Math.round(100*n/t)}%)`);}

console.log(`\n=== ② 自由生成＝マルコフを歩くだけ（4小節×3本）===`);
for(let i=0;i<3;i++)console.log(`  ${genBar(4)}`);

console.log(`\n=== ③ 音数指定＝拍上DP（1小節=4拍に「ちょうどN音」）===`);
for(const N of[4,5,6,7,8,10]){const r=genCount(N);console.log(`  ${N}音: ${r??"(不能)"}   ← onset合計を数えると ${r?r.split(/[ |]+/).join("").match(/x/g)?.length:0}`);}
