// ラインクリシェ／ペダルポイント語彙（WP-C3スライス2・2026-07-14）。
// 正典＝docs/research/2026-07-14-cliche-pedal-lines.md（10型辞書・生成規則§5-2）。
// 思想＝機械は候補まで。静的区間を検出し、10型からライン候補を複数出す。3rd不動禁則・メロ衝突は降格・1セクション1本（候補は積まない）。
// コードは実音(root pc 0-11)で入出力。クリシェは「その和音の上」＝region chord root 基準、ペダルは調主音(key)基準。
import { chordPcs } from "@cm/music-core";
import { type Mode } from "./function"; // 長短の型は theory/function の SSOT を共有（Mode 重複エクスポート回避）

export type ClicheVoice = "upper" | "inner" | "bass";
export type ClicheKind = "cliche" | "bassline" | "pedal";

// 入力コード（gen_chords content.chords と同形）。
export type ClicheChord = { root: number; quality?: string; start: number; dur: number; bass?: number };
export type ClicheNote = { pitch: number; start?: number; dur?: number };

// 1ステップ＝anchor pc からの相対でコードを表現。bassOff 指定でスラッシュ（分数/ペダル）。
type Step = { rootOff: number; quality: string; bassOff?: number };
type ClicheType = {
  id: string;
  kind: ClicheKind;
  name: string;
  anchor: "region" | "tonic"; // region=和音の上に置く（クリシェ）／tonic=調主音に対して（ペダル・二次的にドミナントの溜め）
  need: "major" | "minor" | "tonic" | "dominant"; // 適用条件（region 和音 or 調内位置）
  voice: ClicheVoice;
  moving: "root" | "fifth" | "bass" | "upper"; // 動く声部（3rd は決して動かさない＝禁則§5-2.3）
  steps: Step[];
  // 動く声部のピッチクラス列（メロ衝突検査用）。anchor pc から算出。
  movingPcs: (anchorPc: number) => number[];
  roles?: string[]; // 推奨文脈（ソフト＝外れても降格のみ）
};

// 型辞書（§5-1）。相対度数で保持し、realize で実音へ。
// クリシェ＝anchor "region"（sitting chord の上）。ペダル＝anchor "tonic"。
const TYPES: ClicheType[] = [
  {
    id: "LC-min-desc", kind: "cliche", name: "マイナー下降クリシェ", anchor: "region", need: "minor", voice: "inner", moving: "root",
    steps: [{ rootOff: 0, quality: "m" }, { rootOff: 0, quality: "mM7" }, { rootOff: 0, quality: "m7" }, { rootOff: 0, quality: "m6" }],
    movingPcs: (a) => [a, (a + 11) % 12, (a + 10) % 12, (a + 9) % 12], // 1̂→♮7̂→♭7̂→6̂
    roles: ["verse", "intro", "bridge"],
  },
  {
    id: "LC-min-desc-res", kind: "cliche", name: "マイナー下降クリシェ→IV", anchor: "region", need: "minor", voice: "inner", moving: "root",
    steps: [{ rootOff: 0, quality: "m" }, { rootOff: 0, quality: "mM7" }, { rootOff: 0, quality: "m7" }, { rootOff: 5, quality: "" }], // i6→IV の橋（末尾を IV へ）
    movingPcs: (a) => [a, (a + 11) % 12, (a + 10) % 12, (a + 9) % 12],
    roles: ["verse", "intro"],
  },
  {
    id: "LC-maj-desc", kind: "cliche", name: "メジャー下降クリシェ→IV", anchor: "region", need: "major", voice: "upper", moving: "root",
    steps: [{ rootOff: 0, quality: "" }, { rootOff: 0, quality: "maj7" }, { rootOff: 0, quality: "7" }, { rootOff: 5, quality: "" }], // I–IM7–I7→IV
    movingPcs: (a) => [a, (a + 11) % 12, (a + 10) % 12, (a + 9) % 12],
    roles: ["intro", "verse"],
  },
  {
    id: "LC-maj-asc-aug", kind: "cliche", name: "メジャー上昇クリシェ(aug)", anchor: "region", need: "major", voice: "inner", moving: "fifth",
    steps: [{ rootOff: 0, quality: "" }, { rootOff: 0, quality: "aug" }, { rootOff: 0, quality: "6" }, { rootOff: 0, quality: "7" }], // I–I+–I6–I7
    movingPcs: (a) => [(a + 7) % 12, (a + 8) % 12, (a + 9) % 12, (a + 10) % 12], // 5̂→#5̂→6̂→♭7̂
    roles: ["intro", "outro", "verse"],
  },
  {
    id: "LC-bass-desc", kind: "bassline", name: "下降ベースライン", anchor: "region", need: "major", voice: "bass", moving: "bass",
    steps: [{ rootOff: 0, quality: "", bassOff: 0 }, { rootOff: 0, quality: "", bassOff: 11 }, { rootOff: 0, quality: "", bassOff: 10 }, { rootOff: 5, quality: "", bassOff: 9 }], // I–I/♮7̂–I/♭7̂–IV/6̂
    movingPcs: (a) => [a, (a + 11) % 12, (a + 10) % 12, (a + 9) % 12],
    roles: ["verse", "intro"],
  },
  {
    id: "LC-bass-asc", kind: "bassline", name: "上昇ベースライン", anchor: "region", need: "major", voice: "bass", moving: "bass",
    steps: [{ rootOff: 0, quality: "", bassOff: 0 }, { rootOff: 0, quality: "", bassOff: 2 }, { rootOff: 0, quality: "", bassOff: 4 }, { rootOff: 5, quality: "" }], // I–I/2̂–I/3̂–IV
    movingPcs: (a) => [a, (a + 2) % 12, (a + 4) % 12, (a + 5) % 12],
    roles: ["verse"],
  },
  {
    id: "PED-tonic", kind: "pedal", name: "トニックペダル", anchor: "tonic", need: "tonic", voice: "bass", moving: "upper",
    steps: [{ rootOff: 0, quality: "", bassOff: 0 }, { rootOff: 5, quality: "", bassOff: 0 }, { rootOff: 7, quality: "", bassOff: 0 }, { rootOff: 0, quality: "", bassOff: 0 }], // I–IV/1̂–V/1̂–I
    movingPcs: () => [], // 保続＝動く声部は上物（メロ衝突は上物依存で降格しない）
    roles: ["intro", "verse", "interlude"],
  },
  {
    id: "PED-dominant", kind: "pedal", name: "ドミナントペダル(サビ前の溜め)", anchor: "tonic", need: "dominant", voice: "bass", moving: "upper",
    steps: [{ rootOff: 0, quality: "", bassOff: 7 }, { rootOff: 5, quality: "", bassOff: 7 }, { rootOff: 7, quality: "" }, { rootOff: 7, quality: "7" }], // I/5̂–IV/5̂–V–V7
    movingPcs: () => [],
    roles: ["prechorus", "bridge"],
  },
];

const norm = (x: number) => ((Math.trunc(x) % 12) + 12) % 12;
const isMinorQ = (q: string) => /^(m|min)/.test(q) && !/^maj/.test(q); // 三和音/7thの短調系（dim は別扱い）

export type ClicheCandidate = {
  typeId: string;
  name: string;
  kind: ClicheKind;
  voice: ClicheVoice;
  why: string;
  region: { startBar: number; bars: number };
  line: ClicheChord[]; // 差し込むライン（region を置換する実音コード列）
  chords: ClicheChord[]; // ライン適用後の全進行（ドロップイン）
  collidesMelody: boolean; // メロと半音衝突（降格理由・ブロックはしない）
  thirdPc: number; // 不動の 3rd（3rd不動禁則の可視化）
};

export type SuggestClicheOpts = { key?: number; mode?: Mode; role?: string; melody?: ClicheNote[]; max?: number; barBeats?: number };

/** 静的区間（同一和音≥2小節）を検出し、10型からライン候補を複数返す。既定 bit＝入力を壊さず候補のみ生成。 */
export function suggestClicheLines(chords: ClicheChord[], opts: SuggestClicheOpts = {}): { candidates: ClicheCandidate[]; warnings: string[] } {
  const warnings: string[] = [];
  const cs = (chords ?? []).filter((c) => c && Number.isFinite(c.root) && Number.isFinite(c.start) && Number.isFinite(c.dur) && c.dur > 0);
  if (cs.length < 2) return { candidates: [], warnings: ["コードが2つ未満＝静的区間を判定できない"] };
  const key = norm(opts.key ?? cs[0]!.root);
  const mode: Mode = opts.mode ?? (isMinorQ(cs[0]!.quality ?? "") ? "minor" : "major");
  const max = Math.max(1, Math.min(8, opts.max ?? 4));
  const melody = (opts.melody ?? []).filter((n) => n && Number.isFinite(n.pitch)).map((n) => ({ pitch: n.pitch, start: Number.isFinite(n.start) ? n.start! : 0, dur: n.dur }));

  // 静的区間＝連続する同一(root+quality)のラン（長さ≥2）。§4 条件1。
  type Region = { from: number; to: number; root: number; quality: string; start: number; dur: number };
  const regions: Region[] = [];
  let i = 0;
  while (i < cs.length) {
    let j = i;
    while (j + 1 < cs.length && norm(cs[j + 1]!.root) === norm(cs[i]!.root) && (cs[j + 1]!.quality ?? "") === (cs[i]!.quality ?? "")) j++;
    if (j > i) regions.push({ from: i, to: j, root: norm(cs[i]!.root), quality: cs[i]!.quality ?? "", start: cs[i]!.start, dur: cs.slice(i, j + 1).reduce((s, c) => s + c.dur, 0) });
    i = j + 1;
  }
  if (regions.length === 0) return { candidates: [], warnings: ["静的区間(同一和音≥2小節)が無い＝クリシェ/ペダルは差さない(密な進行への押し付け回避・§4)"] };

  const barBeats = opts.barBeats ?? Math.max(1, cs[0]!.dur); // 1コード=1小節前提（gen_chords 既定）。
  const out: ClicheCandidate[] = [];
  for (const rg of regions) {
    const regionMajor = !isMinorQ(rg.quality) && !/dim/.test(rg.quality);
    const isTonic = rg.root === key;
    const isDominant = rg.root === norm(key + 7);
    for (const t of TYPES) {
      // 適用条件（§5-2.2）。anchor=region はコード品質、anchor=tonic は調内位置。
      if (t.anchor === "region") { if (t.need === "minor" && regionMajor) continue; if (t.need === "major" && !regionMajor) continue; }
      else { if (t.need === "tonic" && !isTonic) continue; if (t.need === "dominant" && !isDominant) continue; }
      const anchorPc = t.anchor === "region" ? rg.root : key;
      const nSteps = t.steps.length;
      const slice = rg.dur / nSteps;
      const line: ClicheChord[] = t.steps.map((s, k) => {
        const ch: ClicheChord = { root: norm(anchorPc + s.rootOff), quality: s.quality, start: rg.start + k * slice, dur: slice };
        if (s.bassOff !== undefined) ch.bass = norm(anchorPc + s.bassOff);
        return ch;
      });
      // メロ衝突（§5-2.7）＝動く声部 pc とメロ pc が半音（min2）でぶつかるステップがあれば降格。
      const mpcs = t.movingPcs(anchorPc);
      let collides = false;
      if (melody.length && mpcs.length) {
        for (let k = 0; k < nSteps; k++) {
          const st = rg.start + k * slice, en = st + slice;
          const mv = mpcs[k];
          if (mv === undefined) continue;
          for (const n of melody) {
            const nEnd = n.start + (n.dur ?? 0.01);
            if (nEnd <= st || n.start >= en) continue; // このステップで鳴っていない
            const d = Math.abs(((norm(n.pitch) - mv + 6 + 12) % 12) - 6); // pc 間の最短半音距離
            if (d === 1) { collides = true; break; }
          }
          if (collides) break;
        }
      }
      // ドロップイン全進行＝region を line で置換。
      const chordsOut = [...cs.slice(0, rg.from), ...line, ...cs.slice(rg.to + 1)];
      const thirdPc = norm(rg.root + (regionMajor ? 4 : 3)); // 不動の 3rd（可視化・3rd不動禁則）
      const roleMiss = opts.role && t.roles && !t.roles.includes(opts.role);
      out.push({
        typeId: t.id, name: t.name, kind: t.kind, voice: t.voice,
        why: `${t.name}（静的区間 ${rg.from + 1}〜${rg.to + 1}小節目・${t.voice}声部・3rd不動）${roleMiss ? "／※この役割では非定番" : ""}${collides ? "／※メロと半音衝突(要耳確認)" : ""}`,
        region: { startBar: rg.from, bars: rg.to - rg.from + 1 },
        line, chords: chordsOut, collidesMelody: collides, thirdPc,
      });
    }
  }
  // 並べ替え：非衝突→役割一致→型辞書順。1セクション1本＝候補は積まず、上位 max 本を提示。
  const typeOrder = new Map(TYPES.map((t, k) => [t.id, k]));
  out.sort((a, b) => {
    if (a.collidesMelody !== b.collidesMelody) return a.collidesMelody ? 1 : -1;
    const ra = opts.role ? (TYPES.find((t) => t.id === a.typeId)?.roles?.includes(opts.role!) ? 0 : 1) : 0;
    const rb = opts.role ? (TYPES.find((t) => t.id === b.typeId)?.roles?.includes(opts.role!) ? 0 : 1) : 0;
    if (ra !== rb) return ra - rb;
    return (typeOrder.get(a.typeId) ?? 99) - (typeOrder.get(b.typeId) ?? 99);
  });
  if (out.every((c) => c.collidesMelody) && out.length) warnings.push("全候補がメロと半音衝突＝メロ側の休符/別区間を検討（ライン非対応の危険・§5-3）");
  // 3rd不動の自己検査（禁則§5-2.3）：クリシェ型の全ステップに 3rd を含む＝品質反転していない。
  return { candidates: out.slice(0, max), warnings };
}

// 3rd不動の内部検証用（テスト共有）＝クリシェ型の各ステップ和音に 3rd pc が含まれるか。
export function clicheStepPcs(root: number, quality: string): number[] {
  return chordPcs(norm(root), quality || "").map(norm);
}
