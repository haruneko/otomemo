// 拍単位セル語彙の確認：pop 4/4 を「拍ごとの16分パターン(4枠)」に分解＝小さいか？
import { readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";
import { parseMidi, notesOfTrackNamed, skylineMelody } from "./src/music/midi";
import { beatsPerBarFromBeats } from "./src/music/phrase";
type Note = { pitch: number; start: number; dur: number };
const NAME_PC: Record<string, number> = { C: 0, D: 2, E: 4, F: 5, G: 7, A: 9, B: 11 };
const pcOf = (r: string): number | null => { const m = /^([A-G])([#b]?)/.exec(r.trim()); if (!m) return null; let pc = NAME_PC[m[1]!]!; if (m[2] === "#") pc++; else if (m[2] === "b") pc--; return ((pc % 12) + 12) % 12; };
const QUAL: Record<string, number[]> = { maj: [0,4,7], min: [0,3,7], dim:[0,3,6], aug:[0,4,8], maj7:[0,4,7,11], min7:[0,3,7,10], "7":[0,4,7,10], hdim7:[0,3,6,10], maj6:[0,4,7,9], min6:[0,3,7,9], sus2:[0,2,7], sus4:[0,5,7], "sus4(b7)":[0,5,7,10], dim7:[0,3,6,9], minmaj7:[0,3,7,11] };
const beatCells = new Map<string, number>();
const onsetsPerBeat = new Map<number, number>();
let totBeats = 0;
const dir = process.argv[2]!, N = Number(process.argv[3] ?? 250);
for (const id of readdirSync(dir).filter((d) => /^\d{3}$/.test(d)).slice(0, N)) {
  const base = join(dir, id); let bt: string, chTxt: string;
  try { bt = readFileSync(join(base,"beat_midi.txt"),"utf8"); chTxt = readFileSync(join(base,"chord_midi.txt"),"utf8"); } catch { continue; }
  const bpb = beatsPerBarFromBeats(bt); if (!bpb) continue;
  const beatSec = bt.trim().split(/\r?\n/).map((l)=>Number(l.trim().split(/\s+/)[0]));
  const s2b = (sec:number):number=>{ if(sec<=beatSec[0]!)return 0; for(let i=1;i<beatSec.length;i++) if(sec<beatSec[i]!) return i-1+(sec-beatSec[i-1]!)/(beatSec[i]!-beatSec[i-1]!||1); return beatSec.length-1; };
  const chords = chTxt.trim().split(/\r?\n/).map((l)=>{ const [s,e,lab]=l.trim().split(/\s+/); if(!lab||lab==="N")return null; const root=pcOf(lab.split(":")[0]!); const q=(lab.split(":")[1]??"maj").split("/")[0]!; const ints=QUAL[q]; if(root==null||!ints)return null; return {sB:s2b(Number(s)),eB:s2b(Number(e)),pcs:ints.map((i)=>(root+i)%12)}; }).filter(Boolean) as {sB:number;eB:number;pcs:number[]}[];
  if (chords.length<4) continue;
  const mel = skylineMelody(notesOfTrackNamed(parseMidi(new Uint8Array(readFileSync(join(base,`${id}.mid`)))),"MELODY")).sort((a:Note,b:Note)=>a.start-b.start);
  if (mel.length<16) continue;
  const at=(b:number)=>chords.find((c)=>b>=c.sB-1e-6&&b<c.eB);
  let best={phi:0,rate:0};
  for(let k=-8;k<=8;k++)for(let phi=0;phi<bpb;phi++){let ct=0,t=0;for(const n of mel){const pos=(((n.start-phi)%bpb)+bpb)%bpb;if(!(Math.abs(pos)<0.12||Math.abs(pos-2)<0.12))continue;const c=at(n.start+k);if(!c)continue;t++;if(c.pcs.includes(((n.pitch%12)+12)%12))ct++;}if(t>=8&&ct/t>best.rate)best={phi,rate:ct/t};}
  if(best.rate<0.85) continue;
  const phi=best.phi;
  const starts=mel.filter((n)=>n.start>=phi).map((n)=>n.start);
  if(!starts.length)continue;
  const lo=Math.floor((Math.min(...starts)-phi)/1)*1+phi, hi=Math.max(...starts);
  for(let b=lo;b<=hi+1e-6;b+=1){ // 1拍ずつ
    const grid=[".",".",".","."];
    let any=false;
    for(const s of starts){const idx=Math.round((s-b)/0.25); if(idx>=0&&idx<4){grid[idx]="x";any=true;}}
    if(!any)continue;
    const cell=grid.join(""); beatCells.set(cell,(beatCells.get(cell)??0)+1);
    const c=(cell.match(/x/g)??[]).length; onsetsPerBeat.set(c,(onsetsPerBeat.get(c)??0)+1);
    totBeats++;
  }
}
const sorted=[...beatCells.entries()].sort((a,b)=>b[1]-a[1]);
const cum=(f:number)=>{let s=0,k=0;for(const[,c]of sorted){s+=c;k++;if(s/totBeats>=f)break;}return k;};
console.log(`pop 4/4 拍セル: ${totBeats}拍, 異なり ${beatCells.size}種`);
console.log(`  カバレッジ: ${cum(0.5)}種で50% / ${cum(0.8)}種で80% / ${cum(0.9)}種で90% / ${cum(0.99)}種で99%`);
console.log(`  全セル(降順): ${sorted.map(([p,c])=>`${p}(${Math.round(100*c/totBeats)}%)`).join("  ")}`);
console.log(`  拍あたり音数: ${[...onsetsPerBeat.entries()].sort((a,b)=>a[0]-b[0]).map(([n,c])=>`${n}:${Math.round(100*c/totBeats)}%`).join(" ")}`);
