import { useEffect, useRef, useState } from "react";
import { api, type Neta } from "./api";
import { buildPlayback, type PlaybackHandle } from "./music";
import { startPlayback } from "./playback";
import type { Lane } from "./components/sectionLanes";
import { contextAuditionPlan, type ContextAuditionCtx } from "./contextAudition";
import type { PickerState } from "./components/PlacePicker";

// SectionEditor の配置ピッカー（空セルタップ→ネタを選んで置く）の状態＋ハンドラをまとめたフック
// （Task#2 機械分割＝挙動不変）。ダイアログ描画は既存 PlacePicker コンポーネントが担い、当フックは
// state（picker/絞り込み/おすすめ）と openPicker/placeAt/createInLane/previewNeta を提供する。

export type PlacePickerCtx = {
  neta: Neta;
  keyPc: number;
  tempo: number;
  liveMeter?: string;
  occupiedAt: (lane: Lane, position: number) => boolean;
  overlapsOtherInLane: (lane: Lane, childId: string, pos: number, dur: number) => boolean;
  contentDur: (kind: string, content: unknown) => number;
  sectionProjects: string[];
  progForKind: (kind: string) => number | undefined;
  reload: () => Promise<void>;
  onChanged?: () => void;
  onOpenNeta?: (n: Neta) => void;
  // compose 辺操作の CoW ガード実行子（S3-a）。共有 section への配置を「全部/この曲だけ(分家)/やめる」で守る。
  // 未指定＝従来どおり原本へ直接配置（FormStrip の song 経路・bit-safe）。返り false＝やめる（何も置かない）。
  runEdgeOp?: (op: (targetId: string) => Promise<void>) => Promise<boolean>;
  // 文脈試聴（Task #5 入口一本化）：いまのセクション（ライブの調/拍子/尺/ミュート込み）と子配置を返す。
  // 渡されたとき（SectionEditor）だけ▶が「そのセルに置いた状態のセクション全体をループ」になる。
  // 未指定（FormStrip＝曲に section を置くピッカー）＝従来のワンショット。
  auditionSection?: () => ContextAuditionCtx | null;
};

// ライブラリの型（scope:"library"）をピッカーに並べるレーンの kind（design「実装の細部（2026-09-16）」）。
export const LIBRARY_PATTERN_KINDS: readonly string[] = ["chord_pattern", "bass", "rhythm"];

export function usePlacePicker(ctx: PlacePickerCtx) {
  const { neta, keyPc, tempo, liveMeter } = ctx;
  const [picker, setPicker] = useState<PickerState | null>(null);
  const [pq, setPq] = useState(""); // ピッカーの絞り込み
  const [pickerRecs, setPickerRecs] = useState<Neta[]>([]); // #20 おすすめ（コーパス）＝拍子/調で数件
  // ピッカーの母集団を器で絞る（A）＝どのプロジェクトのネタから選ぶか（""=自作すべて）。
  const [pickerSource, setPickerSource] = useState<string>("");
  const [pickerOtherMeter, setPickerOtherMeter] = useState(false); // 拍子違いも出すか（既定=一致のみ・B）
  const previewPlay = useRef<PlaybackHandle | null>(null); // ピッカー項目の試聴（配置前に耳で確認）
  const [pickerLib, setPickerLib] = useState<Neta[]>([]); // ライブラリの型（パターン系レーンのみ）
  // いま鳴らしている項目（▶⇄■）。inContext＝主旋律と一緒のループ試聴か。
  const [previewing, setPreviewing] = useState<{ id: string; inContext: boolean } | null>(null);

  async function openPicker(lane: Lane, position: number) {
    if (ctx.occupiedAt(lane, position)) return; // 既に埋まってる所には置かせない（CV3・占有セルのみ）
    // 自作ネタのみ取得（コーパス=libraryは直接選ばせない＝推薦経由・Phase2/#20）。
    const all = await api.listNeta({ scope: "project", limit: 2000 });
    // ライブラリの口はこのピッカーの一本（2026-08-02 夕裁定）＝パターン系レーンは同 kind の型の棚も並べる。
    const libKinds = lane.kinds.filter((k) => LIBRARY_PATTERN_KINDS.includes(k));
    const lib = (
      await Promise.all(libKinds.map((kind) => api.listNeta({ kind, scope: "library", limit: 500 }).catch(() => [] as Neta[])))
    ).flat();
    setPickerLib(lib);
    setPq("");
    setPickerSource(ctx.sectionProjects[0] ?? ""); // 既定＝この曲の器
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
    // 尺のはみ出し重複を防ぐ＝置くネタが同レーンの別ネタと重なるなら配置しない（点判定 occupiedAt の穴埋め・読み取りのみ＝ガード前でよい）。
    if (ctx.overlapsOtherInLane(picker.lane, child.id, picker.position, ctx.contentDur(child.kind, child.content))) {
      setPicker(null);
      return;
    }
    const ord = picker.lane.row ?? 0; // ② コード楽器レーンは行を ord に。他は 0。
    const position = picker.position;
    // コピー→配置を1操作に＝CoW「やめる」で孤児コピーを作らない。ガード時は分家 targetId へ置く（原本無傷）。
    const op = async (targetId: string) => {
      // ライブラリ項目は project にコピーしてから配置（元コーパスを汚さない・編集はコピー側）。
      const target = child.scope === "library" ? await api.copyNeta(child.id) : child;
      // 置く＝1小節ぶんだけ（小節別に別パターンを置ける）。繰り返したい時は右端ドラッグ(③)で。
      await api.placeChild(targetId, target.id, position, ord);
    };
    try {
      if (ctx.runEdgeOp) {
        const ok = await ctx.runEdgeOp(op);
        if (!ok) { setPicker(null); return; } // やめる＝何も置かない
      } else {
        await op(neta.id);
      }
    } catch {
      // section ネストで循環になる配置は core が拒否（400）→ そっと無視（配置しない）
      setPicker(null);
      return;
    }
    setPicker(null);
    await ctx.reload();
    ctx.onChanged?.();
  }
  // ピッカーの「＋新規作成」：このレーンの kind で空ネタを作って配置→そのまま編集を開く。
  async function createInLane() {
    if (!picker) return;
    const kinds = picker.lane.kinds;
    const kind = kinds.includes("chord_progression") ? "chord_progression" : kinds[0]!;
    const position = picker.position;
    const row = picker.lane.row ?? 0;
    // 作成→配置を1操作に＝CoW「やめる」で孤児ネタを作らない。分家選択時は分家へ置く。
    let created: Neta | null = null;
    const op = async (targetId: string) => {
      // 作る部品に section のライブ拍子を刻む＝単体編集でも6/8で表示される（評価バグ②）。
      created = await api.createNeta({ kind, title: pq.trim() || undefined, meter: liveMeter });
      await api.placeChild(targetId, created.id, position, row).catch(() => {});
    };
    if (ctx.runEdgeOp) {
      const ok = await ctx.runEdgeOp(op);
      if (!ok) { setPicker(null); return; } // やめる＝作らない・置かない
    } else {
      await op(neta.id);
    }
    setPicker(null);
    await ctx.reload();
    ctx.onChanged?.();
    if (created) ctx.onOpenNeta?.(created); // 作ったらすぐ中身を描けるよう編集へ
  }
  // ピッカー項目の試聴＝配置前に耳で確認（相対bass/コード楽器は section の調で解決して鳴らす）。
  async function previewNeta(n: Neta) {
    previewPlay.current?.stop();
    previewPlay.current = null;
    if (previewing?.id === n.id) {
      setPreviewing(null); // ■＝同じ項目をもう一度押したら止めるだけ
      return;
    }
    // 文脈試聴：そのセル（レーン行・位置）に置いた状態のセクション全体をループ（主旋律と一緒）。
    const sec = picker ? ctx.auditionSection?.() : null;
    if (sec && picker) {
      const { plan, loop } = contextAuditionPlan(sec, { neta: n, position: picker.position, ord: picker.lane.row ?? 0 });
      setPreviewing({ id: n.id, inContext: true });
      if (plan.notes.length) previewPlay.current = await startPlayback(plan, { vocalMode: "peek", loop });
      return;
    }
    // #27：解決層＋駆動層（peek＝待たない）。相対bass/コード楽器は section の調(n.key??keyPc)で解決。program は
    // ピッカーの progForKind で上書き（音色は配置先レーン基準）。feel/compound の欠落も buildPlayback で直る。
    const plan = buildPlayback({ kind: "neta", neta: { kind: n.kind, content: n.content, key: n.key ?? keyPc, mode: n.mode, tempo, meter: n.meter } });
    setPreviewing({ id: n.id, inContext: false });
    if (plan.notes.length) previewPlay.current = await startPlayback({ ...plan, program: ctx.progForKind(n.kind) }, { vocalMode: "peek" });
  }
  // ピッカーを閉じたら試聴を止める（鳴りっぱなし防止）。
  useEffect(() => {
    if (!picker) {
      previewPlay.current?.stop();
      setPreviewing(null);
    }
  }, [picker]);
  useEffect(() => () => previewPlay.current?.stop(), []);

  return {
    picker, setPicker,
    pq, setPq,
    pickerSource, setPickerSource,
    pickerOtherMeter, setPickerOtherMeter,
    pickerRecs,
    pickerLib,
    previewing,
    openPicker, placeAt, createInLane, previewNeta,
  };
}
