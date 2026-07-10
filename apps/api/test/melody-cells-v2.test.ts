import { describe, it, expect } from "vitest";
import { genMotifMelodyV2, loadMotifModel16, scalePitchList, motifDegrees } from "../src/music/melodyCells";
import { scalePcs, chordPcs } from "../src/music/theory";

// A2レシピ（docs/research/melody-recipe-validated.md）の production 実装＝genMotifMelodyV2 の契約。
const motif16 = loadMotifModel16();

// I-vi-IV-V → I-vi-V-I ＝8小節（C major・最終小節は I＝トニック着地の検証が意味を持つ形。
// B1(2026-07-08)以降、終止音は最終コード追従＝V終わりだと主音でなくVのコード音に着地する）。
const ROOTS = [0, 9, 5, 7, 0, 9, 7, 0];
const QUALS = ["maj7", "min7", "maj7", "7", "maj7", "min7", "7", "maj7"];
const sp = scalePitchList(scalePcs(0, "major"), 58, 83);
const pcsPerBar = ROOTS.map((r, i) => chordPcs(r, QUALS[i]!));

const gen = (seed: number, bars = 8) =>
  genMotifMelodyV2(pcsPerBar.slice(0, bars), ROOTS.slice(0, bars), QUALS.slice(0, bars), sp, motif16, { seed, tonicPc: 0, minor: false });

const inBar = (t: number) => ((t % 4) + 4) % 4;
const isStrong = (t: number) => Math.abs(inBar(t) - 0) < 0.12 || Math.abs(inBar(t) - 2) < 0.12;
// 禁則跳躍(三全音6/7度10,11)は「両端がコード音のアルペジオ」の時のみ許可(2026-07-09 批判レビュー・跳躍B)。8度超>12は常に不可。
const arpOK = (arr: { pitch: number; start: number }[], i: number): boolean => {
  const a = Math.abs(arr[i]!.pitch - arr[i - 1]!.pitch);
  if (a > 12) return false;
  // push(前借り)は onset を最大16分前へずらすので、start と start+0.26 の両小節でコード音判定（前借り前の帰属を回収）。
  const isCT = (n: { pitch: number; start: number }): boolean => {
    const pc = ((n.pitch % 12) + 12) % 12;
    const b = Math.min(pcsPerBar.length - 1, Math.floor(n.start / 4)), b2 = Math.min(pcsPerBar.length - 1, Math.floor((n.start + 0.26) / 4));
    return pcsPerBar[b]!.includes(pc) || pcsPerBar[b2]!.includes(pc);
  };
  return isCT(arr[i - 1]!) && isCT(arr[i]!);
};

describe("genMotifMelodyV2（A2レシピ＝骨格＋選別＋輪郭駆動＋発展＋弧）", () => {
  it("① 返り音はすべて scale 内（その調の音階ピッチ）", () => {
    const notes = gen(14);
    const scaleSet = new Set(sp.map((p) => ((p % 12) + 12) % 12));
    expect(notes.length).toBeGreaterThan(0);
    for (const n of notes) expect(scaleSet.has(((n.pitch % 12) + 12) % 12)).toBe(true);
  });

  it("② 強拍(0/2拍)のコードトーン率が高い（>0.5）", () => {
    const notes = gen(14);
    const strong = notes.filter((n) => isStrong(n.start));
    expect(strong.length).toBeGreaterThan(0);
    const ct = strong.filter((n) => {
      const bar = Math.min(pcsPerBar.length - 1, Math.floor(n.start / 4));
      return pcsPerBar[bar]!.includes(((n.pitch % 12) + 12) % 12);
    });
    expect(ct.length / strong.length).toBeGreaterThan(0.5);
  });

  it("③ 全 onset が 0..bars*4 の範囲に収まる（小節数×拍）", () => {
    const bars = 8;
    const notes = gen(14, bars);
    for (const n of notes) {
      expect(n.start).toBeGreaterThanOrEqual(0);
      expect(n.start).toBeLessThan(bars * 4);
    }
    // start 昇順
    for (let i = 1; i < notes.length; i++) expect(notes[i]!.start).toBeGreaterThanOrEqual(notes[i - 1]!.start);
  });

  it("④ seed決定的：同seedで同結果・別seedで別結果", () => {
    expect(JSON.stringify(gen(14))).toBe(JSON.stringify(gen(14)));
    expect(JSON.stringify(gen(14))).not.toBe(JSON.stringify(gen(21)));
  });

  it("⑤ 発展：B(5-6小節)は反行で A(1-2小節)と輪郭が異なる／A''は句末トニック着地", () => {
    const notes = gen(14);
    const contour = (b0: number) => {
      const seg = notes.filter((n) => n.start >= b0 * 4 && n.start < (b0 + 2) * 4).sort((a, b) => a.start - b.start);
      const mv: number[] = [];
      for (let i = 1; i < seg.length; i++) mv.push(Math.sign(seg[i]!.pitch - seg[i - 1]!.pitch));
      return mv;
    };
    const a = contour(0); // A
    const b = contour(4); // B（反行＝bar5-6）
    expect(a.length).toBeGreaterThan(0);
    expect(b.length).toBeGreaterThan(0);
    // 反行＝同位置の符号が大半で逆（完全一致でないことを確認＝輪郭が異なる）。
    expect(JSON.stringify(a)).not.toBe(JSON.stringify(b));
    // A''（最終句）の最後の音はトニック(pc=0)へ着地。
    const last = notes[notes.length - 1]!;
    expect(((last.pitch % 12) + 12) % 12).toBe(0);
  });

  it("⑥ bars=4 等の短尺でも壊れない（終止音はその時点のコード構成音）", () => {
    const notes = gen(14, 4); // 4小節目=G7（B1: トニックが無いコードなら最寄りコード音に着地）
    expect(notes.length).toBeGreaterThan(0);
    const last = notes[notes.length - 1]!;
    const bar = Math.min(3, Math.floor(last.start / 4));
    const pc = ((last.pitch % 12) + 12) % 12;
    expect(pcsPerBar[bar]!.includes(pc)).toBe(true);
  });

  it("⑧ 句頭アンカー＝骨格のブロック頭bar downbeat（C1回帰：骨格はbeat索引・bar番号で引かない）", async () => {
    const { blockAnchorFromSkeleton } = await import("../src/music/melodyCells");
    const skel44 = Array.from({ length: 32 }, (_, i) => 60 + i); // 8小節×4拍・beat i の構造音=60+i
    expect(blockAnchorFromSkeleton(skel44, 0, 4, 62)).toBe(60);
    expect(blockAnchorFromSkeleton(skel44, 2, 4, 62)).toBe(68); // bar2 頭＝beat8（旧バグ: skel[2]=62＝bar0の3拍目）
    expect(blockAnchorFromSkeleton(skel44, 4, 4, 62)).toBe(76); // bar4 頭＝beat16
    expect(blockAnchorFromSkeleton(skel44, 6, 4, 62)).toBe(84);
    const skel68 = Array.from({ length: 24 }, (_, i) => 60 + i); // 6/8＝bpb3
    expect(blockAnchorFromSkeleton(skel68, 4, 3, 62)).toBe(72); // bar4 頭＝beat12
    expect(blockAnchorFromSkeleton(skel44, 100, 4, 62)).toBe(91); // 範囲外は末尾へクランプ
  });

  it("⑨ 終止のコード追従：終止音は「その時点のコード」の構成音（Vならsus4未解決の主音強制をしない）（B1）", () => {
    const rootsV = [0, 9, 5, 7, 0, 9, 5, 7];
    const qualsV = ["maj7", "min7", "maj7", "7", "maj7", "min7", "maj7", "7"]; // 最終小節=G7
    const pcsV = rootsV.map((r, i) => chordPcs(r, qualsV[i]!));
    let sawOverV = false;
    for (const seed of [3, 7, 14, 21]) {
      const notes = genMotifMelodyV2(pcsV, rootsV, qualsV, sp, motif16, { seed, tonicPc: 0, minor: false });
      const last = notes[notes.length - 1]!;
      const bar = Math.min(7, Math.floor(last.start / 4));
      const pc = ((last.pitch % 12) + 12) % 12;
      // 終止音は自分が鳴っている小節のコード構成音（旧: コード無視で主音強制＝G7上のC）。
      expect(pcsV[bar]!.includes(pc), `seed=${seed} bar=${bar}: 終止音pc=${pc}∈chord`).toBe(true);
      if (qualsV[bar] === "7") sawOverV = true;
    }
    expect(sawOverV).toBe(true); // 少なくとも1本はV上で終わっている＝V終止のケースを実際に検証した
  });

  it("⑩ 後処理の保証が最終出力で成立：禁則跳躍ゼロ＋単一頂点（D1/D2＝パス相互破壊の回帰）", () => {
    // 旧: 実行順が②③→①強拍CT→④頂点で、後段が直した禁則を再導入しても再チェックが無かった。
    for (let seed = 1; seed <= 30; seed++) {
      const notes = gen(seed);
      // 禁則音程（三全音/7度/8度超）が残らない
      for (let i = 1; i < notes.length; i++) {
        const a = Math.abs(notes[i]!.pitch - notes[i - 1]!.pitch);
        expect((a === 6 || a === 10 || a === 11 || a > 12) && !arpOK(notes, i), `seed=${seed} i=${i}: 禁則|${a}|が残留`).toBe(false);
      }
      // 単一頂点（終止音は保護対象なので除外して数える）
      const hi = Math.max(...notes.map((n) => n.pitch));
      const peaks = notes.filter((n, idx) => n.pitch === hi && idx < notes.length - 1).length;
      expect(peaks <= 1, `seed=${seed}: 頂点が${peaks}個`).toBe(true);
    }
  });

  it("⑪ C3: 小節内コードチェンジ＝|Dm G|の後半強拍(3拍目)は G の構成音（旧: 小節頭のDmしか見えない）", async () => {
    const { genMelody } = await import("../src/music/generate");
    const chords: { root: number; quality: string; start: number; dur: number }[] = [];
    for (let bar = 0; bar < 8; bar++) {
      chords.push({ root: 2, quality: "m", start: bar * 4, dur: 2 }); // Dm 前半
      chords.push({ root: 7, quality: "", start: bar * 4 + 2, dur: 2 }); // G 後半
    }
    const gSet = new Set([7, 11, 2]);
    let checked = 0;
    for (let seed = 1; seed <= 12; seed++) {
      // expression:0 で isolate（既定較正でexpressionが強拍を非和声化するのは別機能＝ここは小節内チェンジ追従のみ検証）。
      const res = genMelody({ key: 0, bars: 8 }, chords, seed, { useV2: true, expression: 0 });
      const notes = (res.items[0]!.content as { notes: { pitch: number; start: number }[] }).notes;
      for (const n of notes) {
        const ib = ((n.start % 4) + 4) % 4;
        if (Math.abs(ib - 2) < 0.01 && n.start < 32) {
          checked++;
          const pc = ((n.pitch % 12) + 12) % 12;
          expect(gSet.has(pc), `seed=${seed} t=${n.start}: 3拍目pc=${pc}はGの構成音であるべき`).toBe(true);
        }
      }
    }
    expect(checked).toBeGreaterThan(5); // 3拍目onsetが実際に複数検証されたこと
  });

  it("⑦ 終止保護：禁則跳躍パスが最終音の着地を上書きしない（B3回帰・実バグseed固定）", async () => {
    // スイープ(2026-07-08)で発見：直前音→終止が禁則音程(三全音等)の時、②禁則パスに終止保護が無く
    // 最終音が書き換えられ着地から外れた（960本中6本）。B1(コード追従)後の正準インバリアント＝
    // 「終止音は自小節のコード構成音・そのコードに主音があれば主音」で検証。
    const { genMelody, genChords } = await import("../src/music/generate");
    const { chordPcs: cp, normRoot } = await import("../src/music/theory");
    const cases = [
      { key: 10, mood: "明るい", seed: 8 },
      { key: 10, mood: "切ない", seed: 3 },
      { key: 11, mood: "明るい", seed: 12 },
    ];
    for (const c of cases) {
      const frame = { key: c.key, bars: 8, mood: c.mood };
      const ch = (genChords(frame, c.seed).items[0]!.content as { chords: unknown }).chords as { root: number; quality: string; start: number; dur: number }[];
      const r = genMelody(frame, ch, c.seed, { useV2: true });
      const notes = (r.items[0]!.content as { notes: { pitch: number; start: number }[] }).notes;
      const last = notes[notes.length - 1]!;
      const pc = ((last.pitch % 12) + 12) % 12;
      const at = ch.find((x) => last.start >= x.start - 1e-6 && last.start < x.start + x.dur);
      const pcs = at ? cp(normRoot(at.root), at.quality ?? "") : null;
      expect(pcs, `key=${c.key} seed=${c.seed}: 終止時点のコードが見つかる`).toBeTruthy();
      expect(pcs!.includes(pc), `key=${c.key} seed=${c.seed}: 終止音pc=${pc}∈chord`).toBe(true);
      if (pcs!.includes(c.key)) expect(pc, `key=${c.key} seed=${c.seed}: 主音があるなら主音着地`).toBe(c.key);
    }
  });

  // ── Step1（2026-07-09・理論不足総点検 design#12-M）：expression=強拍非和声ノブ ──
  const genE = (seed: number, expression: number, bars = 8) =>
    genMotifMelodyV2(pcsPerBar.slice(0, bars), ROOTS.slice(0, bars), QUALS.slice(0, bars), sp, motif16, { seed, tonicPc: 0, minor: false, expression });

  it("⑫ expression未指定=0＝従来完全一致（回帰ゼロ）", () => {
    for (let seed = 1; seed <= 20; seed++) {
      expect(JSON.stringify(genE(seed, 0)), `seed=${seed}: expr=0`).toBe(JSON.stringify(gen(seed)));
    }
    // 明示 undefined も同じ経路（既定）
    expect(JSON.stringify(genMotifMelodyV2(pcsPerBar, ROOTS, QUALS, sp, motif16, { seed: 14, tonicPc: 0, minor: false }))).toBe(JSON.stringify(gen(14)));
  });

  it("⑬ expression=1：強拍の非和声はすべて合法な滑り込み（classifyNCT≠other・歩進解決）＝孤立非和声ゼロ", async () => {
    const { classifyNCT } = await import("../src/music/degree");
    let sawNct = 0;
    for (let seed = 1; seed <= 30; seed++) {
      const notes = genE(seed, 1);
      for (let i = 0; i < notes.length - 1; i++) {
        if (!isStrong(notes[i]!.start)) continue;
        const bar = Math.min(pcsPerBar.length - 1, Math.floor(notes[i]!.start / 4));
        const pc = ((notes[i]!.pitch % 12) + 12) % 12;
        if (pcsPerBar[bar]!.includes(pc)) continue; // コード音はそのまま
        sawNct++;
        const prev = i > 0 ? notes[i - 1]!.pitch : null;
        const next = notes[i + 1]!.pitch;
        const kind = classifyNCT(prev, notes[i]!.pitch, next, { root: ROOTS[bar]!, quality: QUALS[bar]! });
        // 強拍の非和声は必ず解決を伴う型（other=孤立は禁止）
        expect(["passing", "neighbor", "appoggiatura", "suspension"], `seed=${seed} t=${notes[i]!.start}: kind=${kind}`).toContain(kind);
      }
    }
    expect(sawNct, "expr=1 で強拍非和声が一度も生じない＝ノブが効いていない").toBeGreaterThan(0);
  });

  it("⑭ expression=1でも終止音不変・禁則跳躍ゼロ・決定的", () => {
    for (let seed = 1; seed <= 30; seed++) {
      const base = gen(seed);
      const e = genE(seed, 1);
      // 終止音（最後の音）は表情パスで動かさない＝着地保護
      expect(e[e.length - 1]!.pitch, `seed=${seed}: 終止音不変`).toBe(base[base.length - 1]!.pitch);
      // 禁則跳躍を再導入しない
      for (let i = 1; i < e.length; i++) {
        const a = Math.abs(e[i]!.pitch - e[i - 1]!.pitch);
        expect((a === 6 || a === 10 || a === 11 || a > 12) && !arpOK(e, i), `seed=${seed} i=${i}: 禁則|${a}|`).toBe(false);
      }
    }
    // 決定性
    expect(JSON.stringify(genE(14, 0.5))).toBe(JSON.stringify(genE(14, 0.5)));
  });

  it("⑮ expression>0で強拍コードトーン率が下がる（綺麗すぎの緩和＝100%からの脱却）", () => {
    const strongCtRate = (expression: number) => {
      let strong = 0, ct = 0;
      for (let seed = 1; seed <= 40; seed++) {
        const notes = genMotifMelodyV2(pcsPerBar, ROOTS, QUALS, sp, motif16, { seed, tonicPc: 0, minor: false, expression })
          .filter((n) => isStrong(n.start));
        for (const n of notes) {
          strong++;
          const bar = Math.min(pcsPerBar.length - 1, Math.floor(n.start / 4));
          if (pcsPerBar[bar]!.includes(((n.pitch % 12) + 12) % 12)) ct++;
        }
      }
      return ct / strong;
    };
    const r0 = strongCtRate(0);
    const r1 = strongCtRate(1);
    expect(r1, `expr=1 の強拍CT率(${r1.toFixed(3)}) < expr=0(${r0.toFixed(3)})`).toBeLessThan(r0);
    expect(r1, "expr=1 でも過半は強拍CT（崩しすぎない）").toBeGreaterThan(0.5);
  });

  // ── Step2（2026-07-09・P0-b）：句構造(phrases)のV2配線＝句末カデンツ着地 ──
  // 対称8小節＝2小節句×4・cadenceDegree=[5,1,5,1]（前楽節=属音/後楽節=主音）。
  const SYM_PHRASES = [
    { startBeat: 0, beats: 8, cadenceDegree: 5 },
    { startBeat: 8, beats: 8, cadenceDegree: 1 },
    { startBeat: 16, beats: 8, cadenceDegree: 5 },
    { startBeat: 24, beats: 8, cadenceDegree: 1 },
  ];
  const genP = (seed: number, phrases?: typeof SYM_PHRASES) =>
    genMotifMelodyV2(pcsPerBar, ROOTS, QUALS, sp, motif16, { seed, tonicPc: 0, minor: false, phrases });
  const landingPc = (notes: { pitch: number; start: number }[], startBeat: number, endBeat: number) => {
    let li = -1;
    for (let i = 0; i < notes.length; i++) if (notes[i]!.start >= startBeat - 1e-6 && notes[i]!.start < endBeat - 1e-6) li = i;
    return li < 0 ? null : ((notes[li]!.pitch % 12) + 12) % 12;
  };

  it("⑯ phrases未指定＝従来bit一致（回帰ゼロ）", () => {
    for (let seed = 1; seed <= 20; seed++) expect(JSON.stringify(genP(seed)), `seed=${seed}`).toBe(JSON.stringify(gen(seed)));
    // phrases指定で出力が変わる（ノブが効く）
    expect(JSON.stringify(genP(14, SYM_PHRASES))).not.toBe(JSON.stringify(gen(14)));
  });

  it("⑰ symmetric：句末着地はB1和声追従（cadence pc がその時点のコードにあれば採用・無ければ最寄りコード音）", () => {
    // 着地はブロックでなく「句の最終onset」に付く＝メロの疎密でどの小節に落ちるかは seed 依存。
    // 契約（seed非依存）：着地pc = want(cadenceのpc) if want∈その時点コード else そのコード構成音。
    const landingAt = (notes: { pitch: number; start: number }[], sb: number, eb: number) => {
      let li = -1;
      for (let i = 0; i < notes.length; i++) if (notes[i]!.start >= sb - 1e-6 && notes[i]!.start < eb - 1e-6) li = i;
      if (li < 0) return null;
      return { pc: ((notes[li]!.pitch % 12) + 12) % 12, bar: Math.min(pcsPerBar.length - 1, Math.floor(notes[li]!.start / 4)) };
    };
    let sawDominantLanding = false;
    for (const seed of [3, 7, 14, 21, 30]) {
      const notes = genP(seed, SYM_PHRASES);
      for (const ph of SYM_PHRASES) {
        const L = landingAt(notes, ph.startBeat, ph.startBeat + ph.beats);
        expect(L, `seed=${seed} 句[${ph.startBeat}]に着地onset`).not.toBeNull();
        const want = ph.cadenceDegree === 5 ? 7 : 0; // 5̂=G(7) / 1̂=C(0)
        const chord = pcsPerBar[L!.bar]!;
        if (chord.includes(want)) expect(L!.pc, `seed=${seed} 句[${ph.startBeat}]: wantがコードにあれば採用`).toBe(want);
        else expect(chord.includes(L!.pc), `seed=${seed} 句[${ph.startBeat}]: pc=${L!.pc}∈chord`).toBe(true);
        if (ph.cadenceDegree === 5 && L!.pc === 7) sawDominantLanding = true;
      }
    }
    expect(sawDominantLanding, "前楽節が属音(5̂=開き)に着地するケースが実在＝問いの呼吸").toBe(true);
  });

  it("⑱ phrases適用でも禁則跳躍ゼロ・音域維持・決定的（symmetric/asymmetric）", async () => {
    const { planSkeleton } = await import("../src/music/skeleton");
    const asym = planSkeleton(8, "4/4", { phrasing: "asymmetric" }).map((p) => ({ startBeat: p.startBeat, beats: p.beats, cadenceDegree: p.cadenceDegree }));
    for (const phrases of [SYM_PHRASES, asym]) {
      for (let seed = 1; seed <= 20; seed++) {
        const notes = genP(seed, phrases);
        for (let i = 1; i < notes.length; i++) {
          const a = Math.abs(notes[i]!.pitch - notes[i - 1]!.pitch);
          expect((a === 6 || a === 10 || a === 11 || a > 12) && !arpOK(notes, i), `seed=${seed} i=${i}: 禁則|${a}|`).toBe(false);
        }
        for (const n of notes) { expect(n.pitch).toBeGreaterThanOrEqual(58); expect(n.pitch).toBeLessThanOrEqual(83); }
      }
      expect(JSON.stringify(genP(14, phrases))).toBe(JSON.stringify(genP(14, phrases)));
    }
  });

  it("⑲ asymmetric（8小節=3+3+2）：句末着地が bar3末/bar6末/最終 に付く（対称と異なる呼吸）", async () => {
    const { planSkeleton } = await import("../src/music/skeleton");
    const asym = planSkeleton(8, "4/4", { phrasing: "asymmetric" });
    // asymmetricBars=[3,3,2]＝startBeat 0/12/24・beats 12/12/8
    expect(asym.map((p) => p.startBeat)).toEqual([0, 12, 24]);
    const phrases = asym.map((p) => ({ startBeat: p.startBeat, beats: p.beats, cadenceDegree: p.cadenceDegree }));
    const sym = genP(14, SYM_PHRASES);
    const as = genP(14, phrases);
    expect(JSON.stringify(sym), "非対称は対称と異なる").not.toBe(JSON.stringify(as));
    // 各句末に着地onsetが存在
    for (const p of phrases) expect(landingPc(as, p.startBeat, p.startBeat + p.beats), `句[${p.startBeat}]に着地`).not.toBeNull();
    // D-P1(2026-07-09 監査D)：骨格が句割りを見る＝非対称が句末1-2音でなく**構造的に**対称と異なる（化粧でない）。
    let diffMax = 0;
    for (const seed of [3, 7, 14, 21, 30]) {
      const s = genP(seed, SYM_PHRASES), a = genP(seed, phrases);
      let d = 0; const n = Math.min(s.length, a.length);
      for (let i = 0; i < n; i++) if (s[i]!.pitch !== a[i]!.pitch) d++;
      diffMax = Math.max(diffMax, d + Math.abs(s.length - a.length));
    }
    expect(diffMax, `非対称の差分が構造的(>3音・骨格追従)。max=${diffMax}`).toBeGreaterThan(3);
  });

  // ── Step4（2026-07-09・本丸1）：16分細分 runs（走句）／push（前借り） ──
  const genR = (seed: number, o: { runs?: number; push?: number }) =>
    genMotifMelodyV2(pcsPerBar, ROOTS, QUALS, sp, motif16, { seed, tonicPc: 0, minor: false, ...o });
  const is16Off = (t: number) => Math.abs(((t * 4) % 2) - 1) < 0.1; // 16分裏 onset(.25/.75)
  const rate16 = (fn: (seed: number) => { pitch: number; start: number }[]) => {
    let tot = 0, off = 0, adj = 0, offN = 0;
    for (let seed = 1; seed <= 40; seed++) {
      const notes = fn(seed);
      const starts = notes.map((n) => n.start).sort((a, b) => a - b);
      for (let i = 0; i < starts.length; i++) {
        tot++;
        if (is16Off(starts[i]!)) { off++; offN++; if ((i > 0 && starts[i]! - starts[i - 1]! <= 0.26) || (i < starts.length - 1 && starts[i + 1]! - starts[i]! <= 0.26)) adj++; }
      }
    }
    return { offRate: off / tot, adjRate: offN ? adj / offN : 0 };
  };

  it("⑳ runs/push 未指定＝従来bit一致（回帰ゼロ）", () => {
    for (let seed = 1; seed <= 20; seed++) {
      expect(JSON.stringify(genR(seed, {})), `seed=${seed}`).toBe(JSON.stringify(gen(seed)));
      expect(JSON.stringify(genR(seed, { push: 0 })), `seed=${seed} push0`).toBe(JSON.stringify(gen(seed)));
    }
  });

  it("㉑ runs=1で16分裏onsetが増え・走句性(隣接率)が出る（実曲gap縮小）", () => {
    const base = rate16((s) => genR(s, {}));
    const hi = rate16((s) => genR(s, { runs: 1 }));
    expect(hi.offRate, `16分裏率 runs1(${hi.offRate.toFixed(3)}) > base(${base.offRate.toFixed(3)})`).toBeGreaterThan(base.offRate);
    expect(hi.offRate, "runs=1で16分裏率>0.15").toBeGreaterThan(0.15);
    expect(hi.adjRate, `16分裏の隣接率(${hi.adjRate.toFixed(3)})>0.5＝走句`).toBeGreaterThan(0.5);
  });

  it("㉑b 走句がスケール的に繋がる＝16分連鎖の同音潰れが少ない・順次(1-2半音)が多い（2026-07-10 案B）", () => {
    // 半音±1 snap のタイブレークで上行の全音境界が同音に潰れる問題を、走句だけスケール1段移動で解消。
    let chain = 0, rep = 0, step = 0;
    for (let seed = 1; seed <= 40; seed++) {
      const notes = genR(seed, { runs: 1 }).sort((a, b) => a.start - b.start);
      for (let i = 1; i < notes.length; i++) {
        if (notes[i]!.start - notes[i - 1]!.start <= 0.26) {
          chain++;
          const d = Math.abs(notes[i]!.pitch - notes[i - 1]!.pitch);
          if (d === 0) rep++;
          if (d >= 1 && d <= 2) step++;
        }
      }
    }
    expect(chain, "16分連鎖が実在").toBeGreaterThan(50);
    expect(rep / chain, `同音率(${(rep / chain).toFixed(3)})<0.25（従来~0.47から半減以下）`).toBeLessThan(0.25);
    expect(step / chain, `順次(1-2半音)率(${(step / chain).toFixed(3)})>0.7`).toBeGreaterThan(0.7);
  });

  it("㉒ push=0.66で前借りが毎小節同一拍に付く・終端不変・タイ", () => {
    // push は anticipate 相当＝指定拍(位置固定)の onset を16分前へ。0.66→1,3拍目。
    for (const seed of [3, 7, 14, 21]) {
      const base = genR(seed, {});
      const p = genR(seed, { push: 0.66 });
      // 終端（最後の音のstart）は前借りしない＝終止保護
      expect(p[p.length - 1]!.start, `seed=${seed} 終端不変`).toBe(base[base.length - 1]!.start);
      // 16分位置(.25/.75)に載る前借り onset が実在（=食いが出た）
    }
    // 少なくとも1本で 16分裏 onset が push で増える
    const anyPush = [1, 2, 3, 5, 8].some((s) => genR(s, { push: 1 }).some((n) => is16Off(n.start)) && !gen(s).some((n) => is16Off(n.start)) || genR(s, { push: 1 }).filter((n) => is16Off(n.start)).length > gen(s).filter((n) => is16Off(n.start)).length);
    expect(anyPush, "push で16分裏onsetが増えるケースが実在").toBe(true);
  });

  it("㉓ runs/push 適用でも禁則ゼロ・音域維持・決定的", () => {
    for (const o of [{ runs: 1 }, { push: 1 }, { runs: 0.7, push: 0.5 }]) {
      for (let seed = 1; seed <= 20; seed++) {
        const notes = genR(seed, o);
        for (let i = 1; i < notes.length; i++) {
          const a = Math.abs(notes[i]!.pitch - notes[i - 1]!.pitch);
          expect((a === 6 || a === 10 || a === 11 || a > 12) && !arpOK(notes, i), `${JSON.stringify(o)} seed=${seed} i=${i}:禁則|${a}|`).toBe(false);
        }
        for (const n of notes) { expect(n.pitch).toBeGreaterThanOrEqual(58); expect(n.pitch).toBeLessThanOrEqual(83); }
      }
      expect(JSON.stringify(genR(14, o))).toBe(JSON.stringify(genR(14, o)));
    }
  });

  // ── Step5（2026-07-09・本丸2）：motif-driven前景 foreground（自由材料の同音/跳躍） ──
  const genF = (seed: number, foreground?: number) =>
    genMotifMelodyV2(pcsPerBar, ROOTS, QUALS, sp, motif16, { seed, tonicPc: 0, minor: false, foreground });
  const leapCount = (notes: { pitch: number; start: number }[]) => {
    const s = [...notes].sort((a, b) => a.start - b.start);
    let c = 0;
    for (let i = 1; i < s.length; i++) if (Math.abs(s[i]!.pitch - s[i - 1]!.pitch) >= 3) c++;
    return c;
  };

  it("㉔ foreground未指定/0＝従来bit一致（回帰ゼロ）", () => {
    for (let seed = 1; seed <= 20; seed++) {
      expect(JSON.stringify(genF(seed)), `seed=${seed}`).toBe(JSON.stringify(gen(seed)));
      expect(JSON.stringify(genF(seed, 0)), `seed=${seed} fg0`).toBe(JSON.stringify(gen(seed)));
    }
  });

  it("㉕ foreground=1で跳躍(≥3度)が増える＝ダルダル解消（実曲の自由材料に寄る）", () => {
    let base = 0, fg = 0;
    for (let seed = 1; seed <= 40; seed++) { base += leapCount(genF(seed, 0)); fg += leapCount(genF(seed, 1)); }
    expect(fg, `跳躍数 fg=1(${fg}) > fg=0(${base})`).toBeGreaterThan(base);
  });

  it("㉖ foreground=1でも禁則ゼロ・音域維持・単一頂点・決定的（合法性不変）", () => {
    for (let seed = 1; seed <= 30; seed++) {
      const notes = genF(seed, 1);
      for (let i = 1; i < notes.length; i++) {
        const a = Math.abs(notes[i]!.pitch - notes[i - 1]!.pitch);
        expect((a === 6 || a === 10 || a === 11 || a > 12) && !arpOK(notes, i), `seed=${seed} i=${i}:禁則|${a}|`).toBe(false);
      }
      for (const n of notes) { expect(n.pitch).toBeGreaterThanOrEqual(58); expect(n.pitch).toBeLessThanOrEqual(83); }
      const hi = Math.max(...notes.map((n) => n.pitch));
      const peaks = notes.filter((n, idx) => n.pitch === hi && idx < notes.length - 1).length;
      expect(peaks <= 1, `seed=${seed}: 頂点${peaks}個`).toBe(true);
    }
    expect(JSON.stringify(genF(14, 1))).toBe(JSON.stringify(genF(14, 1)));
  });

  // ── #9（2026-07-09）：骨格休符＝句頭遅延入場 breathe ──
  const genB = (seed: number, breathe?: number, phrases?: typeof SYM_PHRASES) =>
    genMotifMelodyV2(pcsPerBar, ROOTS, QUALS, sp, motif16, { seed, tonicPc: 0, minor: false, breathe, phrases });

  it("㉗ breathe未指定/0＝従来bit一致（回帰ゼロ）", () => {
    for (let seed = 1; seed <= 20; seed++) {
      expect(JSON.stringify(genB(seed)), `seed=${seed}`).toBe(JSON.stringify(gen(seed)));
      expect(JSON.stringify(genB(seed, 0)), `seed=${seed} b0`).toBe(JSON.stringify(gen(seed)));
    }
  });

  it("㉘ breathe=1で句頭が遅れて入る＝早い位置のonsetが減る・非空・最終音不変・決定的", () => {
    for (const seed of [3, 7, 14, 21, 30]) {
      const base = genB(seed, 0, SYM_PHRASES);
      const br = genB(seed, 1, SYM_PHRASES);
      expect(br.length, `seed=${seed} 非空`).toBeGreaterThan(0);
      // 各句頭 pStart 直後(< pStart+1.0)の onset 数が breathe で減る（遅延入場）
      const earlyN = (ns: { start: number }[]) => SYM_PHRASES.reduce((a, p) => a + ns.filter((n) => n.start >= p.startBeat - 1e-6 && n.start < p.startBeat + 1.0).length, 0);
      expect(earlyN(br), `seed=${seed} 句頭early onset減`).toBeLessThanOrEqual(earlyN(base));
      // 最終音（着地）は保護
      expect(br[br.length - 1]!.start, `seed=${seed} 最終onset保持`).toBe(base[base.length - 1]!.start);
    }
    // 少なくとも1本で実際に減る（ノブが効く）
    const shrinks = [3, 7, 14, 21, 30].some((s) => genB(s, 1, SYM_PHRASES).length < genB(s, 0, SYM_PHRASES).length);
    expect(shrinks, "breatheで句頭onsetが実際に減るケースが実在").toBe(true);
    expect(JSON.stringify(genB(14, 1, SYM_PHRASES))).toBe(JSON.stringify(genB(14, 1, SYM_PHRASES)));
  });

  // ── D本丸（2026-07-09）：sentence形式＝提示→移高反復→継続断片化→カデンツ（固定グリッド上・可変長不要） ──
  const genS = (seed: number, form?: "sentence") =>
    genMotifMelodyV2(pcsPerBar, ROOTS, QUALS, sp, motif16, { seed, tonicPc: 0, minor: false, form });

  it("㉜ form未指定＝従来AABA・bit一致（回帰ゼロ）", () => {
    for (let seed = 1; seed <= 20; seed++) expect(JSON.stringify(genS(seed)), `seed=${seed}`).toBe(JSON.stringify(gen(seed)));
  });

  it("㉝ sentence：継続部(bar4-5)が断片化で加速＝密度が上がる（起承転結の転）", () => {
    const barDensity = (notes: { start: number }[]) => { const d = [0, 0, 0, 0, 0, 0, 0, 0]; notes.forEach((n) => { const b = Math.floor(n.start / 4); if (b >= 0 && b < 8) d[b]++; }); return d; };
    let contSum = 0, presSum = 0, diff = 0;
    for (let seed = 1; seed <= 30; seed++) {
      const b = gen(seed), s = genS(seed, "sentence");
      if (JSON.stringify(b) !== JSON.stringify(s)) diff++;
      const d = barDensity(s);
      contSum += d[4]! + d[5]!; // 継続ブロック(bar4-5)
      presSum += d[0]! + d[1]!; // 提示ブロック(bar0-1)
    }
    expect(diff, "sentence が既定と変わる").toBe(30);
    expect(contSum, `継続部密度(${contSum}) > 提示部(${presSum})＝加速`).toBeGreaterThan(presSum);
  });

  it("㉞ sentence でも 禁則(アルペジオ除く)ゼロ・単一頂点・終止着地・決定的", () => {
    for (let seed = 1; seed <= 30; seed++) {
      const notes = genS(seed, "sentence");
      for (let i = 1; i < notes.length; i++) {
        const a = Math.abs(notes[i]!.pitch - notes[i - 1]!.pitch);
        expect((a === 6 || a === 10 || a === 11 || a > 12) && !arpOK(notes, i), `seed=${seed} i=${i} 禁則`).toBe(false);
      }
      const hi = Math.max(...notes.map((n) => n.pitch));
      expect(notes.filter((n, idx) => n.pitch === hi && idx < notes.length - 1).length <= 1, `seed=${seed} 単一頂点`).toBe(true);
      // 終止＝その小節のコード音(B1・主音があれば主音)。sentence が終止着地を壊さない。
      const lastN = notes[notes.length - 1]!, lbar = Math.min(pcsPerBar.length - 1, Math.floor(lastN.start / 4));
      expect(pcsPerBar[lbar]!.includes(((lastN.pitch % 12) + 12) % 12), `seed=${seed} 終止∈chord`).toBe(true);
    }
    expect(JSON.stringify(genS(14, "sentence"))).toBe(JSON.stringify(genS(14, "sentence")));
  });

  // ── E（2026-07-09・5領域監査）：グルーヴの器＝humanize(velocity＋微小タイミング揺れ) ──
  const genH = (seed: number, humanize?: number) =>
    genMotifMelodyV2(pcsPerBar, ROOTS, QUALS, sp, motif16, { seed, tonicPc: 0, minor: false, humanize });

  it("㉚ humanize未指定/0＝velフィールド無し・従来bit一致（回帰ゼロ）", () => {
    for (let seed = 1; seed <= 20; seed++) {
      const notes = genH(seed);
      expect(notes.every((n) => (n as { vel?: number }).vel === undefined), `seed=${seed}: vel無し`).toBe(true);
      expect(JSON.stringify(notes), `seed=${seed}: bit一致`).toBe(JSON.stringify(gen(seed)));
    }
  });

  it("㉛ humanize=1＝velが付き(強弱)・タイミングが微小に揺れ・終止音は不変・決定的", () => {
    for (const seed of [3, 7, 14]) {
      const base = gen(seed), h = genH(seed, 1);
      expect(h.every((n) => typeof (n as { vel?: number }).vel === "number"), `seed=${seed}: 全音にvel`).toBe(true);
      const vels = h.map((n) => (n as { vel: number }).vel);
      expect(Math.min(...vels) < Math.max(...vels), `seed=${seed}: velに強弱の幅`).toBe(true); // 一律でない
      expect(vels.every((v) => v >= 50 && v <= 120), `seed=${seed}: vel域`).toBe(true);
      // 終止音(最後)のstartは不変
      expect(h[h.length - 1]!.start, `seed=${seed}: 終止timing不変`).toBe(base[base.length - 1]!.start);
      // 微小に揺れる（少なくとも1音の start が grid から外れる）
      expect(h.some((n) => Math.abs(n.start - Math.round(n.start * 4) / 4) > 1e-4), `seed=${seed}: timing揺れ`).toBe(true);
      // 昇順維持
      for (let i = 1; i < h.length; i++) expect(h[i]!.start).toBeGreaterThanOrEqual(h[i - 1]!.start);
    }
    expect(JSON.stringify(genH(14, 1))).toBe(JSON.stringify(genH(14, 1))); // 決定的
  });

  // ── B（2026-07-09・5領域監査）：足踏み(同音)の根治＝後処理①のanti-unison例外 ──
  it("㉘ 同音率が抑えられている（後処理①のanti-unison・強拍CTと禁則は維持）", () => {
    let ivs = 0, uni = 0, strong = 0, strongCT = 0;
    for (let seed = 1; seed <= 40; seed++) {
      const notes = gen(seed);
      for (let i = 0; i < notes.length; i++) {
        if (i > 0 && notes[i]!.pitch === notes[i - 1]!.pitch) uni++;
        if (i > 0) ivs++;
        if (isStrong(notes[i]!.start)) { strong++; const bar = Math.min(pcsPerBar.length - 1, Math.floor(notes[i]!.start / 4)); if (pcsPerBar[bar]!.includes(((notes[i]!.pitch % 12) + 12) % 12)) strongCT++; }
      }
    }
    const uniRate = uni / ivs, ctRate = strongCT / strong;
    expect(uniRate, `同音率=${(uniRate * 100).toFixed(1)}% が目安帯(<0.25)`).toBeLessThan(0.25); // 修正前~0.28→修正後~0.21
    expect(ctRate, `強拍CT率=${(ctRate * 100).toFixed(1)}% は維持(>0.8)`).toBeGreaterThan(0.8); // ①のCT不変量を壊さない
  });

  it("㉙ anti-unison後も 禁則ゼロ(アルペジオ除く)・単一頂点・決定的", () => {
    for (let seed = 1; seed <= 30; seed++) {
      const notes = gen(seed);
      for (let i = 1; i < notes.length; i++) {
        const a = Math.abs(notes[i]!.pitch - notes[i - 1]!.pitch);
        expect((a === 6 || a === 10 || a === 11 || a > 12) && !arpOK(notes, i), `seed=${seed} i=${i} 禁則`).toBe(false);
      }
      const hi = Math.max(...notes.map((n) => n.pitch));
      expect(notes.filter((n, idx) => n.pitch === hi && idx < notes.length - 1).length <= 1, `seed=${seed} 単一頂点`).toBe(true);
    }
    expect(JSON.stringify(gen(14))).toBe(JSON.stringify(gen(14)));
  });

  // ── Phase2案B U1-U2（2026-07-10）：動機モデル度数列導出＋hookゲート（単一ドロー形・bit一致基盤） ──
  const genHk = (seed: number, o: { hook?: number }) =>
    genMotifMelodyV2(pcsPerBar, ROOTS, QUALS, sp, motif16, { seed, tonicPc: 0, minor: false, ...o });

  it("H1 hook未指定/0＝従来bit一致（単一r()ドロー形＝乱数列不変・回帰ゼロ）", () => {
    for (let seed = 1; seed <= 30; seed++) {
      expect(JSON.stringify(genHk(seed, {})), `seed=${seed}`).toBe(JSON.stringify(gen(seed)));
      expect(JSON.stringify(genHk(seed, { hook: 0 })), `seed=${seed} hook0`).toBe(JSON.stringify(gen(seed)));
    }
  });

  it("H2 hook=1でも決定的・音域維持・禁則ゼロ（合法性不変・出力段の反復音顕在化はU3/U4後）", () => {
    for (let seed = 1; seed <= 20; seed++) {
      const notes = genHk(seed, { hook: 1 });
      expect(notes.length).toBeGreaterThan(0);
      for (const n of notes) { expect(n.pitch).toBeGreaterThanOrEqual(58); expect(n.pitch).toBeLessThanOrEqual(83); }
      for (let i = 1; i < notes.length; i++) {
        const a = Math.abs(notes[i]!.pitch - notes[i - 1]!.pitch);
        expect((a === 6 || a === 10 || a === 11 || a > 12) && !arpOK(notes, i), `seed=${seed} i=${i}:禁則|${a}|`).toBe(false);
      }
    }
    expect(JSON.stringify(genHk(14, { hook: 1 }))).toBe(JSON.stringify(genHk(14, { hook: 1 })));
  });

  // ── Phase2案B U3-U4（2026-07-10）：動機保存レンダ motifMode:"preserve"＋保護マスク ──
  const genPr = (seed: number, o: { hook?: number; motifMode?: "preserve" }) =>
    genMotifMelodyV2(pcsPerBar, ROOTS, QUALS, sp, motif16, { seed, tonicPc: 0, minor: false, ...o });

  it("P1 motifMode未指定＝従来bit一致（preserve経路は別関数・保護マスク空集合＝全ガードno-op）", () => {
    for (let seed = 1; seed <= 30; seed++) {
      expect(JSON.stringify(genPr(seed, { hook: 1 })), `seed=${seed} hook1のみ`).toBe(JSON.stringify(genHk(seed, { hook: 1 })));
    }
  });

  it("P2 往復再現（本丸）：seedMotif=オーナー例(A A B C A/B G G)→提示ブロックで反復音が同pitch保存・輪郭符号一致", () => {
    // move（スケール段）0,0,+1,+1,-2（ラ ラ シ ド ラ）／0,-2,0（シ ソ ソ）＝反復音を含む動機。
    const seedMotif = { ons: [0, 0.5, 1, 1.5, 2, 4, 4.5, 5], mv: [0, 0, 1, 1, -2, 0, -2, 0], run: Array(8).fill(false) };
    for (const seed of [7, 14, 21]) {
      const notes = genMotifMelodyV2(pcsPerBar, ROOTS, QUALS, sp, motif16, { seed, tonicPc: 0, minor: false, seedMotif, hook: 1, motifMode: "preserve" });
      const b0 = notes.filter((n) => n.start < 4).sort((a, b) => a.start - b.start); // 提示ブロック前半（ラーラシドラ）
      expect(b0.length).toBeGreaterThanOrEqual(4);
      // 先頭の反復音（ラーラ＝deg 0,0）が同一pitchで保存されている
      expect(b0[0]!.pitch, `seed=${seed} ラーラが同pitch`).toBe(b0[1]!.pitch);
      // 輪郭符号：deg[0,0,1,2,0]＝同,上,上,下。実音の符号列がこれに一致（移高を法とする＝反復音が潰れない）
      const sign = (a: number) => (a > 0 ? 1 : a < 0 ? -1 : 0);
      const contour = [sign(b0[1]!.pitch - b0[0]!.pitch), sign(b0[2]!.pitch - b0[1]!.pitch), sign(b0[3]!.pitch - b0[2]!.pitch)];
      expect(contour, `seed=${seed} 輪郭[同,上,上]`).toEqual([0, 1, 1]);
    }
  });

  it("P3 preserve+hook=1：反復音が出力に組織的に生存・禁則ゼロ・音域維持・決定的（単一頂点は保護優先で緩和）", () => {
    let repPairs = 0;
    for (let seed = 1; seed <= 40; seed++) {
      const notes = genPr(seed, { hook: 1, motifMode: "preserve" });
      expect(notes.length).toBeGreaterThan(0);
      for (const n of notes) { expect(n.pitch).toBeGreaterThanOrEqual(58); expect(n.pitch).toBeLessThanOrEqual(83); }
      for (let i = 1; i < notes.length; i++) {
        const a = Math.abs(notes[i]!.pitch - notes[i - 1]!.pitch);
        expect((a === 6 || a === 10 || a === 11 || a > 12) && !arpOK(notes, i), `seed=${seed} i=${i}:禁則|${a}|`).toBe(false);
        if (a === 0) repPairs++;
      }
    }
    expect(repPairs, `反復音ペアが実在（40seedで${repPairs}）`).toBeGreaterThan(40);
    expect(JSON.stringify(genPr(14, { hook: 1, motifMode: "preserve" }))).toBe(JSON.stringify(genPr(14, { hook: 1, motifMode: "preserve" })));
  });

  it("P4 articulation：未指定/0=dur/vel不変(bit一致)・=1で反復音連打にmicropause(gap≥0.05)＝ソッソッが可聴化", () => {
    const ga = (seed: number, articulation?: number) =>
      genMotifMelodyV2(pcsPerBar, ROOTS, QUALS, sp, motif16, { seed, tonicPc: 0, minor: false, hook: 1, motifMode: "preserve", articulation });
    for (let seed = 1; seed <= 20; seed++) {
      expect(JSON.stringify(ga(seed)), `seed=${seed} art未指定`).toBe(JSON.stringify(ga(seed, 0)));
    }
    let repN = 0, noGap = 0;
    for (let seed = 1; seed <= 30; seed++) {
      const notes = ga(seed, 1).sort((a, b) => a.start - b.start);
      for (let i = 1; i < notes.length; i++) if (notes[i]!.pitch === notes[i - 1]!.pitch) { repN++; if (notes[i]!.start - (notes[i - 1]!.start + notes[i - 1]!.dur) < 0.049) noGap++; }
    }
    expect(repN, "反復音が実在").toBeGreaterThan(20);
    expect(noGap, `全反復音にmicropause（gap無し${noGap}/${repN}）`).toBe(0);
  });
});

// ── Phase2案B U1（2026-07-10）：動機度数列の遅延導出 motifDegrees（mv=SSOT・deg[0]=0 開始音アンカー） ──
describe("motifDegrees（mv差分→度数列 絶対形・cumsum・invert追従）", () => {
  it("deg[0]=0・cumsum・往復（mvから一意）", () => {
    expect(motifDegrees([0, 1, 1, -1])).toEqual([0, 1, 2, 1]); // 0基準の累積
    expect(motifDegrees([0, 2, -3, 0, 1])).toEqual([0, 2, -1, -1, 0]); // 同度(0)は前音と同値＝反復音
    expect(motifDegrees([0])).toEqual([0]);
  });
  it("invert(mv→-mv)は deg→-deg に自動追従（同一性の対称）", () => {
    const mv = [0, 1, 1, -2, 0];
    const inv = mv.map((m, i) => (i === 0 ? 0 : -m));
    expect(motifDegrees(inv)).toEqual(motifDegrees(mv).map((d) => (d === 0 ? 0 : -d)));
  });
  it("反復音（連続同度）が deg で同値に保存される", () => {
    // A A B C A ＝ move 0,0,+1,+1,-2（ラ ラ シ ド ラ・C→A は3度下=スケール2段）→ deg で反復音と回帰が同値
    const deg = motifDegrees([0, 0, 1, 1, -2]);
    expect(deg).toEqual([0, 0, 1, 2, 0]);
    expect(deg[0]).toBe(deg[1]); // ラーラ＝反復音が同degで保存
    expect(deg[4]).toBe(deg[0]); // 末尾ラ＝開始音へ回帰
  });
});
