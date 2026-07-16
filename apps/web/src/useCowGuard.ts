// CoW（copy-on-write＝分家の安全弁・design「分家モデル」S2）の共有フック。
// 「共有された子（placementCount>=2）を親から潜って編集した瞬間に、全部に効かす／この曲だけ変える（分家）／
// やめる を選ばせる」ロジックの単一実装＝useNetaEditor（content/meta の自動保存）と SectionEditor
// （bars/レーン設定の直接 updateNeta）の両方から使う（Fix C＝直接経路がガードを素通りする穴の根治）。
//
// 決定はエディタセッション内で保持（decidedRef）＝初回のみ確認。parentId 未指定（トップから開いた）＝
// ガード完全無効＝従来どおり（bit-safe・API も一切呼ばない）。
import { useEffect, useRef, useState } from "react";
import { api, type Neta, type NetaPatch } from "./api";

export type CowChoice = "all" | "branch" | "cancel";
export type CowGuardResult =
  | { action: "save" } // 通常保存してよい（未共有／全部に効かす／分家済み）
  | { action: "cancel" } // 保存しない（ユーザーがやめた＝原本無変更・エディタに留まる）
  | { action: "branched"; branch: Neta }; // 分家を作り patch を分家へ適用済み（原本は無傷）

export type CowGuard = ReturnType<typeof useCowGuard>;

export function useCowGuard(
  neta: Neta,
  opts: {
    parentId?: string; // どの親から潜ったか＝分家の配置差し替え先。未指定＝ガード無し。
    onForked?: (branch: Neta) => void; // 分家後、呼び出し側がエディタ/画面を分家へ載せ替える。
    onChanged?: () => void;
  },
) {
  // 共有状態のキャッシュ（Fix A-1）：null=未解決（先読み中 or 失敗）。keepalive（unmount/beforeunload）は
  // 対話できないため**同期**でこの値を見る＝未解決/共有なら原本に書かない（エイリアシング事故＞データ喪失）。
  const sharedRef = useRef<boolean | null>(opts.parentId ? null : false);
  const countRef = useRef(0);
  const sharedPromiseRef = useRef<Promise<boolean | null> | null>(null);
  const decidedRef = useRef<null | "all" | "branch">(null); // 一度選んだら再確認しない（セッション内）
  const [cowPrompt, setCowPrompt] = useState<{ count: number } | null>(null);
  const resolveRef = useRef<((v: CowChoice) => void) | null>(null);
  const mountedRef = useRef(true);

  const fetchShared = (): Promise<boolean | null> =>
    api
      .getPlacements(neta.id)
      .then((pl) => {
        sharedRef.current = (pl.placementCount ?? 0) >= 2;
        countRef.current = pl.placementCount ?? 0;
        return sharedRef.current;
      })
      .catch(() => null); // 失敗＝未解決のまま（対話ガードは通常保存へ・keepalive は安全側でスキップ）

  // 先読み（Fix A-1）：親から潜ったら placements をマウント時にキャッシュ。guard はこの promise を待つ
  // ＝二度引かない・「先読みが返る前に保存が走る」レースも無い。
  useEffect(() => {
    mountedRef.current = true;
    if (opts.parentId) sharedPromiseRef.current = fetchShared();
    return () => {
      mountedRef.current = false;
      resolveRef.current?.("cancel"); // プロンプト表示中に unmount＝待っている guard を「やめる」で解放
      resolveRef.current = null;
    };
    // neta.id/parentId 固定のエディタセッション前提（key= で再マウント）＝マウント時1回で足りる。
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  /** keepalive（unmount/beforeunload）の無対話フラッシュが原本に書いてよいか（Fix A-2）。
   * 共有 or 未解決（null）かつ未決定なら**書かない**＝「やめる」を選んだ（or 選ばせる前の）編集を裏で流さない。 */
  const shouldBlockSilentSave = (): boolean =>
    !!opts.parentId && decidedRef.current === null && sharedRef.current !== false;

  /** 汎用ゲート（S3-a Fix＝compose 辺操作もガード）：共有なら初回のみ3択。
   * 返り "save"＝呼び出し側が**原本 id に対して**操作を実行してよい／"cancel"＝何もしない（楽観更新は戻す）／
   * "branched"＝vary→親の該当辺差し替え→**applyTo を分家 id に対して実行済み**（原本は無傷・onForked 発火済み）。
   * applyTo の返り Neta は onForked へ渡す表示用（省略時は vary の返した分家）。 */
  async function guardAction(applyTo: (targetId: string, branch: Neta) => Promise<Neta | void>): Promise<CowGuardResult> {
    if (!opts.parentId || decidedRef.current !== null) return { action: "save" };
    // 共有判定＝先読みキャッシュを待つ（未起動なら起動）。失敗（null）＝ガードせず従来どおり保存を通す
    // （対話中はユーザーが見ている＝保存を止めて作業を失う方が害）。
    const shared = sharedRef.current ?? (await (sharedPromiseRef.current ?? fetchShared()));
    if (!shared) {
      if (shared === false) decidedRef.current = "all"; // 未共有確定＝以降ガードしない
      return { action: "save" };
    }
    const choice = await new Promise<CowChoice>((res) => {
      resolveRef.current = res;
      if (mountedRef.current) setCowPrompt({ count: countRef.current });
    });
    if (mountedRef.current) setCowPrompt(null);
    if (choice === "cancel") return { action: "cancel" }; // 決定は保持しない＝次の操作で再度確認
    if (choice === "branch") {
      // この曲だけ変える＝子を分家 → **現在の親の該当辺だけ**新idへ差し替え（position/ord 維持）→ 操作は分家へ。
      const branch = await api.vary(neta.id).catch(() => null);
      if (branch) {
        const pcomp = await api.getComposition(opts.parentId).catch(() => null);
        const edges = pcomp?.children.filter((c) => c.node.neta.id === neta.id) ?? [];
        for (const e of edges) {
          await api.removeChild(opts.parentId, neta.id, e.position).catch(() => {});
          await api.placeChild(opts.parentId, branch.id, e.position, e.ord).catch(() => {});
        }
        const ret = await applyTo(branch.id, branch); // 操作（patch保存/辺操作）を分家に対して実行（原本は無傷）
        decidedRef.current = "branch";
        opts.onChanged?.();
        const forked = ret ?? branch;
        opts.onForked?.(forked); // 呼び出し側がエディタを分家へ載せ替え（以降の編集は分家に効く）
        return { action: "branched", branch: forked };
      }
      // vary 失敗＝フォールスルーで「全部に効かす」（操作自体は失わせない）
    }
    decidedRef.current = "all"; // 全部に効かす＝以降このセッションは通常どおり原本へ
    return { action: "save" };
  }

  /** 保存前ゲート（patch 特化＝guardAction の薄いラッパ）。branch 選択＝patch を分家へ updateNeta。
   * branchPatch＝分家に適用する patch の補正（Fix B＝title 未変更なら「元title′」を維持する等）。 */
  async function guard(patch: NetaPatch, branchPatch?: (branch: Neta) => NetaPatch): Promise<CowGuardResult> {
    return guardAction(async (targetId, branch) => {
      const p = branchPatch ? branchPatch(branch) : patch;
      return await api.updateNeta(targetId, p).catch(() => branch); // 編集内容を分家へ（原本は無傷）
    });
  }

  const resolveCow = (v: CowChoice) => {
    resolveRef.current?.(v);
    resolveRef.current = null;
  };

  return { cowPrompt, resolveCow, guard, guardAction, shouldBlockSilentSave };
}
