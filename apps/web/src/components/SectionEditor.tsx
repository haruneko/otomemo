import { useCallback, useEffect, useRef, useState } from "react";
import { api, type Neta } from "../api";
import { KIND_LABEL } from "../kinds";
import { fitReportText } from "../fitReport";
import { isProjectTag, projectName } from "../project";
import { useTransport } from "../useTransport";
import { TransportBar } from "./TransportBar";
import {
  notesForContent,
  compositeNotes,
  downloadMidi,
  downloadMultitrackMidi,
  playNotes,
  beatsPerBar,
  type Note,
  type PlaybackHandle,
} from "../music";
import { MiniRoll } from "./MiniRoll";
import { Icon } from "./Icon";
import { harmonyVoice } from "../harmony";
import { useDismiss } from "../useDismiss";
// 巨大コンポの機械分割（負債D6）＝挙動不変。レーン定義/尺定数/純関数/LaneCell/SongStatus/PlacePicker を分離。
import { LaneCell } from "./LaneCell";
import { SongStatus } from "./SongStatus";
import { PlacePicker } from "./PlacePicker";
import {
  type Lane,
  type Child,
  lanesForKind,
  maxBarsForKind,
  MIN_BARS,
  LANE_MIDI_NAME,
  loopPositions,
  spanOverlaps,
} from "./sectionLanes";
// テストが従来 SectionEditor から import している純関数は再export して import 面を不変に保つ。
export { loopPositions, spanOverlaps } from "./sectionLanes";

export function SectionEditor({
  neta,
  keyPc,
  tempo,
  meter,
  reloadSignal,
  onChanged,
  onOpenNeta,
  title,
}: {
  neta: Neta;
  keyPc: number;
  tempo: number;
  meter?: string; // 編集中ライブ反映用（未指定は neta.meter）
  title?: string; // 編集中ライブタイトル（未指定は neta.title・App activeがstaleな新規曲対策）
  reloadSignal?: number; // 外部(D&D配置)からの再読込トリガ
  onChanged?: () => void;
  onOpenNeta?: (n: Neta) => void; // ブロックタップ→子ネタを編集画面で開く（潜る）
}) {
  const [children, setChildren] = useState<Child[]>([]);
  const [loadErr, setLoadErr] = useState(false); // getComposition 失敗時＝空白で固まらず再試行を出す（perf耳FB 2026-07-09）
  const [picker, setPicker] = useState<{ lane: Lane; position: number; all: Neta[] } | null>(null);
  // ③ 右端ドラッグでループ伸ばし中のプレビュー（fromPos〜endBeat をゴースト表示）。
  const [drag, setDrag] = useState<{ childId: string; laneKey: string; fromPos: number; unit: number; endBeat: number } | null>(null);
  const [pq, setPq] = useState(""); // ピッカーの絞り込み
  const [pickerRecs, setPickerRecs] = useState<Neta[]>([]); // #20 おすすめ（コーパス）＝拍子/調で数件
  // ピッカーの母集団を器で絞る（A）＝どのプロジェクトのネタから選ぶか（""=自作すべて）。
  const [pickerSource, setPickerSource] = useState<string>("");
  const [pickerOtherMeter, setPickerOtherMeter] = useState(false); // 拍子違いも出すか（既定=一致のみ・B）
  const [eraseMode, setEraseMode] = useState(false); // 消しゴムモード＝ブロックtapで外す（PianoRollの描く/選ぶと同じモード流儀）
  const [toolsOpen, setToolsOpen] = useState(false); // いじる▾ メニュー（生成/ハモリ/書き出しを集約・メロ編集画面と整合・⑤）
  const toolsRef = useRef<HTMLDivElement>(null);
  useDismiss(toolsRef, toolsOpen, useCallback(() => setToolsOpen(false), [])); // 外タップ/Escで閉じる
  const [knobHelp, setKnobHelp] = useState(false); // ？で各つまみの一行説明を一括展開（スマホはホバー説明が出ない・耳FB 2026-07-09）
  const previewPlay = useRef<PlaybackHandle | null>(null); // ピッカー項目の試聴（配置前に耳で確認）
  // #5 container kind でレーン/尺を差し替え（song=section を並べる編成・section=パート専用）。
  const isSong = neta.kind === "song";
  const LANES = lanesForKind(neta.kind);
  const MAX_BARS = maxBarsForKind(neta.kind);
  // ②文脈系：この進行に◯を生成（section のコード＋frame から候補→試聴→レーンに置く）。
  const [cand, setCand] = useState<{ kind: string; content: unknown } | null>(null);
  const [genBusy, setGenBusy] = useState(false);
  const [density, setDensity] = useState(0.5); // メロの細かさ 0=疎〜1=細かい（耳FB 2026-07-08）
  const [swing, setSwing] = useState(0); // メロの跳ね 0=ストレート〜1=シャッフル
  const [expression, setExpression] = useState(0); // メロの表情 0=素直〜1=もたれ(強拍に倚音/掛留)（Step1 2026-07-09）
  const [phrasing, setPhrasing] = useState<"" | "symmetric" | "asymmetric">(""); // 句割り 空=従来/対称(問い→答え)/非対称(3+3+2の呼吸)（Step2/P0-b 2026-07-09）
  const [runs, setRuns] = useState(0); // メロの走句 0=なし〜1=16分連続が出やすい（Step4 2026-07-09）
  const [push, setPush] = useState(0); // メロの前借り(食い) 0=なし〜1=1,2,3拍を16分前へ（Step4 2026-07-09）
  const [foreground, setForeground] = useState(0); // 前景の自由度 0=反復中心〜1=自由材料(同音/跳躍)多め（Step5 2026-07-09）
  const [breathe, setBreathe] = useState(0); // 句頭の遅延入場(息継ぎ) 0=なし〜1=各句頭を空けて入る（#9 2026-07-09）
  const [humanize, setHumanize] = useState(0); // 人間味(グルーヴ) 0=機械的〜1=強弱＋微小タイミング揺れ（監査E 2026-07-09）
  const [form, setForm] = useState<"" | "sentence">(""); // 形式 空=従来AABA/文=sentence(提示→反復→継続断片化→カデンツ=起承転結)（D本丸 2026-07-09）
  // 対位（メロがベースを見て並行5度8度/b9を避ける）＝固定0.3自動送信を廃し UI で選択（2026-07-10・menu整理）。
  // 空=OFF（未送信＝従来bit一致）／weak0.2・mid0.4・strong0.7（推奨帯0.2-0.4＋強め）。bassレーン非在時は disabled。
  const [counter, setCounter] = useState<"" | "weak" | "mid" | "strong">("");
  const [detailsOpen, setDetailsOpen] = useState(false); // メロノブの詳細段（progressive disclosure）＝既定は畳む（ノブの壁の解消）
  const candPlay = useRef<PlaybackHandle | null>(null);
  const lastPartRef = useRef<{ op: string; needsChords: boolean; label: string } | null>(null);
  // ライブの拍子（編集中の meter prop 優先。App の active(=neta prop) は stale なことがあるので neta.meter は使わない）。
  const liveMeter = meter ?? neta.meter ?? undefined;
  const liveTitle = (title ?? neta.title ?? "").trim(); // 生成/作成/MIDI名に使うライブタイトル
  // 絞り込み/相性(拍子・調)の純ロジックは PlacePicker 側に内包（機械分割・負債D6）。
  const BPB = beatsPerBar(liveMeter); // 1小節の拍数（#51・編集中はprop優先）
  // セクション尺（小節数）＝可変（評価修正A）。ユーザー設定(secBars=neta.bars)と配置済みcontentの長い方、上限MAX_BARS。
  const [secBars, setSecBars] = useState(() => Math.max(MIN_BARS, neta.bars ?? MIN_BARS));
  const contentEnd = children.length ? Math.max(0, ...children.map((c) => c.position + childDur(c))) : 0;
  const BARS = Math.min(MAX_BARS, Math.max(secBars, Math.ceil(contentEnd / BPB - 1e-6)));
  const TOTAL = BARS * BPB;
  // 小節が多い時だけトラックに最小幅を与えて横スクロール（セルが潰れないように・8小節までは従来どおり伸縮）。
  const trackStyle = BARS > 10 ? { minWidth: `${BARS * 34}px` } : undefined;
  async function setSectionBars(n: number) {
    const b = Math.max(MIN_BARS, Math.min(MAX_BARS, n));
    setSecBars(b);
    await api.updateNeta(neta.id, { bars: b }).catch(() => {});
    onChanged?.();
  }
  // #49/#58/#59 トランスポート。合成結果を再生／プレイヘッドは TOTAL(グリッド全体)尺・拍子BPB。
  const tp = useTransport(() => composite(), tempo, { scaleBeats: TOTAL, bpb: BPB });

  // Space=合成再生/一時停止（design #59）。入力中は無効。
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.code !== "Space") return;
      const t = e.target as HTMLElement;
      if (t.closest?.('input, textarea, select, button, a, [contenteditable="true"]')) return;
      e.preventDefault();
      tp.playPause();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [tp.playPause]);

  const load = useCallback(async () => {
    try {
      setLoadErr(false);
      const tree = await api.getComposition(neta.id);
      setChildren(tree.children);
    } catch {
      setLoadErr(true); // 取得失敗＝白画面で固まらせず、下の再試行バーで復帰できる
    }
  }, [neta.id]);
  useEffect(() => {
    void load();
  }, [load, reloadSignal]);

  const inLane = (lane: Lane, kind: string) => (lane.kinds as readonly string[]).includes(kind);
  const laneOf = (kind: string) => LANES.find((l) => inLane(l, kind));
  // ② コード楽器の行＝ord（1→2レーン目、それ以外→1レーン目）。row 付きレーンはこの行で絞る。
  const rowOf = (c: Child) => (c.ord === 1 ? 1 : 0);
  const laneChildren = (lane: Lane) =>
    children.filter((c) => inLane(lane, c.node.neta.kind) && (lane.row === undefined || rowOf(c) === lane.row));
  const others = children.filter((c) => !laneOf(c.node.neta.kind));

  function childDur(c: Child): number {
    const k = c.node.neta.kind;
    // ネストした section/song＝中身の実長（子を再帰で畳む）＝1小節固定でなく本当の尺（評価修正A）。
    if (k === "section" || k === "song") {
      const kids = c.node.children ?? [];
      return kids.length ? Math.max(...kids.map((kc) => kc.position + childDur(kc))) : BPB;
    }
    const ns = notesForContent(k, c.node.neta.content);
    return ns.length ? Math.max(...ns.map((n) => n.start + n.dur)) : BPB;
  }

  // #5 song の section/song ブロック概形＝中身を合成した notes（ドラムは音域を乱すので除く）。
  // 単体パート(メロ/ベース等)は MiniRoll が content から描くので undefined（従来通り）。
  function blockPreviewNotes(c: Child): Note[] | undefined {
    const k = c.node.neta.kind;
    if (k !== "section" && k !== "song") return undefined;
    return compositeNotes(c.node.children ?? [], c.node.neta.key ?? keyPc, c.node.neta.mode).filter((n) => !n.drum);
  }

  // その位置が既にブロックで埋まっているか（レーン全体でなく**占有セルだけ**不可＝別小節には置ける）。
  const occupiedAt = (lane: Lane, position: number) =>
    laneChildren(lane).some((c) => c.position <= position + 1e-6 && position < c.position + childDur(c) - 1e-6);
  // 置くネタ自体の尺（leaf は実音の長さ・未知は1小節）。配置/ループの尺重複ガードに使う。
  const contentDur = (kind: string, content: unknown): number => {
    if (kind === "section" || kind === "song") return BPB; // ネストは picker では稀・保守的に1小節扱い
    const ns = notesForContent(kind, content);
    return ns.length ? Math.max(...ns.map((n) => n.start + n.dur)) : BPB;
  };
  // 同レーンの「別ネタ」と尺(スパン)が重なるか＝点判定 occupiedAt の穴(はみ出し重複)を塞ぐ。
  const overlapsOtherInLane = (lane: Lane, childId: string, pos: number, dur: number) =>
    laneChildren(lane).some((c) => c.node.neta.id !== childId && spanOverlaps(pos, dur, c.position, childDur(c)));
  // この曲(section)が属する器＝母集団の既定ソース（A）。無ければ「自作すべて」。
  const sectionProjects = (neta.tags ?? []).filter(isProjectTag).map(projectName);
  async function openPicker(lane: Lane, position: number) {
    if (occupiedAt(lane, position)) return; // 既に埋まってる所には置かせない（CV3・占有セルのみ）
    // 自作ネタのみ取得（コーパス=libraryは直接選ばせない＝推薦経由・Phase2/#20）。
    const all = await api.listNeta({ scope: "project", limit: 2000 });
    setPq("");
    setPickerSource(sectionProjects[0] ?? ""); // 既定＝この曲の器
    setPickerOtherMeter(false);
    setPicker({ lane, position, all });
  }
  // #20 レーンに対応するコーパス種別（推薦できるのは melody / chord_progression のみ）。
  const corpusKindFor = (lane: Lane): string | null =>
    (lane.kinds as readonly string[]).includes("melody")
      ? "melody"
      : (lane.kinds as readonly string[]).includes("chord_progression")
        ? "chord_progression"
        : null;
  // ピッカーを開く/種別タブを変えるたび、拍子・調に合うコーパスを数件だけ取得（生リストは出さない）。
  useEffect(() => {
    const ck = picker ? corpusKindFor(picker.lane) : null;
    if (!ck) {
      setPickerRecs([]);
      return;
    }
    let live = true;
    void api
      .recommend(ck, { meter: liveMeter, key: keyPc, top: 6 })
      .then((r) => live && setPickerRecs(r))
      .catch(() => live && setPickerRecs([]));
    return () => {
      live = false;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [picker?.lane.key, !!picker, liveMeter, keyPc]);
  async function placeAt(child: Neta) {
    if (!picker) return;
    try {
      // ライブラリ項目は project にコピーしてから配置（元コーパスを汚さない・編集はコピー側）。
      const target = child.scope === "library" ? await api.copyNeta(child.id) : child;
      const ord = picker.lane.row ?? 0; // ② コード楽器レーンは行を ord に。他は 0。
      // 尺のはみ出し重複を防ぐ＝置くネタが同レーンの別ネタと重なるなら配置しない（点判定 occupiedAt の穴埋め）。
      if (overlapsOtherInLane(picker.lane, target.id, picker.position, contentDur(target.kind, target.content))) {
        setPicker(null);
        return;
      }
      // 置く＝1小節ぶんだけ（小節別に別パターンを置ける）。繰り返したい時は右端ドラッグ(③)で。
      // ※旧・自動末尾充填は撤去＝別リズムを小節別に置くと重なって ABBBBB になる問題の元だった。
      await api.placeChild(neta.id, target.id, picker.position, ord);
    } catch {
      // section ネストで循環になる配置は core が拒否（400）→ そっと無視（配置しない）
      setPicker(null);
      return;
    }
    setPicker(null);
    await load();
    onChanged?.();
  }
  async function remove(childId: string, position?: number) {
    await api.removeChild(neta.id, childId, position);
    await load();
    onChanged?.();
  }
  // ピッカー項目の試聴＝配置前に耳で確認（相対bass/コード楽器は section の調で解決して鳴らす）。
  async function previewNeta(n: Neta) {
    previewPlay.current?.stop();
    const notes = notesForContent(n.kind, n.content, { key: n.key ?? keyPc });
    if (notes.length) previewPlay.current = await playNotes(notes, tempo, { program: progForKind(n.kind) });
  }
  // ピッカーを閉じたら試聴を止める（鳴りっぱなし防止）。
  useEffect(() => {
    if (!picker) previewPlay.current?.stop();
  }, [picker]);
  useEffect(() => () => previewPlay.current?.stop(), []);

  // ブロック操作＝消しゴム中は tap で外す／通常は tap で子ネタを編集（潜る）。右端グリップ(③伸ばし)は別。
  // 「モードで tap の意味が変わる」＝PianoRoll の描く/選ぶと同じ流儀（紛らわしい長押し=外すは撤去）。
  function onBlockClick(e: React.MouseEvent, c: Child) {
    e.stopPropagation();
    if (eraseMode) {
      void remove(c.node.neta.id, c.position); // 消しゴム：tap 一発で外す
      return;
    }
    onOpenNeta?.(c.node.neta); // 通常：tap＝子ネタを編集画面で開く（潜る）
  }
  // ピッカーの「＋新規作成」：このレーンの kind で空ネタを作って配置→そのまま編集を開く
  //（探して無ければ作る導線）。コード進行は chord_progression を既定に。
  async function createInLane() {
    if (!picker) return;
    const kinds = picker.lane.kinds;
    const kind = kinds.includes("chord_progression") ? "chord_progression" : kinds[0]!;
    // 作る部品に section のライブ拍子を刻む＝単体編集でも6/8で表示される（評価バグ②）。
    const created = await api.createNeta({ kind, title: pq.trim() || undefined, meter: liveMeter });
    await api.placeChild(neta.id, created.id, picker.position, picker.lane.row ?? 0).catch(() => {});
    setPicker(null);
    await load();
    onChanged?.();
    onOpenNeta?.(created); // 作ったらすぐ中身を描けるよう編集へ
  }

  // ③ 右端ドラッグでループ伸ばし＝同じ子を小節境界のループ単位でタイル反復配置（compose_edge は
  // PKに position を含み反復配置可・#54＝スキーマ不要）。縮めたらこの子の反復だけ末尾から外す。
  function beatFromClientX(clientX: number, trackEl: HTMLElement): number {
    const r = trackEl.getBoundingClientRect();
    const ratio = Math.min(1, Math.max(0, (clientX - r.left) / r.width));
    return ratio * TOTAL;
  }
  function onGripDown(e: React.PointerEvent, c: Child, lane: Lane) {
    e.stopPropagation(); // ブロック本体の onClick(=外す) を抑止
    e.preventDefault();
    const trackEl = (e.currentTarget as HTMLElement).closest(".lane-track") as HTMLElement | null;
    if (!trackEl) return;
    const unit = Math.max(BPB, Math.ceil(childDur(c) / BPB) * BPB); // ループ単位＝小節境界に丸めた子の尺
    const clamp = (x: number) => Math.max(c.position + unit, Math.min(TOTAL, beatFromClientX(x, trackEl)));
    const move = (ev: PointerEvent) =>
      setDrag({ childId: c.node.neta.id, laneKey: lane.key, fromPos: c.position, unit, endBeat: clamp(ev.clientX) });
    const up = (ev: PointerEvent) => {
      window.removeEventListener("pointermove", move);
      window.removeEventListener("pointerup", up);
      const end = clamp(ev.clientX);
      setDrag(null);
      void applyLoop(c, lane, unit, end);
    };
    window.addEventListener("pointermove", move);
    window.addEventListener("pointerup", up);
  }
  async function applyLoop(c: Child, lane: Lane, unit: number, endBeat: number) {
    const childId = c.node.neta.id;
    const near = (a: number, b: number) => Math.abs(a - b) < 1e-6;
    // 反復させたい位置（元ブロック fromPos は据え置き、以降 unit 刻み・グリッド内・各ループが収まる範囲）。
    const wanted = loopPositions(c.position, unit, endBeat, TOTAL);
    const existing = laneChildren(lane)
      .filter((x) => x.node.neta.id === childId && x.position > c.position + 1e-6)
      .map((x) => x.position);
    // 追加：wanted で未配置かつ他ブロックに占有されてない所へ（同じ ord=行を維持）。
    for (const p of wanted) {
      if (existing.some((e) => near(e, p))) continue;
      if (occupiedAt(lane, p)) continue;
      if (overlapsOtherInLane(lane, childId, p, childDur(c))) continue; // 別ネタと尺が重なる位置には置かない（はみ出し重複防止）
      await api.placeChild(neta.id, childId, p, c.ord).catch(() => {});
    }
    // 削除：縮めた分＝existing で wanted に無いこの子の反復だけ外す（他の子や元ブロックは触らない）。
    for (const e of existing) {
      if (!wanted.some((p) => near(p, e))) await api.removeChild(neta.id, childId, e).catch(() => {});
    }
    await load();
    onChanged?.();
  }

  // ②文脈系：この進行にメロ。section のコード進行を1本に連結（各コード子を小節位置ぶんオフセット）。
  function sectionChords() {
    const chordLane = LANES.find((l) => l.key === "chord")!;
    const out: { root?: number; quality?: string; start?: number; dur?: number }[] = [];
    for (const c of laneChildren(chordLane)) {
      const content = c.node.neta.content as { chords?: typeof out } | null;
      const offset = (c.position ?? 0) * BPB;
      for (const ch of content?.chords ?? []) out.push({ ...ch, start: (ch.start ?? 0) + offset });
    }
    return out.sort((a, b) => (a.start ?? 0) - (b.start ?? 0));
  }
  // ベースレーンの notes を1本に連結（sectionChords と同じ流儀＝子を小節位置ぶんオフセット）。
  // メロ生成の対位入力（design「gen_melody×ベース結線」）。相対 bass はコードレーンに当てて実音化。
  function sectionBass(): Note[] {
    const bassLane = LANES.find((l) => l.key === "bass")!;
    const chords = sectionChords().map((c) => ({ root: c.root ?? 0, quality: c.quality ?? "", start: c.start ?? 0, dur: c.dur ?? BPB }));
    const out: Note[] = [];
    for (const c of laneChildren(bassLane)) {
      const offset = (c.position ?? 0) * BPB;
      for (const n of notesForContent("bass", c.node.neta.content, { key: keyPc, chords })) out.push({ ...n, start: n.start + offset });
    }
    return out.sort((a, b) => a.start - b.start);
  }
  // リズム(ドラム)レーンの子を1本の step グリッドへマージ（design「gen_melody×ドラム結線」）。
  // content 形＝genDrums 出力 {rhythm:{steps,beatsPerStep,lanes}}。子ごとに hits を配置位置(拍÷beatsPerStep)ぶん
  // オフセットし、レーン(midi|name)単位で合算（位置＝拍解釈は compositeNotes と同じ）。beatsPerStep が先頭子と
  // 異なる子・不正 content は捨てる（防御）。レーンが空なら null＝gen_melody へ渡さない＝従来。
  function sectionDrums(): { rhythm: { steps: number; bars: number; beatsPerStep: number; lanes: { name?: string; midi?: number; hits: number[]; vel?: number }[] } } | null {
    type DrumRhythm = { steps?: number; bars?: number; beatsPerStep?: number; lanes?: { name?: string; midi?: number; hits?: number[]; vel?: number }[] };
    const lane = LANES.find((l) => l.key === "rhythm");
    if (!lane) return null;
    let bps = 0;
    let endStep = 0;
    const merged = new Map<string, { name?: string; midi?: number; hits: Set<number>; vel?: number }>();
    for (const c of laneChildren(lane)) {
      const r = (c.node.neta.content as { rhythm?: DrumRhythm } | null)?.rhythm;
      if (!r || !Array.isArray(r.lanes) || !r.steps || !r.beatsPerStep || r.steps <= 0 || r.beatsPerStep <= 0) continue;
      if (!bps) bps = r.beatsPerStep;
      if (Math.abs(r.beatsPerStep - bps) > 1e-9) continue; // グリッド解像度が混在＝合算不能な子は捨てる
      const off = Math.round((c.position ?? 0) / bps); // 配置位置(拍)→step オフセット
      for (const l of r.lanes) {
        const key = `${l.midi ?? ""}|${l.name ?? ""}`;
        const m = merged.get(key) ?? merged.set(key, { name: l.name, midi: l.midi, hits: new Set(), vel: l.vel }).get(key)!;
        for (const h of l.hits ?? []) if (Number.isInteger(h) && h >= 0 && h < r.steps) m.hits.add(off + h);
      }
      endStep = Math.max(endStep, off + r.steps);
    }
    if (!bps || !endStep || !merged.size) return null;
    return {
      rhythm: {
        steps: endStep,
        bars: Math.max(1, Math.round((endStep * bps) / BPB)),
        beatsPerStep: bps,
        lanes: [...merged.values()].map((l) => ({ name: l.name, midi: l.midi, hits: [...l.hits].sort((a, b) => a - b), vel: l.vel })),
      },
    };
  }
  // 生成パーツ（この進行に◯）。メロ/ベースはコードが要る、ドラムは frame だけ。
  const GEN_PARTS = [
    { label: "メロ", op: "gen_melody", needsChords: true },
    { label: "ベース", op: "gen_bass", needsChords: true },
    { label: "ドラム", op: "gen_drums", needsChords: false },
  ] as const;
  const progForKind = (kind: string) => (kind === "bass" ? 33 : kind === "rhythm" ? undefined : 0);
  async function genPart(part: { op: string; needsChords: boolean; label: string }) {
    if (genBusy) return;
    lastPartRef.current = part;
    const chords = sectionChords();
    if (part.needsChords && !chords.length) return;
    setGenBusy(true);
    try {
      // 2026-07-08 耳FB：section の mode を宣言（短調でメジャー生成＝濁りの主因）。メロは density/swing ノブも渡す。
      const secMode: "major" | "minor" = (neta.mode ?? "").toLowerCase().includes("min") ? "minor" : "major";
      // セクション役割（2026-07-10・design#12-M）：Section ネタ tags の `role:` を frame.section.role へ（無ければ渡さない＝従来）。
      // 役割別プリセット（サビ=高音域+高密度 等）が API 側で効く。不正 role は normalizeFrame が黙って落とす。ロール入力 UI は後続。
      const roleTag = (neta.tags ?? []).find((t) => t.startsWith("role:"))?.slice(5);
      const frame: Record<string, unknown> = { key: keyPc, meter: liveMeter, tempo, bars: BARS, mode: secMode };
      if (roleTag) frame.section = { role: roleTag };
      const body: Record<string, unknown> = {
        frame,
        chords,
        seed: Math.floor(Math.random() * 1e6), // 押すたび別案
      };
      if (part.op === "gen_melody") {
        body.density = density; body.swing = swing; body.expression = expression; body.runs = runs; body.push = push; body.foreground = foreground; body.breathe = breathe; body.humanize = humanize; if (phrasing) body.phrasing = phrasing; if (form) body.form = form;
        // 対位バイアス（design「gen_melody×ベース結線」）：UI の「対位」を ON にした時だけ bass を渡し counter を送る。
        // 既定 OFF（未送信）＝従来 bit一致（旧・bass 在れば固定0.3 の自動送信は既定挙動を無言で変えていたので廃止）。
        const bass = sectionBass();
        const counterVal = counter === "weak" ? 0.2 : counter === "mid" ? 0.4 : counter === "strong" ? 0.7 : 0;
        if (counterVal > 0 && bass.length) { body.bass = bass; body.counter = counterVal; }
        // ドラム結線（design「gen_melody×ドラム結線」）：リズムレーンがあれば step 列を渡し backbeat=0.3（推奨＝B のみ弱く）。
        // drumLock/converse は 0＝耳較正待ち（渡さない）。レーン無し＝渡さない＝従来どおり。UI ノブ露出は後続タスク。
        const drums = sectionDrums();
        if (drums) { body.drums = drums; body.backbeat = 0.3; }
      }
      const r = await api.music<{ items: { kind: string; content: unknown }[] }>(part.op, body);
      const item = r.items?.[0];
      if (item) setCand({ kind: item.kind, content: item.content });
    } finally {
      setGenBusy(false);
    }
  }
  // メロレーンの（最初の）メロ notes＝ハモリ/fit の入力。
  function melodyLaneNotes(): Note[] {
    const ml = LANES.find((l) => l.key === "melody")!;
    const c = laneChildren(ml)[0];
    return c ? notesForContent("melody", c.node.neta.content) : [];
  }
  const isMinor = (neta.mode ?? "").toLowerCase().includes("min");
  // ハモリ（上/下＝並行第2声部・調内平行3度・決定的）。候補→メロレーンに置く（原メロと重なって鳴る）。
  function makeHarmony(degSteps: number) {
    const mel = melodyLaneNotes();
    if (!mel.length) return;
    lastPartRef.current = null; // 決定的＝別案なし
    setCand({ kind: "melody", content: { notes: harmonyVoice(mel, keyPc, isMinor, degSteps) } });
  }
  // コードに合わせる（fit_to_chords）：メロの各音を近いコードトーンへ寄せた候補。
  async function fitToChords() {
    const mel = melodyLaneNotes();
    const chords = sectionChords();
    if (!mel.length || !chords.length || genBusy) return;
    setGenBusy(true);
    try {
      const r = await api.music<{ notes: Note[] }>("fit_to_chords", { melody: mel, chords, key: keyPc });
      lastPartRef.current = null;
      if (r.notes?.length) setCand({ kind: "melody", content: { notes: r.notes } });
    } finally {
      setGenBusy(false);
    }
  }
  // 噛み合い診断（analyze_fit・読むだけ）：メロ×コードの当てはまりを一言で。
  const [fitReport, setFitReport] = useState<string | null>(null);
  async function analyzeFit() {
    const mel = melodyLaneNotes();
    const chords = sectionChords();
    if (!mel.length || !chords.length) return;
    const r = await api.music<{ score: number; inChordRate: number; issues?: { msg: string }[] }>(
      "analyze_fit",
      { melody: mel, chords, key: keyPc },
    );
    setFitReport(fitReportText(r));
  }
  async function auditionCandidate() {
    candPlay.current?.stop();
    if (!cand) return;
    const ns = notesForContent(cand.kind, cand.content);
    if (ns.length) candPlay.current = await playNotes(ns, tempo, { program: progForKind(cand.kind) });
  }
  async function placeCandidate() {
    if (!cand) return;
    candPlay.current?.stop();
    const lane = laneOf(cand.kind);
    const created = await api.createNeta({
      kind: cand.kind,
      title: `${liveTitle || "曲"} ${lane?.label ?? cand.kind}`,
      content: cand.content,
      key: keyPc,
      // 2026-07-08 耳FB：mode を宣言（placementLanding の前提）。旧: 未宣言でmajor既定→短調メロが配置で+3移調＝濁りの主因。
      mode: (neta.mode ?? "").toLowerCase().includes("min") ? "minor" : "major",
      tempo,
      meter: liveMeter,
      tags: neta.tags,
    });
    // 再生成メロ＝置換：同レーンで新メロ(位置0)と尺が重なる既存子を先に外す＝二重化を防ぐ
    // （placeAt は重なりを拒否するが、生成候補は「置く」＝差し替え意図なので拒否でなく既存を退ける）。
    if (lane) {
      const dur = contentDur(cand.kind, cand.content);
      for (const c of laneChildren(lane)) {
        if (spanOverlaps(0, dur, c.position, childDur(c))) await api.removeChild(neta.id, c.node.neta.id, c.position);
      }
    }
    await api.placeChild(neta.id, created.id, 0, lane?.row ?? 0);
    setCand(null);
    await load();
    onChanged?.();
  }
  function closeCandidate() {
    candPlay.current?.stop();
    setCand(null);
  }

  // 合成：子を section の調へ移調（rhythm除く）＋位置オフセット（共有: compositeNotes）
  function composite(): Note[] {
    return compositeNotes(children, keyPc, neta.mode);
  }
  // #55 多トラック書出：レーン(メロ/コード/ベース/リズム)別に1トラックずつ。空レーンは省く。
  function laneTracks() {
    return LANES.map((lane) => ({
      name: LANE_MIDI_NAME[lane.key] ?? lane.key, // ASCII＝DAWで文字化けしない（日本語ラベルは使わない）
      notes: compositeNotes(laneChildren(lane), keyPc, neta.mode),
      drum: lane.key === "rhythm",
    })).filter((t) => t.notes.length);
  }

  return (
    <div className="section-editor">
      {neta.kind === "song" && <SongStatus netaId={neta.id} />}
      {/* 道具は メロ編集画面に整合：[✎通常][⌫消しゴム] modes（左）… [✨いじる▾]（右）。
          生成/ハモリ/書き出しは全部 いじる メニューに集約＝バラ撒きボタンを畳んで薄く（②⑤）。 */}
      <div className="roll-toolbar section-toolbar">
        <div className="proll-modes" role="group" aria-label="section-mode">
          <button type="button" aria-label="mode-edit" title="通常（タップで編集）" className={!eraseMode ? "on" : ""} onClick={() => setEraseMode(false)}>
            <Icon name="edit" size={18} />
          </button>
          <button type="button" aria-label="mode-erase" title="消しゴム（タップで外す）" className={eraseMode ? "on" : ""} onClick={() => setEraseMode(true)}>
            <Icon name="eraser" size={18} />
          </button>
        </div>
        <span className="tb-divider" aria-hidden="true" />
        <div className="assign-wrap" ref={toolsRef}>
          <button
            type="button"
            className={"tb-tool tools-btn" + (toolsOpen ? " on" : "")}
            aria-label="tools"
            aria-expanded={toolsOpen}
            title="この進行をいじる（生成・ハモリ・書き出し）"
            onClick={() => setToolsOpen((v) => !v)}
          >
            <Icon name="wand" size={16} /> いじる ▾
          </button>
          {toolsOpen && (
            <div className="assign-menu to-right tools-menu" aria-label="tools-menu">
              {/* 生成/ハモリはパートを作る道具＝section 専用。song(編成)は書き出しのみ（#5）。 */}
              {!cand && !isSong && (
                <>
                  <div className="tools-sep">この進行に生成</div>
                  {GEN_PARTS.filter((part) => !part.needsChords || sectionChords().length > 0).map((part) => (
                    <button
                      key={part.op}
                      type="button"
                      className="tool-item"
                      aria-label={`gen-${part.op}`}
                      disabled={genBusy}
                      onClick={() => { setToolsOpen(false); void genPart(part); }}
                    >
                      {genBusy ? "生成中…" : part.label}
                    </button>
                  ))}
                  {/* メロの細かさ・跳ねノブ（耳FB 2026-07-08）＝ガチャの当たり幅を人が絞る。押す前に設定→メロ生成。 */}
                  {sectionChords().length > 0 && (
                    <div className="gen-knobs" onClick={(e) => e.stopPropagation()}>
                      {/* ？＝各つまみの一行説明を一括で開閉（スマホはtitleホバーが出ないため）。既定は畳んで薄く。 */}
                      <button
                        type="button"
                        className={"knob-help-toggle" + (knobHelp ? " on" : "")}
                        aria-label="knob-help-toggle"
                        aria-pressed={knobHelp}
                        onClick={() => setKnobHelp((v) => !v)}
                      >
                        {knobHelp ? "？ 説明を隠す" : "？ 各つまみの説明"}
                      </button>
                      <label className="knob-row" aria-label="density">
                        <span>細かさ</span>
                        <input type="range" min={0} max={1} step={0.1} value={density} onChange={(e) => setDensity(Number(e.target.value))} />
                        <span className="knob-val">{density < 0.34 ? "疎" : density > 0.66 ? "細" : "中"}</span>
                      </label>
                      {knobHelp && <small className="knob-help">音数（疎↔細かい）</small>}
                      <label className="knob-row" aria-label="swing">
                        <span>跳ね</span>
                        <input type="range" min={0} max={1} step={0.1} value={swing} onChange={(e) => setSwing(Number(e.target.value))} />
                        <span className="knob-val">{swing < 0.1 ? "—" : swing > 0.66 ? "強" : "跳"}</span>
                      </label>
                      {knobHelp && <small className="knob-help">リズムの跳ね（ストレート↔シャッフル）</small>}
                      <label className="knob-row" aria-label="expression">
                        <span>表情</span>
                        <input type="range" min={0} max={1} step={0.1} value={expression} onChange={(e) => setExpression(Number(e.target.value))} />
                        <span className="knob-val">{expression < 0.1 ? "素直" : expression > 0.66 ? "濃" : "もたれ"}</span>
                      </label>
                      {knobHelp && <small className="knob-help">強拍のタメ・もたれ（素直↔倚音や掛留）</small>}
                      <label className="knob-row" aria-label="runs">
                        <span>走句</span>
                        <input type="range" min={0} max={1} step={0.1} value={runs} onChange={(e) => setRuns(Number(e.target.value))} />
                        <span className="knob-val">{runs < 0.1 ? "—" : runs > 0.66 ? "多" : "走"}</span>
                      </label>
                      {knobHelp && <small className="knob-help">16分の走り（速い連なりの出やすさ）</small>}
                      {/* 詳細段（progressive disclosure）＝よく使う4つ(細かさ/跳ね/表情/走句)の下に畳む。既定は閉じてノブの壁を解消。 */}
                      <button
                        type="button"
                        className={"knob-details-toggle" + (detailsOpen ? " on" : "")}
                        aria-label="knob-details-toggle"
                        aria-expanded={detailsOpen}
                        onClick={() => setDetailsOpen((v) => !v)}
                      >
                        {detailsOpen ? "▾ 詳細を隠す" : "▸ 詳細"}
                      </button>
                      {detailsOpen && <>
                      <label className="knob-row" aria-label="push">
                        <span>食い</span>
                        <input type="range" min={0} max={1} step={0.1} value={push} onChange={(e) => setPush(Number(e.target.value))} />
                        <span className="knob-val">{push < 0.1 ? "—" : push > 0.66 ? "強" : "食"}</span>
                      </label>
                      {knobHelp && <small className="knob-help">拍を食うシンコペ（頭を少し前へ）</small>}
                      <label className="knob-row" aria-label="humanize">
                        <span>人間味</span>
                        <input type="range" min={0} max={1} step={0.1} value={humanize} onChange={(e) => setHumanize(Number(e.target.value))} />
                        <span className="knob-val">{humanize < 0.1 ? "—" : humanize > 0.66 ? "強" : "揺"}</span>
                      </label>
                      {knobHelp && <small className="knob-help">強弱と微妙なタイミング揺れ（機械的↔人間っぽく）</small>}
                      <label className="knob-row" aria-label="foreground">
                        <span>自由さ</span>
                        <input type="range" min={0} max={1} step={0.1} value={foreground} onChange={(e) => setForeground(Number(e.target.value))} />
                        <span className="knob-val">{foreground < 0.1 ? "反復" : foreground > 0.66 ? "自由" : "混"}</span>
                      </label>
                      {knobHelp && <small className="knob-help">反復↔冒険（跳んだ音・自由な材料を混ぜる）</small>}
                      <label className="knob-row" aria-label="breathe">
                        <span>入り遅れ</span>
                        <input type="range" min={0} max={1} step={0.1} value={breathe} onChange={(e) => setBreathe(Number(e.target.value))} />
                        <span className="knob-val">{breathe < 0.1 ? "—" : breathe > 0.66 ? "遅" : "息"}</span>
                      </label>
                      {knobHelp && <small className="knob-help">句アタマを少し遅らせる（息継ぎ感）</small>}
                      <label className="knob-row" aria-label="phrasing">
                        <span>句割り</span>
                        <select value={phrasing} onChange={(e) => setPhrasing(e.target.value as "" | "symmetric" | "asymmetric")}>
                          <option value="">従来</option>
                          <option value="symmetric">対称(問→答)</option>
                          <option value="asymmetric">非対称(3+3+2)</option>
                        </select>
                      </label>
                      {knobHelp && <small className="knob-help">フレーズの分け方（問い→答え／3+3+2の呼吸）</small>}
                      <label className="knob-row" aria-label="form">
                        <span>形式</span>
                        <select value={form} onChange={(e) => setForm(e.target.value as "" | "sentence")}>
                          <option value="">従来</option>
                          <option value="sentence">起承転結(文)</option>
                        </select>
                      </label>
                      {knobHelp && <small className="knob-help">曲の展開の型（提示→反復→畳み掛け→まとめ＝起承転結）</small>}
                      {/* 対位（メロがベースを見て並行完全音程/b9を避ける）＝要望②。bassレーンが無いと相手がいないので disabled。 */}
                      <label className="knob-row">
                        <span>対位</span>
                        <select aria-label="counter" value={counter} onChange={(e) => setCounter(e.target.value as "" | "weak" | "mid" | "strong")} disabled={sectionBass().length === 0} title={sectionBass().length === 0 ? "ベースレーンが必要です" : "ベースに対して反行/斜行し並行を避ける"}>
                          <option value="">OFF</option>
                          <option value="weak">弱</option>
                          <option value="mid">中</option>
                          <option value="strong">強</option>
                        </select>
                      </label>
                      {knobHelp && <small className="knob-help">ベースを見て並行5度/8度を避ける（要ベースレーン・弱0.2/中0.4/強0.7）</small>}
                      </>}
                    </div>
                  )}
                  {melodyLaneNotes().length > 0 && (
                    <>
                      <div className="tools-sep">メロ加工</div>
                      <button type="button" className="tool-item" aria-label="harmony-up" title="調内で平行3度上の第2声部" onClick={() => { setToolsOpen(false); makeHarmony(2); }}>上ハモ</button>
                      <button type="button" className="tool-item" aria-label="harmony-down" title="調内で平行3度下の第2声部" onClick={() => { setToolsOpen(false); makeHarmony(-2); }}>下ハモ</button>
                      {sectionChords().length > 0 && (
                        <>
                          <button type="button" className="tool-item" aria-label="fit-to-chords" title="メロの各音を近いコードトーンへ寄せる" disabled={genBusy} onClick={() => { setToolsOpen(false); void fitToChords(); }}>コードに合わせる</button>
                          <button type="button" className="tool-item" aria-label="analyze-fit" title="メロとコードの噛み合いを診断（読むだけ）" onClick={() => { setToolsOpen(false); void analyzeFit(); }}>噛み合い診断</button>
                        </>
                      )}
                    </>
                  )}
                </>
              )}
              <div className="tools-sep">書き出し</div>
              <button type="button" className="tool-item" aria-label="export-midi" onClick={() => { setToolsOpen(false); downloadMidi(composite(), `${liveTitle || "section"}.mid`, tempo, liveMeter ?? null); }}>MIDI</button>
              <button type="button" className="tool-item" aria-label="export-midi-split" title="メロ/コード/ベース/リズムを別トラックに" onClick={() => { setToolsOpen(false); downloadMultitrackMidi(laneTracks(), `${liveTitle || "section"}-tracks.mid`, tempo, liveMeter ?? null); }}>MIDI（分割）</button>
            </div>
          )}
        </div>
      </div>
      {loadErr && (
        <p className="fit-report" aria-label="load-error" onClick={() => void load()}>
          読み込みに失敗しました <span className="muted">（タップで再試行）</span>
        </p>
      )}
      {fitReport && (
        <p className="fit-report" aria-label="fit-report" onClick={() => setFitReport(null)}>
          {fitReport} <span className="muted">（タップで消す）</span>
        </p>
      )}

      {cand && (
        <div
          className="reshape-bar"
          aria-label="part-candidate"
          style={{ ["--k" as string]: `var(--k-${cand.kind === "chord_progression" ? "chord" : cand.kind})` }}
        >
          <span className="reshape-label">{laneOf(cand.kind)?.label ?? cand.kind}候補（この進行に生成）</span>
          <button type="button" className="tb-tool" aria-label="audition-candidate" onClick={() => void auditionCandidate()}>
            ▶試聴
          </button>
          <button type="button" className="tb-tool" disabled={genBusy} onClick={() => lastPartRef.current && void genPart(lastPartRef.current)}>
            {genBusy ? "…" : "別案"}
          </button>
          <button type="button" className="tb-tool primary" aria-label="place-candidate" onClick={() => void placeCandidate()}>
            {laneOf(cand.kind)?.label ?? ""}レーンに置く
          </button>
          <button type="button" className="tb-tool" aria-label="close-candidate" onClick={closeCandidate}>
            閉じる
          </button>
        </div>
      )}

      {/* セクション尺（小節数）＝可変（評価修正A）。placed content より短くはできない（自動で伸びる）。 */}
      <div className="section-bars" aria-label="section-bars">
        <span className="muted">小節</span>
        <button type="button" aria-label="bars-dec" disabled={BARS <= MIN_BARS} onClick={() => void setSectionBars(BARS - 1)}>−</button>
        <span aria-label="bars-count">{BARS}</span>
        <button type="button" aria-label="bars-inc" disabled={BARS >= MAX_BARS} onClick={() => void setSectionBars(BARS + 1)}>＋</button>
      </div>
      <div className="lanes" aria-label="timeline" ref={tp.scrollerRef}>
        <div className="playhead" aria-hidden="true" ref={tp.lineRef} />
        <div className="lane-ruler">
          <div className="lane-label" />
          <div className="ruler-bars" style={trackStyle}>
            {Array.from({ length: BARS }, (_, b) => (
              <div key={b} className="bar-num">
                {b + 1}
              </div>
            ))}
          </div>
        </div>
        {LANES.map((lane) => (
          <div className="lane" key={lane.key}>
            <div className="lane-label">{lane.label}</div>
            <div className="lane-track" style={trackStyle}>
              {Array.from({ length: BARS }, (_, b) => (
                <LaneCell
                  key={b}
                  laneKey={lane.key}
                  kinds={lane.kinds}
                  bar={b}
                  position={b * BPB}
                  row={lane.row}
                  disabled={occupiedAt(lane, b * BPB)}
                  onTap={(pos) => void openPicker(lane, pos)}
                />
              ))}
              {laneChildren(lane).map((c) => (
                <button
                  key={`${c.node.neta.id}@${c.position}`}
                  type="button"
                  className={"lane-block" + (eraseMode ? " erasing" : "")}
                  data-kind={c.node.neta.kind}
                  aria-label={`block-${c.node.neta.id}@${c.position}`}
                  title={eraseMode ? "タップで外す" : `${c.node.neta.title ?? c.node.neta.text ?? ""} @${c.position}拍 — タップで編集`}
                  style={{
                    left: `${(c.position / TOTAL) * 100}%`,
                    width: `${(Math.min(childDur(c), TOTAL - c.position) / TOTAL) * 100}%`,
                  }}
                  onClick={(e) => onBlockClick(e, c)}
                >
                  <MiniRoll neta={c.node.neta} notes={blockPreviewNotes(c)} />
                  <span className="lane-block-label">
                    {c.node.neta.title ?? c.node.neta.text ?? KIND_LABEL[c.node.neta.kind] ?? c.node.neta.kind}
                  </span>
                  {/* ③ 右端グリップ＝ドラッグでループ伸ばし。消しゴム中は無効（誤操作防止）。 */}
                  {!eraseMode && (
                    <span
                      className="block-resize"
                      aria-label={`extend-${c.node.neta.id}@${c.position}`}
                      title="右へドラッグで繰り返し（ループ）"
                      onPointerDown={(e) => onGripDown(e, c, lane)}
                      onClick={(e) => e.stopPropagation()}
                    />
                  )}
                </button>
              ))}
              {drag &&
                drag.laneKey === lane.key &&
                (() => {
                  // ゴーストは「実際に確定するコピー」までスナップ＝見た目＝結果（中点を過ぎたぶんだけ伸びる）。
                  const ps = loopPositions(drag.fromPos, drag.unit, drag.endBeat, TOTAL);
                  const end = (ps.length ? Math.max(...ps) : drag.fromPos) + drag.unit; // 最後のコピー終端（無ければ元ブロック終端）
                  return (
                    <div
                      className="loop-ghost"
                      aria-hidden="true"
                      style={{
                        left: `${(drag.fromPos / TOTAL) * 100}%`,
                        width: `${((Math.min(end, TOTAL) - drag.fromPos) / TOTAL) * 100}%`,
                      }}
                    />
                  );
                })()}
            </div>
          </div>
        ))}
      </div>
      <p className="muted lanes-hint">
        空きをタップ→置く/新規作成／ブロックをタップで編集（⌫消しゴムでタップ＝外す）／右端ドラッグで繰り返し
      </p>

      {others.length > 0 && (
        <div className="section-others">
          <span className="muted">その他：</span>
          {others.map((c) => (
            <span key={`${c.node.neta.id}@${c.position}`} className="rel-item">
              {KIND_LABEL[c.node.neta.kind] ?? c.node.neta.kind} @{c.position}
              <button
                type="button"
                aria-label={`remove-${c.node.neta.id}@${c.position}`}
                onClick={() => void remove(c.node.neta.id, c.position)}
              >
                ✕
              </button>
            </span>
          ))}
        </div>
      )}

      {picker && (
        <PlacePicker
          picker={picker}
          neta={neta}
          liveTitle={liveTitle}
          BPB={BPB}
          keyPc={keyPc}
          pq={pq}
          setPq={setPq}
          pickerSource={pickerSource}
          setPickerSource={setPickerSource}
          pickerOtherMeter={pickerOtherMeter}
          setPickerOtherMeter={setPickerOtherMeter}
          pickerRecs={pickerRecs}
          placeAt={placeAt}
          previewNeta={previewNeta}
          createInLane={createInLane}
          onClose={() => setPicker(null)}
        />
      )}
      <TransportBar
        state={tp.state}
        loopOn={tp.loopOn}
        timeRef={tp.timeRef}
        onPlayPause={tp.playPause}
        onRewind={tp.rewind}
        onToggleLoop={tp.toggleLoop}
      />
    </div>
  );
}
