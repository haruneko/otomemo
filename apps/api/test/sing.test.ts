import { describe, it, expect } from "vitest";
import { notesToScore, scoreSeconds, chooseOctaveShift, resolveSingBpm, singHashOf, SING_LEAD_REST_SEC, FPS } from "../src/sing";

// 本体（先頭/末尾休符を除く）フレーム列を取り出すヘルパ。notes[0]=先頭休符・末尾=末尾休符。
const bodyFrames = (score: { notes: { key: number | null; frame_length: number }[] }) =>
  score.notes.slice(1, -1).map((n) => n.frame_length);

// 隣接音程列（輪郭）を取り出すヘルパ：シフトは全音を等しく動かすので輪郭は不変であるべき。
const intervals = (keys: (number | null)[]) => {
  const ks = keys.filter((k): k is number => k != null);
  return ks.slice(1).map((k, i) => k - ks[i]!);
};

// W-K3 VOICEVOX スコア変換（純関数・TDD）。正典＝docs/research/2026-07-15-kariuta-voicevox-feasibility.md §3。
// FPS=93.75・frames=round(beats*secPerBeat*93.75)。BPM120→secPerBeat=0.5。四分音符(1拍)=round(0.5*0.5*93.75)=約23。

describe("notesToScore（メロ→VOICEVOX Score・純関数）", () => {
  const bpm = 120;

  it("先頭・末尾に休符 note を必ず付ける（無いと破綻し得る）", () => {
    const s = notesToScore([{ pitch: 60, start: 0, dur: 1, syllable: "そ" }], bpm);
    expect(s.notes[0]!.key).toBeNull();
    expect(s.notes[0]!.lyric).toBe("");
    expect(s.notes[s.notes.length - 1]!.key).toBeNull();
    expect(s.notes[s.notes.length - 1]!.lyric).toBe("");
  });

  it("key=MIDI音高・lyric=モーラ・frame_length=拍換算（四分音符≒23フレーム）", () => {
    const s = notesToScore([{ pitch: 62, start: 0, dur: 1, syllable: "ら" }], bpm);
    const body = s.notes[1]!;
    expect(body.key).toBe(62);
    expect(body.lyric).toBe("ら");
    expect(body.frame_length).toBe(Math.round(0.5 * 93.75)); // =47? secPerBeat=0.5, 1拍=0.5秒*93.75=46.875→47
  });

  it("syllable 欠落は既定モーラ（ラ）でフォールバック", () => {
    const s = notesToScore([{ pitch: 60, start: 0, dur: 1 }], bpm);
    expect(s.notes[1]!.lyric).toBe("ラ");
  });

  it("メリスマ ー は lyric:'' で母音継続（key は保持）", () => {
    const s = notesToScore([{ pitch: 60, start: 0, dur: 1, syllable: "そ" }, { pitch: 60, start: 1, dur: 1, syllable: "ー" }], bpm);
    const melisma = s.notes[2]!;
    expect(melisma.key).toBe(60);
    expect(melisma.lyric).toBe("");
  });

  it("start の非連続（gap>0）に休符 note を挿入", () => {
    // 0-1拍に音符、2拍から次の音符＝1拍の gap
    const s = notesToScore([{ pitch: 60, start: 0, dur: 1, syllable: "あ" }, { pitch: 62, start: 2, dur: 1, syllable: "い" }], bpm);
    // [先頭休符, あ, gap休符, い, 末尾休符]
    expect(s.notes.map((n) => n.lyric)).toEqual(["", "あ", "", "い", ""]);
    expect(s.notes[2]!.key).toBeNull();
    expect(s.notes[2]!.frame_length).toBe(Math.round(0.5 * 93.75)); // 1拍ぶんの休符
  });

  it("バンド内（52-79）のメロは無変換＝shift 0・clamp 0で音高そのまま", () => {
    const s = notesToScore([{ pitch: 62, start: 0, dur: 1, syllable: "ら" }, { pitch: 79, start: 1, dur: 1, syllable: "ら" }], bpm);
    expect(s.shift).toBe(0);
    expect(s.clamped).toBe(0);
    expect(s.notes[1]!.key).toBe(62);
    expect(s.notes[2]!.key).toBe(79);
  });

  it("dur<=0 の音符は除外（破綻ノート）", () => {
    const s = notesToScore([{ pitch: 60, start: 0, dur: 0, syllable: "x" }, { pitch: 62, start: 0, dur: 1, syllable: "お" }], bpm);
    expect(s.notes.map((n) => n.lyric)).toEqual(["", "お", ""]);
  });

  it("scoreSeconds＝frame 総和/93.75", () => {
    const s = notesToScore([{ pitch: 60, start: 0, dur: 2, syllable: "な" }], bpm);
    const total = s.notes.reduce((a, n) => a + n.frame_length, 0);
    expect(scoreSeconds(s)).toBeCloseTo(total / 93.75, 5);
  });
});

// B2：音ごと折り返し（輪郭破壊）を廃止し、全体オクターブシフトでバンドに寄せる。輪郭＝隣接音程列は不変。
describe("chooseOctaveShift（全体オクターブシフト・純関数）", () => {
  it("バンド内(52-79)に全部収まっていればシフト0", () => {
    expect(chooseOctaveShift([62, 64, 67, 73, 79])).toBe(0);
  });
  it("高すぎるメロは下へシフト＝out最小の中で中央寄せ（タイなら中央）", () => {
    // 84-91 は高すぎ。-12(72-79)も-24(60-67)も全部バンド内＝out同数タイ。
    // タイは中央(65.5)寄せ＝-24(平均63.25)が -12(平均75.25)より中央に近い。
    expect(chooseOctaveShift([84, 86, 88, 91])).toBe(-24);
  });
  it("低すぎるメロは上へシフト＝out最小の中で中央寄せ", () => {
    // 40-47 は低すぎ。+24(64-71)が中央に最も近い（+12=52-59より中央寄り）。
    expect(chooseOctaveShift([40, 43, 45, 47])).toBe(24);
  });
  it("空配列はシフト0", () => {
    expect(chooseOctaveShift([])).toBe(0);
  });
});

describe("notesToScore の音域処理（B2・輪郭保存）", () => {
  it("オーナー実検体（62-73）はバンド内＝shift 0・輪郭そのまま", () => {
    const src = [62, 65, 69, 73, 71, 67, 64, 62];
    const s = notesToScore(src.map((p, i) => ({ pitch: p, start: i, dur: 1, syllable: "ら" })), 92);
    expect(s.shift).toBe(0);
    expect(s.clamped).toBe(0);
    expect(s.notes.map((n) => n.key)).toEqual([null, ...src, null]);
  });

  it("高いメロ（74-85）は全体シフトで輪郭を保存（音ごと折りで輪郭を壊さない）", () => {
    const src = [74, 78, 81, 85, 83, 79, 76, 74]; // 85>79 で旧foldなら85だけ-12＝輪郭破壊
    const s = notesToScore(src.map((p, i) => ({ pitch: p, start: i, dur: 1, syllable: "ら" })), 120);
    expect(s.shift).toBe(-12); // -12で 62-73＝全部バンド内
    expect(s.clamped).toBe(0);
    // 隣接音程列（輪郭）は入力と完全一致
    expect(intervals(s.notes.map((n) => n.key))).toEqual(intervals(src));
  });

  it("バンド幅を超える極端に広いメロは、最良シフト後に外れ音だけクランプし clamped を返す", () => {
    // 40と84は4オクターブ差＝どのシフトでも片方が外れる。黙って変えずclampedで開示。
    const s = notesToScore([{ pitch: 40, start: 0, dur: 1, syllable: "あ" }, { pitch: 84, start: 1, dur: 1, syllable: "い" }], 120);
    expect(s.clamped).toBeGreaterThan(0);
    // クランプされた音もバンド内に収まる
    for (const n of s.notes) if (n.key != null) expect(n.key).toBeGreaterThanOrEqual(52), expect(n.key).toBeLessThanOrEqual(79);
  });
});

// #13c 句頭子音カウントイン：先頭休符をテンポ非依存の時間床（SING_LEAD_REST_SEC）付きに。
// 母音頭の手前に置かれる子音（VOICEVOX 実測）が速いテンポで先頭休符から溢れないよう前余白を確保。
// 正典＝docs/research/2026-07-16-vocal-consonant-countin.md §3.4/§7 F1b。
describe("notesToScore の先頭休符 時間床（#13c カウントイン）", () => {
  const framesOf = (beats: number, spb: number) => Math.max(1, Math.round(beats * spb * FPS));

  it("速いテンポ（bpm=180）は床が勝つ＝round(0.18*93.75)=17（0.25拍換算の8より長い）", () => {
    const spb = 60 / 180; // = 1/3
    const s = notesToScore([{ pitch: 62, start: 0, dur: 1, syllable: "ら" }], 180);
    const floorFrames = Math.round(SING_LEAD_REST_SEC * FPS); // 17
    expect(floorFrames).toBe(17);
    expect(s.notes[0]!.frame_length).toBe(floorFrames); // 床が勝つ
    expect(s.notes[0]!.frame_length).toBeGreaterThan(framesOf(0.25, spb)); // 0.25拍(=8)より長い
  });

  it("遅いテンポ（bpm=60）は 0.25拍が勝つ＝round(0.25*93.75)=23（床17より長い）", () => {
    const spb = 60 / 60; // = 1
    const s = notesToScore([{ pitch: 62, start: 0, dur: 1, syllable: "ら" }], 60);
    expect(s.notes[0]!.frame_length).toBe(framesOf(0.25, spb)); // =23＝0.25拍が勝つ（従来式）
    expect(s.notes[0]!.frame_length).toBeGreaterThan(Math.round(SING_LEAD_REST_SEC * FPS)); // 床17より長い
  });

  it("末尾休符は据え置き（床を掛けない）＝先頭とは別長になり得る（bpm=180）", () => {
    const spb = 60 / 180;
    const s = notesToScore([{ pitch: 62, start: 0, dur: 1, syllable: "ら" }], 180);
    const last = s.notes[s.notes.length - 1]!;
    expect(last.key).toBeNull();
    expect(last.frame_length).toBe(framesOf(0.25, spb)); // 末尾は 0.25拍のまま（=8）
    expect(last.frame_length).not.toBe(s.notes[0]!.frame_length); // 先頭(17・床)とは別
  });

  it("leadRestSec（=先頭休符frame/FPS）＝再生側カウントイン量の SSOT（bpm=180 で ≒0.18s）", () => {
    const s = notesToScore([{ pitch: 62, start: 0, dur: 1, syllable: "ら" }], 180);
    const leadRestSec = s.notes[0]!.frame_length / FPS;
    expect(leadRestSec).toBeCloseTo(17 / FPS, 5); // ≒0.1813s
  });

  it("床で先頭休符 frame が変われば singHash も別キー＝旧 wav を再利用しない", () => {
    const s = notesToScore([{ pitch: 62, start: 0, dur: 1, syllable: "ら" }], 180); // 床適用（先頭17）
    // 旧挙動（床なし・0.25拍=8）を模した score との hash 差＝別キー（=再レンダ）。
    const old = { ...s, notes: [{ ...s.notes[0]!, frame_length: 8 }, ...s.notes.slice(1)] };
    expect(singHashOf(s, 3009)).not.toBe(singHashOf(old, 3009));
  });
});

// ── バグ修正（仮歌 Section 通し再生）＝TDD 赤3本（C 重複音 / B 句内ドリフト / A オクターブ分割） ──
// 正典＝Fable 承認スペック（2026-07-17）。C→B→A の順で実装。既定 undefined/0＝bit一致が家訓。

describe("C. 重複音の単声正規化（monophonic 化・wav 膨張の根治）", () => {
  const bpm = 120; // spb=0.5
  it("部分オーバーラップ [0,2)+[1,3) → 前音の dur を次音 start でクリップ＝本体フレーム合計 = round(2·spb·FPS)", () => {
    // 旧: cursor 直列詰めで [0,2) dur=2 と [1,1] を後ろへ→本体が 2拍+1拍=3拍ぶんに膨張（隣の子へはみ出す）。
    const s = notesToScore([
      { pitch: 60, start: 0, dur: 2, syllable: "あ" },
      { pitch: 62, start: 1, dur: 1, syllable: "い" },
    ], bpm);
    const spb = 60 / bpm;
    const total = bodyFrames(s).reduce((a, b) => a + b, 0);
    expect(total).toBe(Math.round(2 * spb * FPS)); // 2拍ぶん（0→2）＝膨張しない
  });
  it("同拍（同 start）複数音 → 最上声（最高 pitch）1音だけ採用＝note 数1", () => {
    const s = notesToScore([
      { pitch: 60, start: 0, dur: 1, syllable: "し" },
      { pitch: 67, start: 0, dur: 1, syllable: "た" }, // 同拍・最高音
      { pitch: 64, start: 0, dur: 1, syllable: "う" },
    ], bpm);
    const body = s.notes.slice(1, -1); // 先頭/末尾休符を除く
    expect(body.length).toBe(1); // 1音だけ
    expect(body[0]!.key).toBe(67); // 最上声
  });
});

describe("B. フレーム丸め句内ドリフト（絶対拍グリッド量子化）", () => {
  it("♩=132 の8分×16音：各音の累積フレーム位置（先頭休符除く）= round(k·0.5·spb·FPS) と完全一致", () => {
    const bpm = 132;
    const spb = 60 / bpm;
    const src = Array.from({ length: 16 }, (_, k) => ({ pitch: 62, start: k * 0.5, dur: 0.5, syllable: "ら" }));
    const s = notesToScore(src, bpm);
    // 本体（連続 8分＝gap 休符なし）の累積フレーム位置＝各音のオンセット位置。
    const frames = bodyFrames(s);
    let acc = 0;
    for (let k = 0; k < 16; k++) {
      expect(acc).toBe(Math.round(k * 0.5 * spb * FPS)); // オンセット位置＝絶対拍グリッド
      acc += frames[k]!;
    }
  });
});

describe("A. オクターブ独立正規化（ensemblePitches＝forcedShift で分割前後の輪郭を固定）", () => {
  it("1本メロを前半/後半に割り forcedShift=全体shift で歌わせると shift 一致・境界音程は真の音程", () => {
    const src = [72, 74, 76, 79, 81, 83, 84, 86]; // 後半はバンド上限超＝独立だと別シフトになる
    const first = src.slice(0, 4);
    const second = src.slice(4);
    const shift = chooseOctaveShift(src); // 全体（ensemble）で決めた唯一のシフト（=-12）
    const sFirst = notesToScore(first.map((p, i) => ({ pitch: p, start: i, dur: 1, syllable: "ら" })), 120, { forcedShift: shift });
    const sSecond = notesToScore(second.map((p, i) => ({ pitch: p, start: i, dur: 1, syllable: "ら" })), 120, { forcedShift: shift });
    expect(sFirst.shift).toBe(sSecond.shift); // 分割前後で同一シフト（＝境界で k×12 が割れない）
    // 境界音程＝真の音程（79→81 = +2）。独立正規化だと -10 に跳ぶ（輪郭破壊）。
    const lastFirst = sFirst.notes.filter((n) => n.key != null).slice(-1)[0]!.key!;
    const firstSecond = sSecond.notes.filter((n) => n.key != null)[0]!.key!;
    expect(firstSecond - lastFirst).toBe(2);
  });
  it("forcedShift=undefined は現状の chooseOctaveShift＝bit一致（単一子＝ensemble==自分で回帰ゼロ）", () => {
    const src = [{ pitch: 84, start: 0, dur: 1, syllable: "ら" }, { pitch: 86, start: 1, dur: 1, syllable: "ら" }];
    const plain = notesToScore(src, 120);
    const forced = notesToScore(src, 120, { forcedShift: chooseOctaveShift(src.map((n) => n.pitch)) });
    expect(JSON.stringify(forced.notes)).toBe(JSON.stringify(plain.notes)); // score が一致＝singHash も一致
    expect(forced.shift).toBe(plain.shift);
  });
});

describe("resolveSingBpm（B1・tempo は neta のDB列が正準）", () => {
  it("n.tempo（DB列）を第一候補にする", () => {
    expect(resolveSingBpm({ tempo: 92, content: { tempo: 140, bpm: 100 } })).toBe(92);
  });
  it("n.tempo が null なら content.tempo → content.bpm の順にフォールバック", () => {
    expect(resolveSingBpm({ tempo: null, content: { tempo: 140 } })).toBe(140);
    expect(resolveSingBpm({ tempo: null, content: { bpm: 100 } })).toBe(100);
  });
  it("どこにも無ければ 120", () => {
    expect(resolveSingBpm({ tempo: null, content: {} })).toBe(120);
    expect(resolveSingBpm({ content: undefined })).toBe(120);
  });
});
