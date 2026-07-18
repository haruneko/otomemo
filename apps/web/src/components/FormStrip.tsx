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
import { arrayMove, SortableContext, horizontalListSortingStrategy, useSortable } from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import { api, type Neta, type FormCandidate, type EnergyPlanLite } from "../api";
import { PITCH_NAMES, buildPlayback, type PlaybackHandle } from "../music";
import { startPlayback } from "../playback";
import { collapseRuns, cardsToEdges, reconcileEdges, resolveDurById, totalSpanBeats, roleOf, roleInfo, keyDiffLabel, type StripCard, type Edge } from "../formStrip";
import { scaffoldPlan, energyChips, transitionWindowNotes, type KeyApplication } from "../formPlan";
import { FormSuggest, type SuggestCard } from "./FormSuggest";
import { lanesForKind, type Child } from "./sectionLanes";
import { SectionSkyline } from "./MiniRoll";
import { SongStatus } from "./SongStatus";
import { PlacePicker } from "./PlacePicker";
import { usePlacePicker } from "../usePlacePicker";
import { Icon } from "./Icon";

// 曲フォーム＝フォームストリップ（design「#曲フォーム」S1・正典 §4.2）。
// song エディタの小節グリッド→**カード列**へ置換（song kind 専用・section のグリッドは不変）。
// カード＝役割/尺/レイヤ帯（調バッジ・分家バッジは S2）。並べ替え(dnd-kit)/挿入(PlacePicker)/削除/×N畳み/
// タップで潜る/今どこハイライト。position は**カード順からの前置和射影**で再計算＝compose_edge/position の契約は不変。
// ロジックは formStrip.ts の純関数へ出してテスト可能に、本体は結線のみ。

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
  const [badges, setBadges] = useState<Record<string, { shared: boolean; variant: boolean }>>({});
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
          return [id, { shared: (pl.placementCount ?? 0) >= 2, variant: rels.some((r) => r.type === "variant_of") }] as const;
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
  const keyLabel = `${PITCH_NAMES[((keyPc % 12) + 12) % 12]}${mode === "minor" ? "m" : ""}`;

  // 「今どこ」＝再生中だけ beatRef を低頻度ポーリングし、現在拍を含む子の sorted 添字を state に落とす。
  useEffect(() => {
    if (!playing) { setCurrentIdx(null); return; }
    const timer = setInterval(() => {
      const beat = beatRef.current;
      const idx = sorted.findIndex((c) => c.position <= beat + 1e-6 && beat < c.position + childDur(c) - 1e-6);
      setCurrentIdx(idx >= 0 ? idx : null);
    }, CURRENT_POLL_MS);
    return () => clearInterval(timer);
  }, [playing, sorted, childDur, beatRef]);

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

  // 削除＝その表示単位の全配置を外す（×N は N 個まとめて＝1ブロックの削除・展開中は1個）。
  async function removeUnit(u: DisplayUnit) {
    const desired = units.filter((x) => x !== u).flatMap((x) => Array(x.count).fill(x.childId) as string[]);
    await applyOrder(desired, children);
  }

  // 分家にする（S2・「同じものとして育てる」）＝**その配置1つだけ**を vary した新セクションに差し替え。
  // 転調ラスサビの入口＝サビの1配置を分家化して key+1 等を分家側で自由に。子ネタは参照共有（元サビを直せば効く）。
  // ×N（畳んだ反復）は先頭配置1つだけを分家（残りは元のまま）＝「ここから別物として育て始める」導線。
  async function branchUnit(u: DisplayUnit) {
    const c = sorted[u.indices[0]!]; // この childId の先頭配置（position/ord を維持して差し替え）
    if (!c) return;
    const branch = await api.vary(c.node.neta.id).catch(() => null);
    if (!branch) return;
    await api.removeChild(neta.id, c.node.neta.id, c.position).catch(() => {});
    await api.placeChild(neta.id, branch.id, c.position, c.ord).catch(() => {});
    await reload();
    onChanged?.();
  }

  // ── つなぎ＝計画 verb の適用（S3-a）。候補の fetch/選択/確認は FormSuggest・実行はここ。 ──
  // suggest_form → 足場化：既存の辺を全除去（ネタ実体は無傷）→空 section を作って前置和射影で並べる。
  // key は設定しない＝曲の key で再帰合成（compositeNotes の継承）・title＝役割ラベル（formStrip ROLE_INFO が SSOT）。
  async function applyFormCandidate(cand: FormCandidate) {
    for (const c of sorted) await api.removeChild(neta.id, c.node.neta.id, c.position).catch(() => {});
    for (const s of scaffoldPlan(cand.sections, BPB)) {
      const created = await api
        .createNeta({ kind: "section", title: roleInfo(s.role)?.label ?? s.role, bars: s.bars, meter: liveMeter, tags: [`role:${s.role}`] })
        .catch(() => null);
      if (created) await api.placeChild(neta.id, created.id, s.position, 0).catch(() => {});
    }
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

  return (
    <div className="form-strip" aria-label="form-strip">
      {/* 曲ヘッダ＝合計尺・key/mode・tempo・提案▾（S3-a）・段階/次の一手（SongStatus 統合）。 */}
      <div className="fs-header">
        <div className="fs-meta" aria-label="song-meta">
          <span className="fs-total">{totalBars}小節<small>≈{totalSec}秒</small></span>
          <span className="fs-key">{keyLabel}</span>
          <span className="fs-tempo">♩={tempo}</span>
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
        <SongStatus netaId={neta.id} />
      </div>

      {sorted.length === 0 ? (
        <p className="fs-empty muted">
          セクションを並べて曲にします。<button type="button" className="fs-insert fs-insert-empty" aria-label="fs-insert-0" onClick={() => openInsert(0)}>＋ セクションを置く</button>
        </p>
      ) : (
        <DndContext sensors={sensors} collisionDetection={closestCenter} onDragEnd={(e) => void onDragEnd(e)}>
          <SortableContext items={units.map((u) => u.id)} strategy={horizontalListSortingStrategy}>
            <div className="fs-cards" aria-label="form-cards">
              {units.map((u, i) => (
                <Fragment key={u.id}>
                  <button type="button" className="fs-insert" aria-label={`fs-insert-${i}`} title="ここにセクションを挿す" onClick={() => openInsert(i)}>＋</button>
                  {/* 遷移試聴（縫い目E）＝内側の境界のみ（先頭カードの前には出さない）。トグルで停止。 */}
                  {i > 0 && (
                    <button
                      type="button"
                      className="fs-trans"
                      aria-label={`fs-trans-${i}`}
                      aria-pressed={transAt === i}
                      title="つなぎを試聴（前の末2小節＋次の頭2小節）"
                      onClick={() => void toggleTransition(i, sorted[u.indices[0]!]?.position ?? 0)}
                    >
                      {transAt === i ? "⏹" : "♪"}
                    </button>
                  )}
                  <FormCard
                    unit={u}
                    neta={netaOf(u.childId)}
                    isCurrent={currentIdx != null && u.indices.includes(currentIdx)}
                    songKey={keyPc}
                    shared={badges[u.childId]?.shared ?? false}
                    variant={badges[u.childId]?.variant ?? false}
                    energyChip={chips?.[u.indices[0]!]}
                    onOpen={() => { const n = netaOf(u.childId); if (n) onOpenNeta?.(n); }}
                    onDelete={() => void removeUnit(u)}
                    onBranch={() => void branchUnit(u)}
                    onToggleExpand={() => toggleExpand(u.expandKey)}
                    expanded={expanded.has(u.expandKey)}
                    childDur={childDur}
                    childOf={() => sorted.find((c) => c.node.neta.id === u.childId)}
                    BPB={BPB}
                  />
                </Fragment>
              ))}
              {/* 末尾の挿入＝一番後ろに「続き」を足す主導線。空状態の「＋ セクションを置く」と同じく**常時見える
                  文言ラベル**にする＝タッチ端末（ホバー/focus-visible が無い）でも discoverable（不可視の裸＋スロットで
                  「続きを置けない」バグの根治・2026-07-18）。カード間の細スロットは precise 挿入用に据え置き。 */}
              <button type="button" className="fs-insert fs-insert-end" aria-label={`fs-insert-${units.length}`} title="末尾にセクションを足す" onClick={() => openInsert(sortedIds.length)}>＋ セクション</button>
            </div>
          </SortableContext>
        </DndContext>
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

// 1カード（方向C＝エナジー積み棒スカイライン）。役割はカード地の淡ティント＋色文字、レイヤ帯は縦積み棒、
// 尺でカード幅が可変（4小節=細/8小節=太）。上部＝役割/×N/将来スロット(調バッジ・分家)/⠿、本体＝タイトル＋積み棒、
// フッタ＝尺+削除。dnd-kit sortable の1要素。挙動（潜る/削除/展開/ドラッグ）は不変で見た目のみ刷新。
function FormCard({
  unit,
  neta,
  isCurrent,
  songKey,
  shared,
  variant,
  energyChip,
  onOpen,
  onDelete,
  onBranch,
  onToggleExpand,
  expanded,
  childDur,
  childOf,
  BPB,
}: {
  unit: DisplayUnit;
  neta: Neta | undefined;
  isCurrent: boolean;
  songKey: number;
  shared: boolean; // 2箇所以上で使われている（共有バッジ）
  variant: boolean; // variant_of を持つ＝分家（A′ バッジ）
  energyChip?: string; // エナジーΔチップ（S3-a・揮発＝適用中のセッションのみ）
  onOpen: () => void;
  onDelete: () => void;
  onBranch: () => void; // 分家にする（この配置1つだけ vary で差し替え）
  onToggleExpand: () => void;
  expanded: boolean;
  childDur: (c: Child) => number;
  childOf: () => Child | undefined;
  BPB: number;
}) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({ id: unit.id });
  const style = { transform: CSS.Transform.toString(transform), transition, opacity: isDragging ? 0.5 : undefined };
  const role = roleOf(neta?.tags);
  const ri = roleInfo(role);
  const c = childOf();
  const dur = c ? childDur(c) : 0;
  const bars = BPB > 0 ? Math.round(dur / BPB) : 0;
  const title = neta?.title ?? neta?.text ?? "(無題)";
  const keyChg = keyDiffLabel(neta?.key ?? null, songKey); // 曲と調が違う時だけ「+1」等（同調/未設定は null）
  // 尺でカード幅を可変（設計図として起伏が形になる）。役割色はカード地のティント基準＝--rc に流す（無役割は CSS 既定）。
  const widthClass = bars <= 4 ? "fs-w4" : "fs-w8";
  return (
    <div
      ref={setNodeRef}
      style={ri?.color ? { ...style, ["--rc" as string]: ri.color } : style}
      className={`fs-card ${widthClass}`}
      data-current={isCurrent ? "" : undefined}
      aria-label={`form-card-${unit.childId}`}
    >
      <div className="fs-card-top">
        {ri && <span className="fs-role" aria-label={`role-${role}`}>{ri.label}</span>}
        {unit.count > 1 && (
          <button type="button" className="fs-xn" aria-label={`expand-${unit.childId}`} aria-expanded={expanded} title={`同じセクション ${unit.count} 連続（タップで展開）`} onClick={onToggleExpand}>×{unit.count}</button>
        )}
        {/* S2 バッジ＝役割行右端。調バッジ(曲と違う調)・分家(′)・共有(🔗×n)。既存 CSS 変数のみ・新配色は作らない。 */}
        {/* S3-a エナジーΔチップ（揮発）＝前セクション比の矢印（↑↑/↑/→/↓/↓↓）。 */}
        {energyChip && <span className="fs-energy" aria-label={`energy-${unit.childId}`} title="エナジー（前セクション比・提案の目安＝保存されません）">{energyChip}</span>}
        {keyChg && <span className="fs-keychg" aria-label={`keychg-${unit.childId}`} title={`曲の調と${keyChg}半音`}>{keyChg}</span>}
        {variant && <span className="fs-variant" aria-label={`variant-${unit.childId}`} title="分家（元セクションの変奏＝variant_of）">′</span>}
        {shared && <span className="fs-shared" aria-label={`shared-${unit.childId}`} title="2箇所以上で使われています（共有・直すと全部に効く）">🔗</span>}
        <span className="fs-grip" aria-label={`drag-${unit.childId}`} title="ドラッグで並べ替え" {...attributes} {...listeners}><Icon name="grip" size={14} /></span>
      </div>
      <button type="button" className="fs-card-body" onClick={onOpen} title="タップで中を編集（潜る）">
        <span className="fs-title">{title}</span>
        {neta && <SectionSkyline neta={neta} />}
      </button>
      <div className="fs-card-foot">
        <span className="fs-len">{bars}<small>小節</small></span>
        {/* 分家にする＝同じものとして育てる（この配置だけ vary で差し替え・転調ラスサビの入口）。複製(別物)は NetaList 側。 */}
        <button type="button" className="fs-branch" aria-label={`fs-branch-${unit.childId}`} title="分家にする（同じものとして育てる＝この配置だけ変奏。転調ラスサビ等）" onClick={onBranch}>分家</button>
        <button type="button" className="fs-del" aria-label={`fs-del-${unit.childId}`} title="このカードを外す" onClick={onDelete}><Icon name="trash" size={14} /></button>
      </div>
    </div>
  );
}
