// 錨と間の分業（構造的ロック）＝phrase_maker `ensemble.py:1111-1179 _lock_bass_roots_to_sheet` の忠実移植。
// 正典＝docs/design.md §2106 追補 (k)／計画 docs/drafts/2026-09-09-phrasemaker-port-master-plan.md §5-2 M3。
// 棚卸し＝docs/research/2026-09-04-phrasemaker-bass-inventory.md §1-5・§3。
//
// 何を解いているか：共有リズム譜（ドラムの骨）の**キック step ごとに必ずルート錨を置く**。ただし
// **錨の間のリフ本体（体）は1つも書き換えない**＝「どこにルートを置くか」だけが骨に縛られ、
// リフの形・レジスタの動きは生き残る。既存 kickLock（確率で共有率を近づける）との違いはここ＝
// あちらは統計的な傾き、こちらは構造的な契約。
//
// 3分岐（源流 docstring そのまま）：キック step `k`（global `gstep = bar*stepsPerBar + k`）で
//   (a) 体の onset が既にルート級（pitch%12 === rootPc）→ **音高もレジスタも据え置き**で錨(head)へ昇格。
//       （オクターブ呼応のレジスタ往復を殺さない。アクセント step なら kind を accent へ）
//   (b) 体の onset が非ルート（5度/b7/blue…）→ **ロックが勝つ**＝元ピッチに最も近いレジスタのルートへ上書き
//       （候補＝ルート低域音の 0/+12/−12・同点は低い方＝輪郭を保つ）。
//   (c) 体が休符（onset 無し）→ 低域ルートの錨を**新規挿入**。案B つまみ（restOnSyncopatedKick）が true のときは
//       **拍頭（gstep%4===0）かアクセントのキックにだけ**挿す＝拍頭でない無音キックはベースを休む（キック単独）。
// 最後に step 昇順へ並べ直す（源流は resolve_approaches が**リスト位置**で前後を見るので step 順が必須）。
//
// **決定的**＝RNG・hash・Date を使わない（源流も同じ＝計画 §6-1「真にクリーン」＝データ一致が取れる）。
// 参照値の突き合わせ＝`tools/py-parity/`（dump スクリプト＋ケース表 JSON）と
// `packages/music-core/test/anchor-lock-parity.test.ts`。
//
// 低域窓 [lo,hi] は**引数**（源流は 28..59＝`bass_rock_riff/theory.py:22 REG_LO/REG_HI`／otomemo は 33..48＝
// `generate.ts BASS_LO/BASS_HI`）。同じ規則を2つの帯で動かせるようにしてあるのは、py-parity で源流の帯を
// 使いつつ製品では otomemo の帯を使うため。

/** リフ onset の rhythmic kind（源流 `riff.py` の4種）。音価ゲートと velocity を規定する語彙。 */
export type AnchorKind = "accent" | "note" | "ghost" | "dead";

/** 体（リフ本体）の1オンセット。`pitch` は源流の `base[i]`（knob=0 の具体 MIDI）に相当。 */
export interface AnchorOnset {
  /** global 16分 step（bar*stepsPerBar + cellIndex） */
  step: number;
  kind: AnchorKind;
  /** 錨（不可侵の頭）か */
  anchor: boolean;
  /** 役割（head/pedal/octave/answer/pickup/climb/dead/blue…）。錨に昇格すると "head" になる */
  role: string;
  /** 具体 MIDI ピッチ */
  pitch: number;
  /** 度数トークン（otomemo 側の表記。ロックが上書きしたら rootDeg になる）。比較対象外＝任意 */
  deg?: string;
  /** 拍頭キックか（源流の挿入分岐が付ける情報・診断用） */
  strong?: boolean;
}

/** コード区間（源流 `chord_follow.Segment`）。step 粒度でコードを読むための最小形。 */
export interface AnchorSeg {
  rootPc: number;
  startStep: number;
  lengthSteps: number;
  /** 滞在中のキックで据え置きを許す pc（絶対 pc）。strictness="chord-change" でだけ読む。未指定＝{R, 5, b7}（design.md 追補 (k-6)） */
  stayPcs?: readonly number[];
}

export interface AnchorLockOpts {
  /** 1小節の step 数（4/4=16） */
  stepsPerBar: number;
  nBars: number;
  /** ドラムのキック step（小節内 0..stepsPerBar-1）。空なら源流と同じ fallback [0,4,8,12]（`parts.py:142`） */
  kick: number[];
  /** アクセント step。otomemo の skeleton は kick/snare のみ＝M3 では常に空（M0契約 §5-2） */
  accents?: number[];
  /** 錨の厳しさ（design.md 追補 (k-6)・2026-09-15 オーナー裁定）。
   *  "every-kick"（**既定＝源流 `_lock_bass_roots_to_sheet` そのまま**＝py-parity の対象）＝全キックでルート。
   *  "chord-change"＝コード区間に入って最初のキック（変わり目）だけルート必須・滞在中のキックは体の音が stayPcs に入っていれば据え置き。
   *  このとき案B は滞在中のキックだけを休ませる（変わり目は必ず挿す）。 */
  strictness?: "every-kick" | "chord-change";
  /** 案B つまみ（源流 `bass_rest_on_syncopated_kick`）。既定 false＝挿入は全キックで起きる */
  restOnSyncopatedKick?: boolean;
  /** 低域窓 */
  lo: number;
  hi: number;
  /** 上書き/挿入した錨に付ける度数トークン（otomemo は "R"・py-parity は "0"） */
  rootDeg?: string;
}

/** 源流 `chord_follow._clamp`（`:90-95`）＝上限から先に折る・最後の clamp は無し。窓幅 >= 11 半音なら必ず窓内に収まる。 */
export function pmClamp(pitch: number, lo: number, hi: number): number {
  let p = pitch;
  while (p > hi) p -= 12;
  while (p < lo) p += 12;
  return p;
}

/** 源流 `theory.root_low`（`:28-33`）の一般形＝pc を窓の最下オクターブへ。
 *  源流は `REG_LO + ((pc - E_PC) % 12)`（REG_LO=28・E_PC=4＝28%12）＝`lo + ((pc - lo) mod 12)` と同型。
 *  otomemo の `bassPcToWindow`（BASS_LO=33）も同じ式＝**帯だけ違う同じ規則**。 */
export function rootLowPitch(rootPc: number, lo: number): number {
  return lo + ((((rootPc % 12) - lo) % 12) + 12) % 12;
}

/** 源流 `chord_follow.chord_at`（`:73-78`）＝**step 粒度**でコードを読む（拍量子化しない＝1拍1コードでも stale しない）。 */
export function chordAtStep(segs: AnchorSeg[], step: number): AnchorSeg | null {
  for (const s of segs) if (s.startStep <= step && step < s.startStep + s.lengthSteps) return s;
  return segs.length > 0 ? segs[segs.length - 1]! : null;
}

/** 診断＝錨の被覆率（計画 §6-4 の 7・M3 受け入れの `byConstruction`）。 */
export interface AnchorLockReport {
  /** 錨を置くべきキック step の総数（案B で見送った分も含む） */
  kickSteps: number;
  /** 実際に錨が乗った step 数 */
  anchored: number;
  /** anchored / kickSteps（kickSteps=0 なら 1） */
  coverage: number;
  /** 分岐ごとの件数（(a)昇格 / (b)上書き / (c)挿入 / 案B で見送り） */
  promoted: number;
  /** chord-change の滞在中キックで、体の許容音をそのまま錨にした数（every-kick では常に 0） */
  kept: number;
  overwritten: number;
  inserted: number;
  skipped: number;
}

export interface AnchorLockResult {
  onsets: AnchorOnset[];
  report: AnchorLockReport;
}

/**
 * `_lock_bass_roots_to_sheet`（`ensemble.py:1111-1179`）の移植。**入力配列は破壊しない**（源流は in-place だが
 * otomemo 側の呼び手は「体」を後で不変条件の照合に使うので複製して返す）。
 */
export function lockBassRootsToSheet(body: readonly AnchorOnset[], segs: AnchorSeg[], opts: AnchorLockOpts): AnchorLockResult {
  const spb = opts.stepsPerBar;
  const rootDeg = opts.rootDeg ?? "R";
  // 源流 `K = list(rs.kick) or [0, 4, 8, 12]`（空キックの fallback＝parts.py:142）。
  // rs.kick は RhythmSpec が tuple(sorted(set)) 化する＝集合順非依存なのでこちらも同じにする。
  const kickSorted = [...new Set(opts.kick)].sort((a, b) => a - b);
  const K = kickSorted.length > 0 ? kickSorted : [0, 4, 8, 12].filter((s) => s < spb);
  const accents = new Set(opts.accents ?? []);
  const onsets: AnchorOnset[] = body.map((o) => ({ ...o }));
  // 源流の `by_step` は**ループ前に1回**作る＝挿入した錨は後続の分岐から見えない。重複 step は後勝ち（dict 上書き）。
  const byStep = new Map<number, number>();
  onsets.forEach((o, i) => byStep.set(o.step, i));
  const rep: AnchorLockReport = { kickSteps: 0, anchored: 0, coverage: 1, promoted: 0, kept: 0, overwritten: 0, inserted: 0, skipped: 0 };
  const chordChange = opts.strictness === "chord-change";
  let prevSeg: AnchorSeg | null = null; // 直前のキックが属したコード区間（sweep 順）＝違えば「変わり目」

  for (let bar = 0; bar < opts.nBars; bar++) {
    for (const k of K) {
      const gstep = bar * spb + k;
      const seg = chordAtStep(segs, gstep);
      if (!seg) continue;
      const rootPc = ((seg.rootPc % 12) + 12) % 12;
      const isAcc = accents.has(k);
      const isChange = seg !== prevSeg;
      prevSeg = seg;
      const stay = seg.stayPcs ?? [rootPc, (rootPc + 7) % 12, (rootPc + 10) % 12];
      rep.kickSteps++;
      const i = byStep.get(gstep);
      if (i !== undefined) {
        const o = onsets[i]!;
        if (((o.pitch % 12) + 12) % 12 === rootPc) {
          // (a) ルート級＝レジスタ据え置きで錨へ昇格
          o.role = "head";
          o.anchor = true;
          if (isAcc) o.kind = "accent";
          rep.promoted++;
        } else if (chordChange && !isChange && stay.some((p) => ((p % 12) + 12) % 12 === ((o.pitch % 12) + 12) % 12)) {
          // (k-6) 滞在中のキック×許容音＝音高もレジスタも据え置きで錨へ（上書きしない）
          o.role = "head";
          o.anchor = true;
          if (isAcc) o.kind = "accent";
          rep.kept++;
        } else {
          // (b) 非ルート＝ロックが勝つ＝元ピッチに最も近いレジスタのルートへ（同点は低い方）
          const rootLow = rootLowPitch(rootPc, opts.lo);
          const cands = [0, 12, -12].map((oc) => pmClamp(rootLow + oc, opts.lo, opts.hi));
          let best = cands[0]!;
          for (const c of cands) {
            const dc = Math.abs(c - o.pitch), db = Math.abs(best - o.pitch);
            if (dc < db || (dc === db && c < best)) best = c;
          }
          o.pitch = best;
          o.deg = rootDeg;
          o.role = "head";
          o.anchor = true;
          o.kind = isAcc ? "accent" : "note";
          rep.overwritten++;
        }
        rep.anchored++;
      } else {
        // (c) 休符 step＝低域ルートの錨を新規挿入（案B＝拍頭/アクセント以外は見送り）
        const strong = gstep % 4 === 0;
        if (opts.restOnSyncopatedKick && !(strong || isAcc) && !(chordChange && isChange)) { rep.skipped++; continue; }
        onsets.push({
          step: gstep, kind: isAcc ? "accent" : "note", anchor: true, role: "head",
          deg: rootDeg, strong, pitch: pmClamp(rootLowPitch(rootPc, opts.lo), opts.lo, opts.hi),
        });
        rep.inserted++;
        rep.anchored++;
      }
    }
  }
  // step 昇順へ（同 step は元の順序を保つ＝安定ソート。源流の `sorted(range(n), key=step)` と同じ）。
  const order = onsets.map((o, i) => [o.step, i] as const).sort((a, b) => (a[0] - b[0]) || (a[1] - b[1]));
  const sorted = order.map(([, i]) => onsets[i]!);
  rep.coverage = rep.kickSteps > 0 ? rep.anchored / rep.kickSteps : 1;
  return { onsets: sorted, report: rep };
}
