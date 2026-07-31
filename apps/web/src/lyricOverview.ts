// スライス5「歌詞を通しで読む面」の純関数（design §31-10・設計WF統合 2026-07-31）。
// 曲の合成（getComposition の配置ツリー）を1回読み、句を**時間順に1系統**で集める（置き場(い) の帰結＝
// 詞先も曲先も content.lyric にあるので併合に例外分岐なし）。メロ拍→曲拍は position の累積で換算。
// ここは純関数だけ（描画は component）。テストで契約を縛る（deskContent.ts と同じ流儀）。
import type { CompositionNode } from "./api";
import { lyricOf, notesForContent, beatsPerBar, type Note } from "./music";
import { roleOf, roleInfo } from "./formStrip";
import { effectiveReading, isReadingStale, phraseStatus, readingOf } from "@cm/music-core";

export interface OverviewSection {
  label: string; // セクション見出し（役割ラベル or タイトル）
  netaId: string; // セクションの neta id（メロの配置先）
  nextBeat: number; // セクション内の次の配置拍（末尾＝既存の子の最遠端）
  meter: string | null;
  startBeat: number; // セクションの曲通し開始拍（□の穴を曲へ置くときの基準）
  startBar: number; // 曲通しの小節番号（1始まり）
  endBar: number;
}
export interface OverviewRow {
  sectionIndex: number; // どのセクションに属すか（sections への index・-1=セクション外）
  netaId: string;
  phraseIndex: number; // その句がメロの何番目か（-1＝句なしメロの「詞なし」行）
  text: string; // 表記（空文字＝詞なし）
  kana: string | null; // 読み（控えが今の表記のものであるときだけ・古ければ null）
  hl: (0 | 1 | null)[] | null; // 高低（2段・句の読みから）
  startBar: number; // 曲通しの小節番号（1始まり）
  notes: Note[]; // メロ帯用（そのまま MiniRoll へ）
  facts: { jiamari?: number; jitarazu?: number; noLyric?: boolean; noMelody?: boolean; midMelody?: boolean };
}
export interface OverviewData {
  sections: OverviewSection[];
  rows: OverviewRow[];
}

const barOf = (beat: number, bpb: number) => Math.floor(beat / bpb) + 1; // 拍→小節番号（1始まり）

/**
 * 曲の合成を時間順に走査して、通しで読む面の行（句）を集める。
 * song→section→メロ の入れ子を position の累積で辿る（position は拍）。
 */
export function collectLyricRows(comp: CompositionNode | null | undefined): OverviewData {
  const sections: OverviewSection[] = [];
  const rows: OverviewRow[] = [];
  if (!comp) return { sections, rows };
  const rootBpb = beatsPerBar(comp.neta.meter);

  // メロ1つ分の行を足す（絶対拍 base ＝ そのメロの開始拍）。
  const pushMelody = (node: CompositionNode, baseBeat: number, sectionIndex: number, bpb: number) => {
    const notes = notesForContent(node.neta.kind, node.neta.content).filter(
      (n) => Number.isFinite(n.pitch) && Number.isFinite(n.start) && Number.isFinite(n.dur),
    );
    const phrases = lyricOf(node.neta.content)?.phrases ?? [];
    if (!phrases.length) {
      // 句の無い（歌う）メロ＝「詞なし」行を1つ（メロが在ることは示す）。
      rows.push({
        sectionIndex, netaId: node.neta.id, phraseIndex: -1, text: "", kana: null, hl: null,
        startBar: barOf(baseBeat, bpb), notes, facts: { noLyric: true },
      });
      return;
    }
    phrases.forEach((p, pi) => {
      const stale = isReadingStale(p);
      const moras = stale ? [] : effectiveReading(p);
      const status = moras.length
        ? phraseStatus({ start: p.start, beats: p.beats }, moras.length, notes, { gapBeats: bpb })
        : null;
      const facts: OverviewRow["facts"] = {};
      if (!p.text.trim()) facts.noLyric = true;
      if (status?.kind === "字余り") facts.jiamari = status.count;
      else if (status?.kind === "あと") facts.jitarazu = status.count;
      else if (status?.kind === "メロが途中") facts.midMelody = true;
      else if (status?.kind === "メロなし") facts.noMelody = true;
      rows.push({
        sectionIndex, netaId: node.neta.id, phraseIndex: pi,
        text: p.text, kana: stale ? null : moras.join(""),
        hl: stale ? null : (readingOf(p)?.hl ?? null),
        startBar: barOf(baseBeat + p.start, bpb), notes, facts,
      });
    });
  };

  const isMelody = (k: string) => k === "melody" || k === "counter" || k === "riff";
  // 再帰走査：section/song は子を position 累積で辿る。メロ leaf は行に。
  const walk = (node: CompositionNode, baseBeat: number, bpb: number, curSection: number) => {
    const k = node.neta.kind;
    if (isMelody(k)) { pushMelody(node, baseBeat, curSection, bpb); return; }
    if (k === "section" || k === "song") {
      const cbpb = beatsPerBar(node.neta.meter) || bpb;
      // section 自身は見出し（song 直下のみ＝トップの構成を出す）。
      let myIndex = curSection;
      if (k === "section") {
        myIndex = sections.length;
        sections.push({ label: sectionLabel(node), netaId: node.neta.id, nextBeat: 0, meter: node.neta.meter ?? null, startBeat: baseBeat, startBar: barOf(baseBeat, bpb), endBar: barOf(baseBeat, bpb) });
      }
      for (const c of node.children) walk(c.node, baseBeat + c.position, cbpb, myIndex);
      if (k === "section") {
        // セクション末＝子の最遠端（配置拍は section 内相対）で endBar と nextBeat を確定。
        const nextRel = node.children.length
          ? Math.max(...node.children.map((c) => c.position + childDur(c.node, cbpb)))
          : cbpb;
        // ＋句を足すの配置は次の小節頭へ丸める（新句が小節の途中から始まらない・遅延生成の配置精緻化）。
        sections[myIndex]!.nextBeat = nextRel > 0 ? Math.ceil((nextRel - 1e-6) / cbpb) * cbpb : cbpb;
        sections[myIndex]!.endBar = Math.max(sections[myIndex]!.startBar, barOf(baseBeat + nextRel - 1e-6, bpb));
      }
    }
    // その他 kind（chord/bass/rhythm/skeleton 等）は歌詞面に出さない＝素通し。
  };
  walk(comp, 0, rootBpb, -1);

  // 曲が持つ句（□の穴・詞先の下書き）を併合（2026-07-31 裁定＝曲が歌詞の穴・下書きを持てる）。
  // text 空＝□の穴／text あり＝詞先の下書き。位置（曲通し拍）で、それを含むセクションへ入れる。
  const songPhrases = lyricOf(comp.neta.content)?.phrases ?? [];
  songPhrases.forEach((p, pi) => {
    const startBar = barOf(p.start, rootBpb);
    let si = -1;
    for (let i = 0; i < sections.length; i++) if (sections[i]!.startBar <= startBar) si = i; // 手前の最後のセクション
    if (si === -1 && sections.length) si = 0;
    rows.push({
      sectionIndex: si, netaId: comp.neta.id, phraseIndex: pi,
      text: p.text, kana: null, hl: null, startBar, notes: [],
      facts: p.text.trim() ? {} : { noLyric: true },
    });
  });
  // 曲持ち＋メロ持ちを時間順に（安定ソート＝同拍は挿入順＝メロが先）。
  rows.sort((a, b) => a.startBar - b.startBar);
  return { sections, rows };
}

/** セクション見出しの言葉＝役割ラベル（無ければタイトル）。 */
function sectionLabel(node: CompositionNode): string {
  const info = roleInfo(roleOf(node.neta.tags ?? undefined));
  return info?.label ?? node.neta.title ?? "セクション";
}

/** 子の尺（拍）。音符0個でも句があればその尺を尊重（尺手当て・sectionContext.leafDur と同旨）。句なしは1小節。 */
function childDur(node: CompositionNode, bpb: number): number {
  const k = node.neta.kind;
  if (k === "section" || k === "song") {
    const kids = node.children ?? [];
    return kids.length ? Math.max(...kids.map((c) => c.position + childDur(c.node, bpb))) : bpb;
  }
  const ns = notesForContent(k, node.neta.content);
  if (ns.length) return Math.max(...ns.map((n) => n.start + n.dur));
  const phrases = lyricOf(node.neta.content)?.phrases;
  return phrases?.length ? Math.max(...phrases.map((p) => p.start + p.beats)) : bpb;
}
