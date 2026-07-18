// #27 再生経路の一本化・解決層（buildPlayback / playbackComposite / vocalJobsOf）の契約テスト。
// 正典＝docs/research/2026-07-18-playback-path-unification.md §4 ガードレール。
//  G1 bit一致：歌わないソースは各サイトの手組みペイロードと深い等値・vocalJobs=[]。
//  G2 書き出し不変：compositeNotes は muted/sungBy を一切含まない（playbackComposite とは別）。
//  G3 仮歌等値：歌うフィクスチャで vocalJobsOf(plan.notes) が現行 singingJobs / 単体 buildVocalJob と等値。
import { describe, it, expect } from "vitest";
import {
  buildPlayback,
  playbackComposite,
  vocalJobsOf,
  notesForContent,
  compositeNotes,
  vocalMelodyFromComposite,
  singOf,
  feelOf,
  feelOfTree,
  programOf,
  isCompoundMeter,
  type CompositeChild,
  type Note,
} from "../src/music";
import { buildVocalJob } from "../src/useNetaEditor";

// ── フィクスチャ ─────────────────────────────────────────────
const melodyNeta = {
  kind: "melody",
  content: { notes: [ { pitch: 60, start: 0, dur: 1 }, { pitch: 62, start: 1, dur: 1 } ], program: 24 },
  key: 3,
  mode: "major",
  tempo: 130,
  meter: "4/4",
};
const relBassNeta = {
  kind: "bass",
  content: { mode: "relative", steps: 16, pattern: [ { step: 0, degree: "R", dur: 4 }, { step: 4, degree: "5", dur: 4 } ], program: 33 },
  key: 5, mode: "major", tempo: 100, meter: "4/4",
};
const chordPatNeta = {
  kind: "chord_pattern",
  content: { mode: "strum", voicing: { tones: ["R", "3", "5"], openClose: "close", octave: 0, top: 72 }, steps: 16, hits: [{ step: 0, dur: 8 }], program: 4 },
  key: 2, mode: "major", tempo: 120, meter: "4/4",
};
const rhythmNeta = {
  kind: "rhythm",
  content: { rhythm: { steps: 16, lanes: [{ name: "Kick", midi: 36, hits: [0, 8] }] } },
  key: 0, mode: "major", tempo: 128, meter: "4/4",
};
const compoundNeta = {
  kind: "melody",
  content: { notes: [{ pitch: 60, start: 0, dur: 0.5 }] },
  key: 0, mode: "major", tempo: 90, meter: "6/8",
};
const pickupNeta = {
  kind: "melody",
  content: { notes: [ { pitch: 67, start: -0.5, dur: 0.5 }, { pitch: 60, start: 0, dur: 1 } ] },
  key: 0, mode: "major", tempo: 120, meter: "4/4",
};

// melody child helper（tree ソース用）
function melChild(position: number, notes: Note[], opts?: { sing?: number | true; key?: number; mode?: string }): CompositeChild {
  const sing = opts?.sing != null ? { enabled: true, ...(typeof opts.sing === "number" ? { speaker: opts.sing } : {}) } : undefined;
  return { position, node: { neta: { kind: "melody", content: { notes, ...(sing ? { sing } : {}) }, key: opts?.key ?? 0, mode: opts?.mode ?? "major" } } };
}
function chordChild(position: number, chords: { root: number; quality: string; start: number; dur: number }[]): CompositeChild {
  return { position, node: { neta: { kind: "chord", content: { chords }, key: 0, mode: "major" } } };
}
// section コンテナ子（song 直下＝ネスト。中に melody 等の leaf を持つ）。
function sectionChild(position: number, kids: CompositeChild[], opts?: { key?: number; mode?: string }): CompositeChild {
  return { position, node: { neta: { kind: "section", content: {}, key: opts?.key ?? 0, mode: opts?.mode ?? "major" }, children: kids } };
}

describe("#27 G1 bit一致：歌わないソースは手組みペイロードと深い等値・vocalJobs=[]", () => {
  it("単体メロ＝notesForContent(key)・program=programOf??0・feel・compound", () => {
    const p = buildPlayback({ kind: "neta", neta: melodyNeta });
    expect(p.notes).toEqual(notesForContent("melody", melodyNeta.content, { key: melodyNeta.key }));
    expect(p.program).toBe(programOf(melodyNeta.content) ?? 0); // 24
    expect(p.feel).toEqual(feelOf(melodyNeta.content));
    expect(p.compound).toBe(false);
    expect(p.bpm).toBe(130);
    expect(p.vocalJobs).toEqual([]);
  });
  it("相対bass＝section の調で解決した実音（notesForContent(key)）", () => {
    const p = buildPlayback({ kind: "neta", neta: relBassNeta });
    expect(p.notes).toEqual(notesForContent("bass", relBassNeta.content, { key: relBassNeta.key }));
    expect(p.program).toBe(33);
    expect(p.vocalJobs).toEqual([]);
  });
  it("chord_pattern＝voicing 実音化", () => {
    const p = buildPlayback({ kind: "neta", neta: chordPatNeta });
    expect(p.notes).toEqual(notesForContent("chord_pattern", chordPatNeta.content, { key: chordPatNeta.key }));
    expect(p.program).toBe(4);
    expect(p.vocalJobs).toEqual([]);
  });
  it("rhythm＝program undefined", () => {
    const p = buildPlayback({ kind: "neta", neta: rhythmNeta });
    expect(p.notes).toEqual(notesForContent("rhythm", rhythmNeta.content, { key: 0 }));
    expect(p.program).toBeUndefined();
    expect(p.vocalJobs).toEqual([]);
  });
  it("6/8＝compound true", () => {
    const p = buildPlayback({ kind: "neta", neta: compoundNeta });
    expect(p.compound).toBe(true);
    expect(isCompoundMeter(compoundNeta.meter)).toBe(true);
  });
  it("弱起＝負start を潰さず保持（playNotes 側 pickupSchedule に委ねる）", () => {
    const p = buildPlayback({ kind: "neta", neta: pickupNeta });
    expect(Math.min(...p.notes.map((n) => n.start))).toBe(-0.5);
  });
  it("section 合成＝compositeNotes と bit 一致（歌う子なし）・vocalJobs=[]", () => {
    const children = [ chordChild(0, [{ root: 0, quality: "", start: 0, dur: 4 }]), melChild(0, [{ pitch: 60, start: 0, dur: 1 }]) ];
    const p = buildPlayback({ kind: "tree", children, key: 5, mode: "major", tempo: 120, meter: "4/4" });
    expect(p.notes).toEqual(compositeNotes(children, 5, "major"));
    expect(p.vocalJobs).toEqual([]);
    expect(p.program).toBeUndefined();
  });
  it("レーンmute＝ミュート子を除いた children で compositeNotes と一致（フィルタはエディタ側）", () => {
    const kept = melChild(0, [{ pitch: 60, start: 0, dur: 1 }]);
    const muted = melChild(4, [{ pitch: 64, start: 0, dur: 1 }]);
    const all = [kept, muted];
    const p = buildPlayback({ kind: "tree", children: [kept], key: 0, mode: "major", tempo: 120 }); // muted 子を除いて渡す
    expect(p.notes).toEqual(compositeNotes([kept], 0, "major"));
    expect(p.notes).not.toEqual(compositeNotes(all, 0, "major"));
  });
});

describe("#27 G2 書き出し不変：compositeNotes は muted/sungBy を含まない", () => {
  it("歌う section でも compositeNotes は素のまま、playbackComposite だけが sungBy+muted を付ける", () => {
    const children = [ chordChild(0, [{ root: 0, quality: "", start: 0, dur: 4 }]), melChild(0, [{ pitch: 60, start: 0, dur: 1, syllable: "ラ" }], { sing: 3003 }) ];
    const exportNotes = compositeNotes(children, 0, "major");
    expect(exportNotes.some((n) => n.muted || n.sungBy)).toBe(false);
    const playNotes_ = playbackComposite(children, 0, "major");
    expect(playNotes_.some((n) => n.sungBy)).toBe(true);
    expect(playNotes_.filter((n) => n.sungBy).every((n) => n.muted === true)).toBe(true);
  });
});

// ── #29 P1-3：tree ソースの feel フォールバック（card/FormStrip の section 再生を feel で起こす）──
describe("#29 P1-3 buildPlayback tree の feel フォールバック", () => {
  const feelChild = (feel: unknown): CompositeChild => ({
    position: 0,
    node: { neta: { kind: "melody", content: { notes: [{ pitch: 60, start: 0, dur: 1 }], feel }, key: 0, mode: "major" } },
  });
  it("feel 無し tree＝plan.feel undefined（bit・従来一致）", () => {
    const children = [melChild(0, [{ pitch: 60, start: 0, dur: 1 }])];
    const p = buildPlayback({ kind: "tree", children, key: 0, mode: "major", tempo: 120 });
    expect(p.feel).toBeUndefined();
    expect(p.feel).toEqual(feelOfTree(children));
  });
  it("子 content.feel を持つ tree＝feelOfTree で拾って plan.feel に載る（従来は無音ギャップ）", () => {
    const feel = { swing: 0.4, humanize: 0.25, seed: 1 };
    const children = [feelChild(feel)];
    const p = buildPlayback({ kind: "tree", children, key: 0, mode: "major", tempo: 120 });
    expect(p.feel).toEqual(feel);
  });
  it("明示 src.feel＝子より優先（section 自身の content.feel を上書き適用）", () => {
    const childFeel = { swing: 0.4, humanize: 0.25, seed: 1 };
    const sectionFeel = { swing: 0.8, humanize: 0.35, seed: 2 };
    const children = [feelChild(childFeel)];
    const p = buildPlayback({ kind: "tree", children, key: 0, mode: "major", tempo: 120, feel: sectionFeel });
    expect(p.feel).toEqual(sectionFeel);
  });
});

// 現行 SectionEditor.singingJobs の複製（比較用）＝正典 SectionEditor.tsx:180-202。
function singingJobsReplica(children: CompositeChild[], keyPc: number, mode: string | null, tempo: number) {
  const singers: { c: CompositeChild; sing: ReturnType<typeof singOf>; vm: ReturnType<typeof vocalMelodyFromComposite> }[] = [];
  for (const c of children) {
    const sing = c.node.neta.kind === "melody" ? singOf(c.node.neta.content) : undefined;
    if (!sing) continue;
    const vm = vocalMelodyFromComposite(compositeNotes([c], keyPc, mode));
    if (!vm.hasLyric) continue;
    singers.push({ c, sing, vm });
  }
  const ensemble = singers.flatMap((s) => s.vm.notes.map((n) => Math.round(n.pitch)));
  return singers.map((s) => ({
    key: JSON.stringify({ n: s.vm.notes, t: tempo, e: ensemble, s: s.sing!.speaker ?? null }),
    notes: s.vm.notes, bpm: tempo, firstNoteBeat: s.vm.minStartBeat, speaker: s.sing!.speaker, ensemblePitches: ensemble,
  }));
}

describe("#27 G3 仮歌等値", () => {
  it("section 複数メロ＝vocalJobsOf(playbackComposite) が現行 singingJobs と等値（ensemble/key/speaker）", () => {
    const children = [
      melChild(0, [{ pitch: 60, start: 0, dur: 1, syllable: "ラ" }, { pitch: 62, start: 1, dur: 1, syllable: "ラ" }], { sing: 3003 }),
      melChild(0, [{ pitch: 67, start: 0, dur: 1, syllable: "ソ" }], { sing: 3009 }),
    ];
    const jobs = vocalJobsOf(playbackComposite(children, 2, "minor"), 118);
    const expected = singingJobsReplica(children, 2, "minor", 118);
    expect(jobs).toEqual(expected);
  });
  it("単体メロ＝vocalJobsOf が buildVocalJob の notes/bpm/firstNoteBeat/speaker と一致（key は {n,t,e,s} に統一）", () => {
    const playable = [ { pitch: 60, start: 0, dur: 1, syllable: "ラ" }, { pitch: 62, start: 1, dur: 1, syllable: "ラ" } ];
    const marked: Note[] = playable.map((n) => ({ ...n, muted: true, sungBy: { singer: "s0", speaker: 3003 } }));
    const jobs = vocalJobsOf(marked, 120);
    expect(jobs).toHaveLength(1);
    const old = buildVocalJob(playable, 120, 3003);
    expect(jobs[0]!.notes).toEqual(old.notes);
    expect(jobs[0]!.bpm).toBe(old.bpm);
    expect(jobs[0]!.firstNoteBeat).toBe(old.firstNoteBeat);
    expect(jobs[0]!.speaker).toBe(old.speaker);
    expect(jobs[0]!.ensemblePitches).toEqual([60, 62]); // 単体 e=自分の音高列（§2.1 統一）
  });
  it("G3-song：song→section→歌うmelody（2段ネスト）で sungBy が正しい絶対位置に付き job が返る（曲再生の仮歌欠落根治）", () => {
    // song 直下は section＝歌う melody は song→section→melody の奥。旧 playbackComposite は直下 melody だけ見て singers=[]
    // →compositeNotes フォールバック→歌わなかった。修正で任意深さ拾う。section を position=8 に置き絶対位置のズレも確認。
    const song = [
      sectionChild(0, [melChild(0, [{ pitch: 60, start: 0, dur: 1, syllable: "ラ" }], { sing: 3003 })]),
      sectionChild(8, [melChild(2, [{ pitch: 64, start: 0, dur: 1, syllable: "レ" }], { sing: 3009 })]),
    ];
    const notes = playbackComposite(song, 0, "major");
    const sung = notes.filter((n) => n.sungBy);
    expect(sung.length).toBe(2); // 2セクションの歌うメロが両方 sungBy を得る
    expect(sung.every((n) => n.muted === true)).toBe(true);
    // 絶対位置：s0 melody は section@0 + melody@0 = start 0／s1 は section@8 + melody@2 = start 10。
    const s0 = notes.find((n) => n.sungBy?.singer === "s0");
    const s1 = notes.find((n) => n.sungBy?.singer === "s1");
    expect(s0?.start).toBe(0);
    expect(s1?.start).toBe(10);
    expect(s0?.sungBy?.speaker).toBe(3003);
    expect(s1?.sungBy?.speaker).toBe(3009);
    // vocalJobsOf が 2 job（ネストの奥の歌い手から）を返す＝曲再生でも歌う。
    const jobs = vocalJobsOf(notes, 120);
    expect(jobs).toHaveLength(2);
    expect(jobs[0]!.speaker).toBe(3003);
    expect(jobs[1]!.speaker).toBe(3009);
    expect(jobs[1]!.firstNoteBeat).toBe(10); // 窓/絶対座標の整合
  });
  it("G3-song：ネスト内に非歌唱melodyが混在しても歌い手だけ sungBy・伴奏(非歌唱melody)は素で残る", () => {
    const song = [
      sectionChild(0, [
        melChild(0, [{ pitch: 60, start: 0, dur: 1, syllable: "ラ" }], { sing: 3003 }), // 歌う
        melChild(0, [{ pitch: 72, start: 0, dur: 1 }]), // 非歌唱メロ（伴奏楽器）＝sungBy 付かず素で鳴る
      ]),
    ];
    const notes = playbackComposite(song, 0, "major");
    expect(notes.filter((n) => n.sungBy).length).toBe(1); // 歌い手1本だけ
    // 非歌唱メロ（pitch 72・muted でない・sungBy なし）が伴奏として残る。
    expect(notes.some((n) => n.pitch === 72 && !n.muted && !n.sungBy)).toBe(true);
    expect(vocalJobsOf(notes, 120)).toHaveLength(1);
  });
  it("歌詞なし＝sungBy を付けない（buildPlayback neta melody・vocalJobs=[]）", () => {
    const p = buildPlayback({ kind: "neta", neta: { kind: "melody", content: { notes: [{ pitch: 60, start: 0, dur: 1 }], sing: { enabled: true } }, tempo: 120 } });
    expect(p.notes.some((n) => n.sungBy)).toBe(false);
    expect(p.vocalJobs).toEqual([]);
  });
});

// feel を持つ melody 子（tree ソース用）。content.feel にスイング/humanize を載せる。
function melChildFeel(position: number, notes: Note[], feel: NonNullable<ReturnType<typeof feelOf>>): CompositeChild {
  return { position, node: { neta: { kind: "melody", content: { notes, feel }, key: 0, mode: "major" } } };
}

describe("feelOfTree（バグ修正 2026-07-18：song 再生で入れ子メロの feel が落ちない）", () => {
  const swing = { swing: 0.6, swingUnit: "eighth" as const };
  it("section 単体（1段：section→melody）＝直下メロの feel を返す（従来の直下走査と一致）", () => {
    const children = [
      chordChild(0, [{ root: 0, quality: "", start: 0, dur: 4 }]),
      melChildFeel(0, [{ pitch: 60, start: 0, dur: 1 }], swing),
    ];
    // 従来の直下走査（バグ前）と bit 一致＝直下で最初に feel を持つ子の feel。
    const legacy = (() => { for (const c of children) { const f = feelOf(c.node.neta.content); if (f) return f; } return undefined; })();
    expect(feelOfTree(children)).toEqual(swing);
    expect(feelOfTree(children)).toEqual(legacy);
  });
  it("song（2段：song→section→feel付きmelody）＝入れ子メロの feel を曲全体へ返す（バグ：直下走査だと undefined）", () => {
    const song = [
      sectionChild(0, [
        chordChild(0, [{ root: 0, quality: "", start: 0, dur: 4 }]),
        melChildFeel(0, [{ pitch: 60, start: 0, dur: 1 }], swing),
      ]),
      sectionChild(8, [melChildFeel(0, [{ pitch: 64, start: 0, dur: 1 }], swing)]),
    ];
    // バグ再現：直下（section コンテナ）だけ見ると feel なし＝ストレートに潰れていた。
    const legacyDirectOnly = (() => { for (const c of song) { const f = feelOf(c.node.neta.content); if (f) return f; } return undefined; })();
    expect(legacyDirectOnly).toBeUndefined(); // ← これが曲全体ストレート化の原因（修正前の挙動）
    expect(feelOfTree(song)).toEqual(swing); // 修正後：入れ子から拾う
  });
  it("song で feel が無い＝undefined（ストレート・非feel曲は従来どおり不変）", () => {
    const song = [
      sectionChild(0, [melChild(0, [{ pitch: 60, start: 0, dur: 1 }])]),
      sectionChild(8, [melChild(0, [{ pitch: 64, start: 0, dur: 1 }])]),
    ];
    expect(feelOfTree(song)).toBeUndefined();
  });
  it("先頭優勢：複数 feel が奥にあっても子順で最初に見つけた feel を返す（v1＝曲全体一律）", () => {
    const first = { swing: 0.6, swingUnit: "eighth" as const };
    const second = { swing: 0.3, swingUnit: "sixteenth" as const };
    const song = [
      sectionChild(0, [melChildFeel(0, [{ pitch: 60, start: 0, dur: 1 }], first)]),
      sectionChild(8, [melChildFeel(0, [{ pitch: 64, start: 0, dur: 1 }], second)]),
    ];
    expect(feelOfTree(song)).toEqual(first);
  });
});
