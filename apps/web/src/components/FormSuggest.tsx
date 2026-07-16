// つなぎ＝計画 verb の入口（design「#曲フォーム」S3-a）＝FormStrip ヘッダの「提案▾」メニュー。
// フォーム(suggest_form)／転調(suggest_key_plan)／エナジー(suggest_energy_plan) の候補モーダルを出し、
// タップで適用＝「提案→人がワンタップ適用」の哲学を UI でも維持。適用の実行（辺の除去/作成/vary 等）は
// FormStrip 側のコールバック＝当コンポは fetch・選択・確認（置き換え/転調サマリ）まで。
import { useState } from "react";
import { api, type FormCandidate, type KeyPlan, type EnergyPlanLite } from "../api";
import { planKeyApplication, type KeyApplication, type KeyTarget, type PlanCard } from "../formPlan";
import { roleInfo, keyDiffLabel } from "../formStrip";
import { PITCH_NAMES } from "../music";

// position 順のカード情報（key 適用の振り分け＋サマリ表示用）。
export type SuggestCard = PlanCard & { title: string; role?: string };

type View =
  | { kind: "form"; cands: FormCandidate[] | null } // null=読込中
  | { kind: "form-confirm"; cand: FormCandidate } // 非空ストリップの置き換え確認
  | { kind: "key"; plans: KeyPlan[] | null }
  | { kind: "key-confirm"; plan: KeyPlan; app: KeyApplication } // 適用前サマリ（直接更新/自動分家の明示）
  | { kind: "energy" };

const ENERGY_TEMPLATES = [
  { id: "jpop_standard", label: "標準J-pop（落ちサビ→大サビ）" },
  { id: "ballad", label: "バラード（音域とレイヤで山）" },
  { id: "four_on_floor", label: "4つ打ち（build→drop）" },
] as const;

const keyName = (t: KeyTarget) => `${PITCH_NAMES[((t.key % 12) + 12) % 12]}${t.mode === "minor" ? "m" : ""}`;

export function FormSuggest({
  keyPc,
  mode,
  tempo,
  liveMeter,
  cards,
  onApplyForm,
  onApplyKeyPlan,
  onApplyEnergy,
}: {
  keyPc: number;
  mode: string | null | undefined;
  tempo: number;
  liveMeter?: string;
  cards: SuggestCard[]; // position 順
  onApplyForm: (cand: FormCandidate) => Promise<void>;
  onApplyKeyPlan: (app: KeyApplication) => Promise<void>;
  onApplyEnergy: (plan: EnergyPlanLite) => void;
}) {
  const [menuOpen, setMenuOpen] = useState(false);
  const [view, setView] = useState<View | null>(null);
  const [busy, setBusy] = useState(false);
  const baseMode: "major" | "minor" = mode === "minor" ? "minor" : "major";
  const roles = cards.map((c) => c.role ?? "verse"); // role 無し＝verse（api 側 normRole の既定と同じ解釈）

  const close = () => setView(null);

  const openForm = () => {
    setMenuOpen(false);
    setView({ kind: "form", cands: null });
    void api
      .suggestForm({ bpm: tempo, meter: liveMeter, count: 4 })
      .then((r) => setView((v) => (v?.kind === "form" ? { kind: "form", cands: r.candidates } : v)))
      .catch(() => setView((v) => (v?.kind === "form" ? { kind: "form", cands: [] } : v)));
  };
  const openKey = () => {
    setMenuOpen(false);
    setView({ kind: "key", plans: null });
    void api
      .suggestKeyPlan(roles, keyPc, baseMode)
      .then((r) => setView((v) => (v?.kind === "key" ? { kind: "key", plans: r.plans } : v)))
      .catch(() => setView((v) => (v?.kind === "key" ? { kind: "key", plans: [] } : v)));
  };
  const openEnergy = () => {
    setMenuOpen(false);
    setView({ kind: "energy" });
  };

  const pickForm = (cand: FormCandidate) => {
    // 非空ストリップは置き換え確認（辺のみ除去＝既存ネタは無傷・design S3-a）。空なら即適用。
    if (cards.length > 0) setView({ kind: "form-confirm", cand });
    else void applyForm(cand);
  };
  async function applyForm(cand: FormCandidate) {
    setBusy(true);
    try {
      await onApplyForm(cand);
      close();
    } finally {
      setBusy(false);
    }
  }

  const pickKeyPlan = (plan: KeyPlan) => {
    // 適用前サマリ＝直接更新（全配置に効く）と自動分家（その配置だけ）を明示。ここで同意を得る＝CoW二重確認しない。
    const targets: KeyTarget[] = plan.sections.map((s) => ({ key: s.key, mode: s.mode }));
    const app = planKeyApplication(cards, targets, { key: keyPc, mode: baseMode });
    setView({ kind: "key-confirm", plan, app });
  };
  async function applyKeyPlan(app: KeyApplication) {
    setBusy(true);
    try {
      await onApplyKeyPlan(app);
      close();
    } finally {
      setBusy(false);
    }
  }

  async function pickEnergy(template: string) {
    setBusy(true);
    try {
      const plan = await api.suggestEnergyPlan(roles, template);
      onApplyEnergy(plan);
      close();
    } catch {
      /* 失敗は静かに（提案は揮発） */
    } finally {
      setBusy(false);
    }
  }

  // カード title（1-based の配置番号付き・サマリの人間語）。
  const titleAt = (i: number) => cards[i]?.title ?? `${i + 1}枚目`;
  const summaryLines = (app: KeyApplication): { text: string; branch: boolean }[] => {
    const lines: { text: string; branch: boolean }[] = [];
    for (const d of app.direct) {
      const diff = keyDiffLabel(d.target.key, keyPc);
      lines.push({ text: `${titleAt(d.indices[0]!)} → ${keyName(d.target)}${diff ? `（${diff}）` : ""}（全配置に効く）`, branch: false });
    }
    for (const b of app.branch) {
      const diff = keyDiffLabel(b.target.key, keyPc);
      const nth = b.indices.map((i) => `${i + 1}枚目`).join("・");
      lines.push({ text: `${titleAt(b.indices[0]!)}（${nth}）→ 分家して ${keyName(b.target)}${diff ? `（${diff}）` : ""}`, branch: true });
    }
    return lines;
  };

  return (
    <div className="fs-suggest">
      <button type="button" className="fs-suggest-btn" aria-label="suggest-menu" aria-expanded={menuOpen} title="つなぎの提案（フォーム/転調/エナジー）" onClick={() => setMenuOpen((v) => !v)}>
        提案 ▾
      </button>
      {menuOpen && <div className="fs-suggest-backdrop" aria-hidden="true" onClick={() => setMenuOpen(false)} />}
      {menuOpen && (
        <div className="fs-suggest-menu" role="menu" aria-label="suggest-items">
          <button type="button" role="menuitem" aria-label="suggest-form" onClick={openForm}>フォーム（構成の足場）</button>
          <button type="button" role="menuitem" aria-label="suggest-key" onClick={openKey}>転調（キープラン）</button>
          <button type="button" role="menuitem" aria-label="suggest-energy" onClick={openEnergy}>エナジー（Δチップ）</button>
        </div>
      )}

      {view?.kind === "form" && (
        <div className="dialog-backdrop" role="dialog" aria-label="suggest-form-modal" onClick={close}>
          <div className="dialog" onClick={(e) => e.stopPropagation()}>
            <header><strong>構成の候補</strong><button type="button" aria-label="close-suggest" onClick={close}>×</button></header>
            {view.cands === null ? (
              <p className="muted">候補を出しています…</p>
            ) : view.cands.length === 0 ? (
              <p className="muted">候補が出せませんでした</p>
            ) : (
              view.cands.map((c) => (
                <button type="button" key={c.id} className="sg-item" aria-label={`form-cand-${c.id}`} disabled={busy} onClick={() => pickForm(c)}>
                  <span className="sg-title">{c.name} <small className="muted">{c.totalBars}小節 ≈{Math.round(c.seconds)}秒</small></span>
                  <span className="sg-sub">{c.sections.map((s) => `${roleInfo(s.role)?.label ?? s.role}${s.bars}`).join(" - ")}</span>
                  {c.notes.length > 0 && <span className="sg-note muted">{c.notes.join("・")}</span>}
                </button>
              ))
            )}
          </div>
        </div>
      )}

      {view?.kind === "form-confirm" && (
        <div className="dialog-backdrop" role="dialog" aria-label="form-replace-confirm">
          <div className="dialog">
            <p>今の並びを置き換えます（セクションのネタ自体は残ります）。よろしいですか？</p>
            <div className="sg-actions">
              <button type="button" aria-label="form-replace-ok" disabled={busy} onClick={() => void applyForm(view.cand)}>置き換える</button>
              <button type="button" aria-label="form-replace-cancel" onClick={close}>やめる</button>
            </div>
          </div>
        </div>
      )}

      {view?.kind === "key" && (
        <div className="dialog-backdrop" role="dialog" aria-label="suggest-key-modal" onClick={close}>
          <div className="dialog" onClick={(e) => e.stopPropagation()}>
            <header><strong>転調プラン</strong><button type="button" aria-label="close-suggest" onClick={close}>×</button></header>
            {view.plans === null ? (
              <p className="muted">候補を出しています…</p>
            ) : view.plans.length === 0 ? (
              <p className="muted">セクションを並べてから提案できます</p>
            ) : (
              view.plans.map((p) => (
                <button type="button" key={p.id} className="sg-item" aria-label={`key-plan-${p.id}`} disabled={busy} onClick={() => pickKeyPlan(p)}>
                  <span className="sg-title">{p.label}</span>
                  <span className="sg-sub">{p.transitions.length === 0 ? "転調なし" : p.transitions.map((t) => `${t.name}(+${t.semitones})`).join("・")}</span>
                </button>
              ))
            )}
          </div>
        </div>
      )}

      {view?.kind === "key-confirm" && (
        <div className="dialog-backdrop" role="dialog" aria-label="key-apply-confirm">
          <div className="dialog">
            <header><strong>{view.plan.label}</strong></header>
            {(() => {
              const lines = summaryLines(view.app);
              return lines.length === 0 ? (
                <p className="muted">変更はありません（今の調のまま）</p>
              ) : (
                <ul className="sg-summary" aria-label="key-apply-summary">
                  {lines.map((l, i) => (
                    <li key={i} className={l.branch ? "sg-branch" : undefined}>{l.text}</li>
                  ))}
                </ul>
              );
            })()}
            <div className="sg-actions">
              {(view.app.direct.length > 0 || view.app.branch.length > 0) && (
                <button type="button" aria-label="key-apply" disabled={busy} onClick={() => void applyKeyPlan(view.app)}>適用</button>
              )}
              <button type="button" aria-label="key-apply-cancel" onClick={close}>やめる</button>
            </div>
          </div>
        </div>
      )}

      {view?.kind === "energy" && (
        <div className="dialog-backdrop" role="dialog" aria-label="suggest-energy-modal" onClick={close}>
          <div className="dialog" onClick={(e) => e.stopPropagation()}>
            <header><strong>エナジーアーク</strong><button type="button" aria-label="close-suggest" onClick={close}>×</button></header>
            <p className="muted">カードに Δ チップを出します（この画面の間だけ・保存しません）</p>
            {ENERGY_TEMPLATES.map((t) => (
              <button type="button" key={t.id} className="sg-item" aria-label={`energy-${t.id}`} disabled={busy} onClick={() => void pickEnergy(t.id)}>
                <span className="sg-title">{t.label}</span>
              </button>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
