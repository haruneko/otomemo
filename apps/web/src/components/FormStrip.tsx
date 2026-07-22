import { useEffect, useMemo, useRef, useState, Fragment } from "react";
import {
  DndContext,
  PointerSensor,
  TouchSensor,
  closestCenter,
  useSensor,
  useSensors,
  type DragEndEvent,
} from "@dnd-kit/core";
import { arrayMove, SortableContext, verticalListSortingStrategy, useSortable } from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import { api, type Neta, type FormCandidate, type EnergyPlanLite } from "../api";
import { buildPlayback, type PlaybackHandle } from "../music";
import { startPlayback } from "../playback";
import { collapseRuns, cardsToEdges, reconcileEdges, resolveDurById, totalSpanBeats, roleOf, roleInfo, keyDiffLabel, sectionKeyBadge, timeAddress, mergeFormPlan, withRole, ROLE_KEYS, type StripCard, type Edge } from "../formStrip";
import { energyChips, transitionWindowNotes, type KeyApplication } from "../formPlan";
import { FormSuggest, type SuggestCard } from "./FormSuggest";
import { lanesForKind, type Child } from "./sectionLanes";
import { SectionSkyline } from "./MiniRoll";
import { SongStatus } from "./SongStatus";
import { PlacePicker } from "./PlacePicker";
import { usePlacePicker } from "../usePlacePicker";
import { Icon } from "./Icon";

// 曲フォーム＝縦セットリスト（design #28・正典 §4.2「モバイルは縦1列」への是正＝横カード帯を撤去）。
// song エディタの小節グリッド→**縦の全幅行リスト**（song kind 専用・section のグリッドは不変）。
// 各行＝役割チップ/タイトル/時間住所「8小節·1-8」/実キー名「F +5」/共有・分家バッジ（言葉）/レイヤ帯/⋯メニュー。
// 行間の全幅境界＝縫い目（♪つなぎ試聴＋精密挿入）。ヘッダに常時全体が見えるミニマップ。⋯シートで役割付与/分家/複製/削除＋取り消しトースト。
// 並べ替え(dnd-kit verticalListSortingStrategy)/挿入(PlacePicker)/削除/×N畳み/タップで潜る/今どこハイライト。
// position は**カード順からの前置和射影**で再計算＝compose_edge/position の契約は不変。ロジックは formStrip.ts の純関数へ。

const CURRENT_POLL_MS = 120; // 「今どこ」＝再生中に beatRef を低頻度ポーリング（毎フレーム setState しない）

// 表示単位＝×N カード（畳み時）or 展開した1配置。dnd の並べ替え/削除はこの単位で行い、childId 列へ展開して射影する。
type DisplayUnit = { id: string; childId: string; count: number; indices: number[]; expandKey: string };

export function FormStrip({
  neta,
  children,
  keyPc,
  tempo,
  mode,
  BPB,
  liveMeter,
  liveTitle,
  childDur,
  beatRef,
  playing,
  sectionProjects,
  reload,
  onChanged,
  onOpenNeta,
}: {
  neta: Neta;
  children: Child[];
  keyPc: number;
  tempo: number;
  mode: string | null | undefined;
  BPB: number;
  liveMeter?: string;
  liveTitle: string;
  childDur: (c: Child) => number;
  beatRef: { current: number };
  playing: boolean;
  sectionProjects: string[];
  reload: () => Promise<void>;
  onChanged?: () => void;
  onOpenNeta?: (n: Neta) => void;
}) {
  const sectionLane = lanesForKind("song")[0]!; // [section] レーン（挿入ピッカーの種別＝section 固定）
  const [expanded, setExpanded] = useState<Set<string>>(new Set()); // 展開中の ×N カード（expandKey）
  const [insertIndex, setInsertIndex] = useState(0); // 挿入位置（カード添字）＝ピッカー確定時に使う
  const [currentIdx, setCurrentIdx] = useState<number | null>(null); // 今どこ＝再生中カードの sorted 添字
  const [playFrac, setPlayFrac] = useState<number | null>(null); // ミニマップのプレイヘッド位置（0..1・再生中のみ）
  const [sheetFor, setSheetFor] = useState<string | null>(null); // ⋯ シートを開いている行の unit.id（役割/分家/複製/削除）
  const [rolePickFor, setRolePickFor] = useState<string | null>(null); // 役割を付ける（childId）＝シート内の役割リスト展開
  const [toast, setToast] = useState<{ label: string; undo: () => Promise<void> } | null>(null); // 取り消しトースト（分家/複製/削除）
  const toastTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 5 } }),
    useSensor(TouchSensor, { activationConstraint: { delay: 250, tolerance: 8 } }),
  );

  // position 昇順の子（＝カードの左→右順）。射影/表示の基準列。
  const sorted = useMemo(() => [...children].sort((a, b) => a.position - b.position), [children]);
  const sortedIds = useMemo(() => sorted.map((c) => c.node.neta.id), [sorted]);

  // 分家/共有バッジ（S2）：各セクション childId ごとに「共有(placementCount>=2)」「分家(variant_of を持つ)」を非同期に解決。
  // ※地雷：反復配置の node.children は空でも **node.neta 自体は各配置に載る**ので調バッジは node.neta.key で安全。
  //   共有/分家は配置ツリーに出ない情報なので childId 単位で placements/relations を引く（getComposition に頼らない）。
  const [badges, setBadges] = useState<Record<string, { shared: boolean; count: number; variant: boolean }>>({});
  const distinctIds = useMemo(() => [...new Set(sortedIds)], [sortedIds]);
  const distinctKey = distinctIds.join(",");
  useEffect(() => {
    let alive = true;
    void (async () => {
      const entries = await Promise.all(
        distinctIds.map(async (id) => {
          const [pl, rels] = await Promise.all([
            api.getPlacements(id).catch(() => ({ placementCount: 0 })),
            api.getRelations(id).catch(() => [] as { type: string }[]),
          ]);
          const count = pl.placementCount ?? 0;
          return [id, { shared: count >= 2, count, variant: rels.some((r) => r.type === "variant_of") }] as const;
        }),
      );
      if (alive) setBadges(Object.fromEntries(entries));
    })();
    return () => { alive = false; };
    // distinctKey で依存＝並び替え/挿入/削除/分家化のたび引き直す（reload が children を更新→ここへ波及）。
  }, [distinctKey]); // eslint-disable-line react-hooks/exhaustive-deps

  // ×N畳み → 表示単位。連続同一 child は畳み、展開中(expandKey ∈ expanded)なら個別カードに割る。
  const units: DisplayUnit[] = useMemo(() => {
    const runs = collapseRuns(sortedIds);
    return runs.flatMap((run) => {
      const expandKey = `${run.childId}__${run.indices[0]}`;
      if (run.count > 1 && expanded.has(expandKey)) {
        return run.indices.map((idx) => ({ id: `${run.childId}__${idx}`, childId: run.childId, count: 1, indices: [idx], expandKey }));
      }
      return [{ id: expandKey, childId: run.childId, count: run.count, indices: run.indices, expandKey }];
    });
  }, [sortedIds, expanded]);

  // 尺は childId 属性として1本に解決（反復配置の childDur 破損＝1小節フォールバックを他の無傷配置で上書き）。
  // これを position 射影の全経路（合計尺・applyOrder・insertSection）で使う＝反復以降が詰まる compose_edge 破損の根治。
  const durMap = useMemo(() => resolveDurById(sorted.map((c) => ({ childId: c.node.neta.id, dur: childDur(c) }))), [sorted, childDur]);
  const durOf = (childId: string): number => durMap.get(childId) ?? BPB;
  // 合計尺（bars×BPB÷tempo）。曲ヘッダに出す。×N反復を取りこぼさない（解決尺 durOf ＋ span 純関数）。
  const totalBeats = totalSpanBeats(sorted.map((c) => ({ childId: c.node.neta.id, position: c.position, dur: durOf(c.node.neta.id) })));
  const totalBars = BPB > 0 ? Math.round(totalBeats / BPB) : 0;
  const totalSec = tempo > 0 ? Math.round((totalBeats * 60) / tempo) : 0;
  // ミニマップ＝各配置を尺∝幅・役割色の帯で（常時全体が見える＝スカイラインの正しい生息地・#28）。sorted＝実タイムライン順。
  const miniSegs = sorted.map((c, i) => {
    const dur = durOf(c.node.neta.id);
    const ri = roleInfo(roleOf(c.node.neta.tags));
    return { key: `${c.node.neta.id}-${i}`, frac: totalBeats > 0 ? dur / totalBeats : 0, color: ri?.color };
  });

  // 「今どこ」＝再生中だけ beatRef を低頻度ポーリングし、現在拍を含む子の sorted 添字＋ミニマップのプレイヘッド位置(0..1)を state に落とす。
  useEffect(() => {
    if (!playing) { setCurrentIdx(null); setPlayFrac(null); return; }
    const timer = setInterval(() => {
      const beat = beatRef.current;
      const idx = sorted.findIndex((c) => c.position <= beat + 1e-6 && beat < c.position + childDur(c) - 1e-6);
      setCurrentIdx(idx >= 0 ? idx : null);
      setPlayFrac(totalBeats > 0 ? Math.min(1, Math.max(0, beat / totalBeats)) : null);
    }, CURRENT_POLL_MS);
    return () => clearInterval(timer);
  }, [playing, sorted, childDur, beatRef, totalBeats]);

  // ── 射影 normalize：desiredIds（この順の childId 列）→ place/remove を計算して適用（前置和射影）。
  // current＝最新の loaded children（挿入直後は fetch し直した新しい配列を渡す＝state の遅延反映に依存しない）。
  async function applyOrder(desiredIds: string[], current: Child[]) {
    // 尺は childId 属性として解決（反復2個目の childDur 破損に射影を汚染させない＝詰まり/重なりの根治）。
    const durs = resolveDurById(current.map((c) => ({ childId: c.node.neta.id, dur: childDur(c) })));
    const pool = new Map<string, Child[]>();
    for (const c of [...current].sort((a, b) => a.position - b.position)) {
      (pool.get(c.node.neta.id) ?? pool.set(c.node.neta.id, []).get(c.node.neta.id)!).push(c);
    }
    const cards: StripCard[] = [];
    for (const id of desiredIds) {
      const c = pool.get(id)?.shift();
      if (!c) continue; // 対応する配置が無い＝防御的にスキップ
      cards.push({ childId: id, dur: durs.get(id) ?? BPB, ord: c.ord, position: c.position });
    }
    const oldEdges: Edge[] = current.map((c) => ({ childId: c.node.neta.id, position: c.position, ord: c.ord }));
    const { place, remove } = reconcileEdges(oldEdges, cardsToEdges(cards));
    for (const e of remove) await api.removeChild(neta.id, e.childId, e.position).catch(() => {}); // 先に消す→PK衝突回避
    for (const e of place) await api.placeChild(neta.id, e.childId, e.position, e.ord).catch(() => {});
    await reload();
    onChanged?.();
  }

  const fetchChildren = async (): Promise<Child[]> => (await api.getComposition(neta.id).catch(() => null))?.children ?? [];

  // 並べ替え（dnd）＝表示単位を arrayMove→childId 列へ展開して射影。
  async function onDragEnd(e: DragEndEvent) {
    const { active, over } = e;
    if (!over || active.id === over.id) return;
    const from = units.findIndex((u) => u.id === active.id);
    const to = units.findIndex((u) => u.id === over.id);
    if (from < 0 || to < 0) return;
    const moved = arrayMove(units, from, to);
    const desired = moved.flatMap((u) => Array(u.count).fill(u.childId) as string[]);
    await applyOrder(desired, children);
  }

  // ── 取り消しトースト（#28）＝分家/複製/削除は無確認の即時実行のまま、直後にトーストで元に戻せる。
  // 辺スナップショット→ reconcile で正確に復元（作った分家/複製ネタは deleteNeta で掃除）＝軽量な「最後の1手」undo。
  const snapshotEdges = (): Edge[] => sorted.map((c) => ({ childId: c.node.neta.id, position: c.position, ord: c.ord }));
  async function restoreEdges(snapshot: Edge[], deleteNetaId?: string) {
    const cur = await fetchChildren();
    const curEdges: Edge[] = cur.map((c) => ({ childId: c.node.neta.id, position: c.position, ord: c.ord }));
    const { place, remove } = reconcileEdges(curEdges, snapshot);
    for (const e of remove) await api.removeChild(neta.id, e.childId, e.position).catch(() => {});
    for (const e of place) await api.placeChild(neta.id, e.childId, e.position, e.ord).catch(() => {});
    if (deleteNetaId) await api.deleteNeta(deleteNetaId).catch(() => {});
    await reload();
    onChanged?.();
  }
  const showToast = (label: string, undo: () => Promise<void>) => {
    if (toastTimer.current) clearTimeout(toastTimer.current);
    setToast({ label, undo });
    toastTimer.current = setTimeout(() => setToast(null), 7000); // 数秒で自然消滅（取り消しの窓）
  };
  useEffect(() => () => { if (toastTimer.current) clearTimeout(toastTimer.current); }, []);

  // 削除＝その表示単位の全配置を外す（×N は N 個まとめて＝1ブロックの削除・展開中は1個）。取り消しトースト付き。
  async function removeUnit(u: DisplayUnit) {
    const snap = snapshotEdges();
    const label = netaOf(u.childId)?.title ?? netaOf(u.childId)?.text ?? "セクション";
    const desired = units.filter((x) => x !== u).flatMap((x) => Array(x.count).fill(x.childId) as string[]);
    await applyOrder(desired, children);
    setSheetFor(null);
    showToast(`「${label}」を外しました`, () => restoreEdges(snap));
  }

  // 分家にする（S2・「同じものとして育てる」）＝**その配置1つだけ**を vary した新セクションに差し替え。
  // 転調ラスサビの入口＝サビの1配置を分家化して key+1 等を分家側で自由に。子ネタは参照共有（元サビを直せば効く）。
  // ×N（畳んだ反復）は先頭配置1つだけを分家（残りは元のまま）＝「ここから別物として育て始める」導線。取り消しトースト付き。
  async function branchUnit(u: DisplayUnit) {
    const c = sorted[u.indices[0]!]; // この childId の先頭配置（position/ord を維持して差し替え）
    if (!c) return;
    const snap = snapshotEdges();
    const branch = await api.vary(c.node.neta.id).catch(() => null);
    if (!branch) return;
    await api.removeChild(neta.id, c.node.neta.id, c.position).catch(() => {});
    await api.placeChild(neta.id, branch.id, c.position, c.ord).catch(() => {});
    await reload();
    onChanged?.();
    setSheetFor(null);
    showToast(`「${branch.title ?? "分家"}」を分家にしました`, () => restoreEdges(snap, branch.id));
  }

  // 複製する（#28・「別物にする＝完全に切り離す」）＝その配置1つだけを copyNeta した独立セクションへ差し替え（variant_of 無し）。
  // 分家（参照共有・系譜あり）とは別物＝元と縁を切って自由に育てる。取り消しトースト付き。
  async function duplicateUnit(u: DisplayUnit) {
    const c = sorted[u.indices[0]!];
    if (!c) return;
    const snap = snapshotEdges();
    const copy = await api.copyNeta(c.node.neta.id).catch(() => null);
    if (!copy) return;
    await api.removeChild(neta.id, c.node.neta.id, c.position).catch(() => {});
    await api.placeChild(neta.id, copy.id, c.position, c.ord).catch(() => {});
    await reload();
    onChanged?.();
    setSheetFor(null);
    showToast(`「${copy.title ?? "複製"}」を複製にしました`, () => restoreEdges(snap, copy.id));
  }

  // 役割を付ける（#28）＝配置済みセクションに役割タグを設定（色/ミニマップ/生成プリセット/key_plan の起点）。実体を直接更新＝全配置に効く。
  async function setUnitRole(childId: string, role: string | undefined) {
    const cur = netaOf(childId);
    await api.updateNeta(childId, { tags: withRole(cur?.tags, role) }).catch(() => {});
    setRolePickFor(null);
    setSheetFor(null);
    await reload();
    onChanged?.();
  }

  // ── つなぎ＝計画 verb の適用（S3-a）。候補の fetch/選択/確認は FormSuggest・実行はここ。 ──
  // suggest_form → **非破壊マージ**（#28 是正）：既存配置を全消しせず、候補の役割枠へ同役割の既存セクションを温存、
  // 空いた枠だけ空 section を新規作成。余った既存は末尾に温存＝作業中アレンジを失わない。position は前置和射影。
  // 新規足場は key を設定しない＝曲の key で再帰合成（compositeNotes の継承）・title＝役割ラベル（ROLE_INFO が SSOT）。
  async function applyFormCandidate(cand: FormCandidate) {
    // 既存＝distinct childId（出現順）＋その役割。×N は1枠として扱う。
    const seen = new Set<string>();
    const existing: { childId: string; role: string | undefined }[] = [];
    for (const u of units) {
      if (seen.has(u.childId)) continue;
      seen.add(u.childId);
      existing.push({ childId: u.childId, role: roleOf(netaOf(u.childId)?.tags) });
    }
    const plan = mergeFormPlan(existing, cand.sections);
    // 各アイテムを childId＋尺へ解決（new は空 section を作成）。
    const items: { childId: string; dur: number }[] = [];
    for (const item of plan) {
      if (item.kind === "existing") {
        items.push({ childId: item.childId, dur: durOf(item.childId) });
      } else {
        const created = await api
          .createNeta({ kind: "section", title: roleInfo(item.role)?.label ?? item.role, bars: item.bars, meter: liveMeter, tags: [`role:${item.role}`] })
          .catch(() => null);
        if (created) items.push({ childId: created.id, dur: item.bars > 0 ? item.bars * BPB : BPB });
      }
    }
    // 前置和射影→現辺と reconcile（既存は移動だけ・削除はしない＝ネタ温存）。
    const newEdges = cardsToEdges(items.map((it) => ({ childId: it.childId, dur: it.dur, ord: 0, position: -1 })));
    const cur = await fetchChildren();
    const oldEdges: Edge[] = cur.map((c) => ({ childId: c.node.neta.id, position: c.position, ord: c.ord }));
    const { place, remove } = reconcileEdges(oldEdges, newEdges);
    for (const e of remove) await api.removeChild(neta.id, e.childId, e.position).catch(() => {});
    for (const e of place) await api.placeChild(neta.id, e.childId, e.position, e.ord).catch(() => {});
    await reload();
    onChanged?.();
  }

  // suggest_key_plan → key/mode 適用（自動分家）：direct＝実体を直接更新（全配置に効く）／branch＝
  // vary→該当辺差し替え→分家へ key/mode（同ターゲットの複数配置は1分家を共有）。サマリで明示同意済み＝CoWは出さない。
  async function applyKeyApplication(app: KeyApplication) {
    for (const d of app.direct) await api.updateNeta(d.childId, { key: d.target.key, mode: d.target.mode }).catch(() => {});
    for (const b of app.branch) {
      const branch = await api.vary(b.childId).catch(() => null);
      if (!branch) continue;
      for (const idx of b.indices) {
        const c = sorted[idx];
        if (!c) continue;
        await api.removeChild(neta.id, b.childId, c.position).catch(() => {});
        await api.placeChild(neta.id, branch.id, c.position, c.ord).catch(() => {});
      }
      await api.updateNeta(branch.id, { key: b.target.key, mode: b.target.mode }).catch(() => {});
    }
    await reload();
    onChanged?.();
  }

  // suggest_energy_plan → Δチップ（揮発＝state のみ・永続しない＝「提案は揮発・確定は実体に落ちる」）。
  // sorted の index に整列（roles を position 順で渡しているため返りも同 index）。
  const [chips, setChips] = useState<string[] | null>(null);
  const applyEnergyPlan = (plan: EnergyPlanLite) => setChips(energyChips(plan.sections));
  // 並びが変わったら消す（index 整列が崩れた Δ を出し続けない＝揮発の一貫）。適用直後は並び不変＝消えない。
  const orderKey = sortedIds.join(",");
  const chipsOrderRef = useRef(orderKey);
  useEffect(() => {
    if (chipsOrderRef.current !== orderKey) {
      chipsOrderRef.current = orderKey;
      setChips(null);
    }
  }, [orderKey]);

  // FormSuggest へ渡す position 順カード（key 適用の振り分け＋サマリ表示用）。
  const suggestCards: SuggestCard[] = sorted.map((c) => ({
    childId: c.node.neta.id,
    key: c.node.neta.key,
    mode: c.node.neta.mode,
    title: c.node.neta.title ?? c.node.neta.text ?? "(無題)",
    role: roleOf(c.node.neta.tags),
  }));

  // ── 遷移試聴（縫い目E・S3-a）＝カード境界の前後2小節を composite の部分窓で連結再生（トグルで停止）。 ──
  const transPlay = useRef<PlaybackHandle | null>(null);
  const transTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const [transAt, setTransAt] = useState<number | null>(null); // 再生中の境界（units の表示 index）
  const stopTransition = () => {
    transPlay.current?.stop();
    transPlay.current = null;
    if (transTimer.current) { clearTimeout(transTimer.current); transTimer.current = null; }
  };
  async function toggleTransition(unitIdx: number, boundaryBeat: number) {
    const wasPlaying = transAt === unitIdx;
    stopTransition();
    setTransAt(null);
    if (wasPlaying) return; // トグル停止
    // 窓＝[境界-2小節, 境界+2小節)（曲頭尾はクリップ）。ノートは再生用合成（playbackComposite＝歌う子は sungBy+muted 済）
    // から切り出す。#27：窓切片の sungBy から窓専用 vocal job を再導出（{kind:"notes"} で再plan）→駆動層で ensure→再生
    // ＝**backlog「FormStrip つなぎ試聴が仮歌を通していない」の根治**（feel 欠落も構造の帰結として解消）。
    const win = transitionWindowNotes(buildPlayback({ kind: "tree", children, key: keyPc, mode, tempo, meter: liveMeter }).notes, boundaryBeat, 2 * BPB);
    if (!win.length) return;
    setTransAt(unitIdx);
    transPlay.current = await startPlayback(buildPlayback({ kind: "notes", notes: win, tempo }), { vocalMode: "ensure" });
    // 窓が鳴り終わったら表示を戻す（連結再生は1回きり＝ループしない）。
    const endBeat = Math.max(...win.map((n) => n.start + n.dur));
    transTimer.current = setTimeout(() => { setTransAt(null); transPlay.current = null; }, (endBeat * 60 * 1000) / Math.max(1, tempo) + 200);
  }
  useEffect(() => stopTransition, []); // unmount で鳴りっぱなしを防ぐ

  // 挿入＝まず末尾に置いて（タイ無し）尺を確定→desired 順（index に差し込み）で射影 normalize。
  async function insertSection(index: number, sectionId: string) {
    const before = await fetchChildren();
    const beforeIds = [...before].sort((a, b) => a.position - b.position).map((c) => c.node.neta.id);
    // 末尾位置＝解決尺で（反復配置の childDur 破損で total が過少になり、仮置きが既存カードへ重なるのを防ぐ）。
    const beforeDurs = resolveDurById(before.map((c) => ({ childId: c.node.neta.id, dur: childDur(c) })));
    const total = before.length ? Math.max(0, ...before.map((c) => c.position + (beforeDurs.get(c.node.neta.id) ?? BPB))) : 0;
    await api.placeChild(neta.id, sectionId, total, 0).catch(() => {}); // 末尾に仮置き（循環は 400＝catch）
    const after = await fetchChildren();
    if (!after.some((c) => c.node.neta.id === sectionId)) { await reload(); return; } // 置けなかった（循環等）
    const desired = [...beforeIds.slice(0, index), sectionId, ...beforeIds.slice(index)];
    await applyOrder(desired, after);
  }

  // 挿入ピッカー＝既存 usePlacePicker を流用（リスト取得/絞り込み/おすすめ/試聴）。ただし occupied ガードは
  // 射影方式では不要なので無効化し、配置（placeAt/新規作成）は insertSection に差し替える＝グリッド版の position 直置きに
  // 落とさない。section(非song)経路には一切触れない（この pk は FormStrip 専用インスタンス）。
  const pk = usePlacePicker({
    neta,
    keyPc,
    tempo,
    liveMeter,
    occupiedAt: () => false,
    overlapsOtherInLane: () => false,
    contentDur: () => BPB,
    sectionProjects,
    progForKind: () => undefined,
    reload,
    onChanged,
    onOpenNeta,
  });
  const openInsert = (index: number) => { setInsertIndex(index); void pk.openPicker(sectionLane, index * BPB); };
  const placeInsert = async (child: Neta) => {
    const target = child.scope === "library" ? await api.copyNeta(child.id) : child;
    pk.setPicker(null);
    await insertSection(insertIndex, target.id);
  };
  const createInsert = async () => {
    const created = await api.createNeta({ kind: "section", title: pk.pq.trim() || undefined, meter: liveMeter });
    pk.setPicker(null);
    await insertSection(insertIndex, created.id);
    onOpenNeta?.(created); // 作った空セクションはすぐ中身を組めるよう編集へ
  };

  const netaOf = (childId: string): Neta | undefined => sorted.find((c) => c.node.neta.id === childId)?.node.neta;
  const toggleExpand = (key: string) => setExpanded((s) => { const n = new Set(s); n.has(key) ? n.delete(key) : n.add(key); return n; });

  // 時間住所（#28）＝「8小節·1-8」。unit の先頭配置 position→開始小節、尺×count→占有小節。前置和射影の副産物。
  const unitAddress = (u: DisplayUnit): string => {
    const c0 = sorted[u.indices[0]!];
    const startBar = c0 && BPB > 0 ? Math.round(c0.position / BPB) + 1 : 1;
    const bars = (BPB > 0 ? Math.round(durOf(u.childId) / BPB) : 0) * u.count;
    return timeAddress(startBar, bars);
  };

  // ⋯ シート対象（役割/分家/複製/削除）。開いている行の unit と neta を解決。
  const sheetUnit = units.find((u) => u.id === sheetFor);
  const sheetNeta = sheetUnit ? netaOf(sheetUnit.childId) : undefined;
  const closeSheet = () => { setSheetFor(null); setRolePickFor(null); };

  return (
    <div className="form-strip" aria-label="form-strip">
      {/* 曲ヘッダ＝合計尺＋提案▾（S3-a）。key/tempo は上の設定行に一本化＝二重表示と 412px の 提案▾ 見切れを解消（#28）。 */}
      <div className="fs-header">
        <div className="fs-meta" aria-label="song-meta">
          <span className="fs-total">{totalBars}小節<small>≈{totalSec}秒</small></span>
          <FormSuggest
            keyPc={keyPc}
            mode={mode}
            tempo={tempo}
            liveMeter={liveMeter}
            cards={suggestCards}
            onApplyForm={applyFormCandidate}
            onApplyKeyPlan={applyKeyApplication}
            onApplyEnergy={applyEnergyPlan}
          />
        </div>
        {/* 段階/次の一手＝1行チップ（タップで編集シート）＝一等地を書く頻度に見合った密度へ（#28）。 */}
        <SongStatus netaId={neta.id} />
      </div>

      {/* ヘッダミニマップ（#28）＝常時全体が見える帯（幅∝尺・役割色・プレイヘッド）。12セクションでも1画面に収まり俯瞰が立つ。 */}
      {sorted.length > 0 && (
        <div className="fs-minimap" aria-label="form-minimap">
          <div className="fs-mm">
            {miniSegs.map((s) => (
              <span
                key={s.key}
                className="fs-seg"
                style={{ flexGrow: Math.max(s.frac, 0.002), ...(s.color ? { ["--rc" as string]: s.color } : {}) }}
              />
            ))}
            {playFrac != null && <span className="fs-ph" aria-hidden="true" style={{ left: `${playFrac * 100}%` }} />}
          </div>
        </div>
      )}

      {sorted.length === 0 ? (
        <p className="fs-empty muted">
          セクションを並べて曲にします。<button type="button" className="fs-insert-empty" aria-label="fs-insert-0" onClick={() => openInsert(0)}>＋ セクションを置く</button>
        </p>
      ) : (
        <DndContext sensors={sensors} collisionDetection={closestCenter} onDragEnd={(e) => void onDragEnd(e)}>
          <SortableContext items={units.map((u) => u.id)} strategy={verticalListSortingStrategy}>
            <div className="fs-list" aria-label="form-cards">
              {units.map((u, i) => (
                <Fragment key={u.id}>
                  {/* 縫い目＝行間の全幅境界（#28 で一級化）。♪つなぎ試聴（内側のみ）＋精密挿入＋。24px 隙間の押し込みを解消。 */}
                  <div className="fs-seam">
                    <span className="fs-seam-line" />
                    {i > 0 && (
                      <button
                        type="button"
                        className="fs-trans"
                        aria-label={`fs-trans-${i}`}
                        aria-pressed={transAt === i}
                        title="つなぎを試聴（前の末2小節＋次の頭2小節）"
                        onClick={() => void toggleTransition(i, sorted[u.indices[0]!]?.position ?? 0)}
                      >
                        {transAt === i ? "⏹ つなぎ" : "♪ つなぎ"}
                      </button>
                    )}
                    <button type="button" className="fs-insert" aria-label={`fs-insert-${i}`} title="ここにセクションを挿す" onClick={() => openInsert(i)}>＋</button>
                    <span className="fs-seam-line" />
                  </div>
                  <FormRow
                    unit={u}
                    neta={netaOf(u.childId)}
                    isCurrent={currentIdx != null && u.indices.includes(currentIdx)}
                    songKey={keyPc}
                    sharedCount={badges[u.childId]?.count ?? 0}
                    variant={badges[u.childId]?.variant ?? false}
                    energyChip={chips?.[u.indices[0]!]}
                    address={unitAddress(u)}
                    onOpen={() => { const n = netaOf(u.childId); if (n) onOpenNeta?.(n); }}
                    onOpenMenu={() => { setSheetFor(u.id); setRolePickFor(null); }}
                    onSetRole={() => { setSheetFor(u.id); setRolePickFor(u.childId); }}
                    onToggleExpand={() => toggleExpand(u.expandKey)}
                    expanded={expanded.has(u.expandKey)}
                  />
                </Fragment>
              ))}
              {/* 末尾の「続きを足す」＝主導線（常時見える文言ラベル・タッチで discoverable）。行間＋は精密挿入の従。 */}
              <button type="button" className="fs-insert-end" aria-label={`fs-insert-${units.length}`} title="末尾にセクションを足す" onClick={() => openInsert(sortedIds.length)}>＋ セクションを足す</button>
            </div>
          </SortableContext>
        </DndContext>
      )}

      {/* 行の ⋯ シート（#28）＝役割を付ける／分家にする／複製する／外す。正典文言「同じものとして育てる／別物にする」を選択の瞬間に。 */}
      {sheetUnit && (
        <>
          <div className="fs-sheet-backdrop" aria-hidden="true" onClick={closeSheet} />
          <div className="fs-sheet" role="dialog" aria-label="row-menu">
            <p className="fs-sheet-h">
              <b>{sheetNeta?.title ?? sheetNeta?.text ?? "(無題)"}</b>
              <span className="muted"> {sectionKeyBadge(sheetNeta?.key, sheetNeta?.mode, keyPc) ?? ""}</span>
              <button type="button" className="fs-sheet-x" aria-label="row-menu-close" onClick={closeSheet}>×</button>
            </p>
            {rolePickFor === sheetUnit.childId ? (
              <div className="fs-role-list" aria-label="role-list">
                <button type="button" className="fs-sheet-item" aria-label="role-set-none" onClick={() => void setUnitRole(sheetUnit.childId, undefined)}>役割なし</button>
                {ROLE_KEYS.map((r) => (
                  <button type="button" key={r} className="fs-sheet-item" aria-label={`role-set-${r}`} onClick={() => void setUnitRole(sheetUnit.childId, r)}>
                    {roleInfo(r)?.label ?? r}
                  </button>
                ))}
              </div>
            ) : (
              <div className="fs-sheet-acts">
                <button type="button" className="fs-sheet-item" aria-label={`row-role-${sheetUnit.childId}`} onClick={() => setRolePickFor(sheetUnit.childId)}>
                  役割を付ける <small className="muted">色・生成プリセット・key_plan の起点</small>
                </button>
                <button type="button" className="fs-sheet-item" aria-label={`fs-branch-${sheetUnit.childId}`} onClick={() => void branchUnit(sheetUnit)}>
                  分家にする <small className="muted">同じものとして育てる（転調ラスサビ・落ちサビ）</small>
                </button>
                <button type="button" className="fs-sheet-item" aria-label={`row-dup-${sheetUnit.childId}`} onClick={() => void duplicateUnit(sheetUnit)}>
                  複製する <small className="muted">別物にする（完全に切り離す）</small>
                </button>
                <button type="button" className="fs-sheet-item danger" aria-label={`fs-del-${sheetUnit.childId}`} onClick={() => void removeUnit(sheetUnit)}>
                  この配置を外す <small className="muted">ネタ自体は消えません</small>
                </button>
              </div>
            )}
          </div>
        </>
      )}

      {/* 取り消しトースト（#28）＝分家/複製/削除の直後に元へ戻す窓（数秒で自然消滅）。 */}
      {toast && (
        <div className="fs-toast" role="status" aria-label="undo-toast">
          <span>{toast.label}</span>
          <button
            type="button"
            className="fs-toast-undo"
            aria-label="undo-op"
            onClick={() => { const u = toast.undo; setToast(null); if (toastTimer.current) clearTimeout(toastTimer.current); void u(); }}
          >
            取り消す
          </button>
        </div>
      )}

      {pk.picker && (
        <PlacePicker
          picker={pk.picker}
          neta={neta}
          liveTitle={liveTitle}
          BPB={BPB}
          keyPc={keyPc}
          pq={pk.pq}
          setPq={pk.setPq}
          pickerSource={pk.pickerSource}
          setPickerSource={pk.setPickerSource}
          pickerOtherMeter={pk.pickerOtherMeter}
          setPickerOtherMeter={pk.setPickerOtherMeter}
          pickerRecs={pk.pickerRecs}
          placeAt={(n) => void placeInsert(n)}
          previewNeta={pk.previewNeta}
          createInLane={() => void createInsert()}
          onClose={() => pk.setPicker(null)}
        />
      )}
    </div>
  );
}

// 1行（#28 縦セットリスト）＝役割チップ／タイトル＋時間住所＋実キー名／共有・分家バッジ（言葉）／レイヤ帯／⋯メニュー。
// 全幅・役割色を左レール(--rc)に流す。dnd-kit sortable の1要素。タップ本体で潜る・⋯でシート・グリップで並べ替え。
function FormRow({
  unit,
  neta,
  isCurrent,
  songKey,
  sharedCount,
  variant,
  energyChip,
  address,
  onOpen,
  onOpenMenu,
  onSetRole,
  onToggleExpand,
  expanded,
}: {
  unit: DisplayUnit;
  neta: Neta | undefined;
  isCurrent: boolean;
  songKey: number;
  sharedCount: number; // 配置数（>=2 で「共有N」）
  variant: boolean; // variant_of を持つ＝分家
  energyChip?: string; // エナジーΔチップ（S3-a・揮発）
  address: string; // 時間住所「8小節·1-8」
  onOpen: () => void;
  onOpenMenu: () => void; // ⋯ シートを開く
  onSetRole: () => void; // 役割を付ける（シートの役割リストへ直行）
  onToggleExpand: () => void;
  expanded: boolean;
}) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({ id: unit.id });
  const style = { transform: CSS.Transform.toString(transform), transition, opacity: isDragging ? 0.5 : undefined };
  const role = roleOf(neta?.tags);
  const ri = roleInfo(role);
  const title = neta?.title ?? neta?.text ?? "(無題)";
  const keyChg = keyDiffLabel(neta?.key ?? null, songKey); // 曲と違う調のときだけ（同調/未設定は null）
  const keyBadge = keyChg ? sectionKeyBadge(neta?.key, neta?.mode, songKey) : null; // 「F +5」＝転調してるセクションだけ
  return (
    <div
      ref={setNodeRef}
      style={ri?.color ? { ...style, ["--rc" as string]: ri.color } : style}
      className="fs-row"
      data-current={isCurrent ? "" : undefined}
      aria-label={`form-card-${unit.childId}`}
    >
      <span className="fs-rail" aria-hidden="true" />
      <span className="fs-grip" aria-label={`drag-${unit.childId}`} title="ドラッグで並べ替え" {...attributes} {...listeners}><Icon name="grip" size={14} /></span>
      {ri ? (
        <span className="fs-role" aria-label={`role-${role}`}>{ri.label}</span>
      ) : (
        <button type="button" className="fs-role fs-role-none" aria-label={`role-set-${unit.childId}`} title="役割を付ける（色・生成の起点）" onClick={onSetRole}>役割</button>
      )}
      {/* 本体（潜る）＝タイトル＋時間住所。ネストボタンを避けるためバッジ/×N は兄弟クラスタへ（DOM 妥当性）。 */}
      <button type="button" className="fs-main" onClick={onOpen} title="タップで中を開いて編集">
        <span className="fs-title">{title}</span>
        <span className="fs-addr">{address}</span>
      </button>
      <span className="fs-tags">
        {keyBadge && <span className="fs-keychg" aria-label={`keychg-${unit.childId}`} title={`曲の調と${keyChg}半音`}>{keyBadge}</span>}
        {unit.count > 1 && (
          <button type="button" className="fs-xn" aria-label={`expand-${unit.childId}`} aria-expanded={expanded} title={`同じセクション ${unit.count} 連続（タップで展開）`} onClick={onToggleExpand}>×{unit.count}</button>
        )}
        {sharedCount >= 2 && <span className="fs-shared" aria-label={`shared-${unit.childId}`} title="2箇所以上で使われています（共有・直すと全部に効く）">共有{sharedCount}</span>}
        {variant && <span className="fs-variant" aria-label={`variant-${unit.childId}`} title="分家（元セクションの変奏＝variant_of）">分家</span>}
        {energyChip && <span className="fs-energy" aria-label={`energy-${unit.childId}`} title="エナジー（前セクション比・提案の目安＝保存されません）">{energyChip}</span>}
      </span>
      {neta && <span className="fs-band"><SectionSkyline neta={neta} /></span>}
      <button type="button" className="fs-more" aria-label={`more-${unit.childId}`} title="このセクションの操作（役割/分家/複製/外す）" onClick={onOpenMenu}>⋯</button>
      {isCurrent && <span className="fs-progress" aria-hidden="true" />}
    </div>
  );
}
