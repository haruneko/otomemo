// 骨格の机（design #20 S6・D3）②コード前景の純ロジック＝「対位の相手を書く段」。
// api / skeletonEdit.ts / sectionContext.ts / music.ts は無改変（消費のみ）。ここは：
//   ① chordChips ＝ earChords（実調・骨格ブロック相対）に **出所**（どのコードネタのどの chord か＋配置移調 shift）を添える。
//      entry は SkeletonDesk の earChordsRel（= sctx.earChords を start−skelPosition したもの）と deepEqual・同順
//      （deskChords.test で legacy 逐語コピーと突合＝バイト等価を固定）。試着の chordIndex はこの配列 index。
//   ② applyChordTrial ＝ substitute_chord 候補（or 分数）を earChords の1コードに **試着**（ローカル override・在庫不変）。
//   ③ adoptedChordContent ＝ 採用時に出所ネタへ書く updateNeta payload（実調 sub → 素材調へ un-shift・破壊上書きしない）。
//   ④ chordName ＝ チップ表示名（root+quality、分数は "/bass"）。
import { chordsOf, harmonyPlacementShift, pitchName, type ChordEntry } from "./music";
import type { Child, Lane } from "./components/sectionLanes";

const norm = (x: number): number => ((Math.round(x) % 12) + 12) % 12;

// substitute_chord 候補 or 手置きの試着コード（実調・ピッチクラス）。bass 省略＝分数でない（三和音）。
export interface ChordSub {
  root: number; // 0–11（実調ピッチクラス）
  quality: string; // ""(major)/"m"/"7"/"maj7"/"m7"/"dim" ...
  bass?: number; // 分数コードの下声 pc（0–11・省略=root）
}

export interface ChordChip {
  entry: ChordEntry; // 実調・骨格ブロック相対（start = ch.start + position − skelPosition）＝earChordsRel と同座標・同順
  netaId: string; // 出所コードネタ id（採用の updateNeta 対象）
  netaChordIndex: number; // そのネタ content.chords 内の index（採用の書込先）
  shift: number; // harmonyPlacementShift（採用時に外して素材調へ戻す）
}

// earChords(sectionContext) と同一計算＋出所。laneChildren の並び／chordsOf の並びをそのまま使う＝
// earChordsRel（sctx.earChords→start−skelPosition）と index が1対1（試着の chordIndex がそのまま使える）。
export function chordChips(
  children: Child[],
  LANES: readonly Lane[],
  keyPc: number,
  mode: string | null | undefined,
  skelPosition: number,
): ChordChip[] {
  const chordLane = LANES.find((l) => l.key === "chord");
  if (!chordLane) return [];
  const kinds = chordLane.kinds as readonly string[];
  const rowOf = (c: Child): number => (c.ord === 1 ? 1 : 0);
  const laneChildren = children.filter(
    (c) => kinds.includes(c.node.neta.kind) && (chordLane.row === undefined || rowOf(c) === chordLane.row),
  );
  const out: ChordChip[] = [];
  for (const c of laneChildren) {
    const shift = harmonyPlacementShift(keyPc, mode, c.node.neta.mode, c.node.neta.key ?? 0);
    chordsOf(c.node.neta.content).forEach((ch, idx) => {
      // sctx.earChords は {...ch, root:+shift, start:+position}＝bass は移調しない。ここも同じにして bit 一致。
      out.push({
        entry: { ...ch, root: (((ch.root + shift) % 12) + 12) % 12, start: ch.start + c.position - skelPosition },
        netaId: c.node.neta.id,
        netaChordIndex: idx,
        shift,
      });
    });
  }
  return out;
}

export interface ChordTrial {
  chordIndex: number; // earChordsRel / chordChips の index
  sub: ChordSub;
}

// substitute_chord は文脈違い（機能代理/裏コード/セカンダリー…）で同じ (root,quality) を複数返すことがある
// （例：Am が2枠）。表示は畳んで1枠にする＝先勝ち・順序維持（P3-3）。bass は同一 (root,quality) 内では区別しない
// （分数指定は稀・先勝ちで十分）。
export function dedupeChordSubs(subs: ChordSub[]): ChordSub[] {
  const seen = new Set<string>();
  const out: ChordSub[] = [];
  for (const s of subs) {
    const key = `${((s.root % 12) + 12) % 12}:${s.quality}`;
    if (seen.has(key)) continue;
    seen.add(key);
    out.push(s);
  }
  return out;
}

// 試着＝earChords（実調・ブロック相対）の chordIndex 番目を sub で差し替えた **新配列**（元配列非破壊・在庫不変）。
// start/dur は温存＝時間割りは変えず「縦の相手」だけ差し替える。sub.bass 無し＝分数解除（bass を落とす）。
export function applyChordTrial(chords: ChordEntry[], trial: ChordTrial | null): ChordEntry[] {
  if (!trial) return chords;
  return chords.map((ch, i) =>
    i === trial.chordIndex
      ? {
          start: ch.start,
          dur: ch.dur,
          root: norm(trial.sub.root),
          quality: trial.sub.quality,
          ...(trial.sub.bass != null ? { bass: norm(trial.sub.bass) } : {}),
        }
      : ch,
  );
}

// 採用＝試着中のコードを出所ネタの content.chords[chordIndex] へ反映した新 content（updateNeta payload）。
// 実調 sub を素材調へ un-shift（root/bass 双方）。他の chord／content 他フィールドは温存＝破壊上書きしない。
export function adoptedChordContent(
  content: unknown,
  chordIndex: number,
  sub: ChordSub,
  shift: number,
): Record<string, unknown> {
  const base = content && typeof content === "object" ? (content as Record<string, unknown>) : {};
  const chords = chordsOf(content);
  const cur = chords[chordIndex];
  if (!cur) return { ...base };
  const material: ChordEntry = {
    root: norm(sub.root - shift),
    quality: sub.quality,
    start: cur.start,
    dur: cur.dur,
    ...(sub.bass != null ? { bass: norm(sub.bass - shift) } : {}),
  };
  return { ...base, chords: chords.map((ch, i) => (i === chordIndex ? material : ch)) };
}

// チップ表示名（root+quality、分数コードは "/bass"）。pc→音名はオクターブ無し（ヘッダ keyLabel と同流儀）。
export function chordName(entry: { root: number; quality: string; bass?: number }): string {
  const nm = (pc: number): string => pitchName(60 + norm(pc)).replace(/-?\d+$/, "");
  const head = nm(entry.root) + (entry.quality ?? "");
  return entry.bass != null && norm(entry.bass) !== norm(entry.root) ? `${head}/${nm(entry.bass)}` : head;
}
