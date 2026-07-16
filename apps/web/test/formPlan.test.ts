import { describe, it, expect } from "vitest";
import { planKeyApplication, transitionWindowNotes, scaffoldPlan, energyChips, type PlanCard, type KeyTarget } from "../src/formPlan";

// ── S3-a 純ロジック（design「#曲フォーム」S3-a・テスト先行） ──

describe("planKeyApplication（key/mode適用の振り分け＝直接更新 vs 自動分家）", () => {
  const base: KeyTarget = { key: 0, mode: "major" }; // 曲の基準調（C major）
  const card = (childId: string, key: number | null = null, mode: string | null = null): PlanCard => ({ childId, key, mode });
  const t = (key: number, mode: "major" | "minor" = "major"): KeyTarget => ({ key, mode });

  it("全配置が同一ターゲット＝実体を直接更新（direct 1件・分家なし）", () => {
    // サビ×2 とも +3 → 実体を1回 update すれば両方に効く（参照共有の利点）
    const cards = [card("A"), card("S"), card("S")];
    const app = planKeyApplication(cards, [t(0), t(3), t(3)], base);
    expect(app.branch).toEqual([]);
    expect(app.direct).toEqual([{ childId: "S", target: t(3), indices: [1, 2] }]);
  });

  it("ターゲットが割れる＝先頭配置を実体へ・異なる配置は分家（同調の複数配置は同じ分家を共有）", () => {
    // サビ×3：1番/2番=±0・ラスサビ=+1 → 実体は±0のまま（変化なし）・3箇所目だけ分家して+1
    const cards = [card("S"), card("S"), card("S")];
    const app = planKeyApplication(cards, [t(0), t(0), t(1)], base);
    expect(app.direct).toEqual([]); // 先頭ターゲット=現在値（base と同じ）＝実体は触らない
    expect(app.branch).toEqual([{ childId: "S", target: t(1), indices: [2] }]);
  });

  it("先頭ターゲットが現在と違えば実体を更新し・別ターゲット2配置は1つの分家を共有", () => {
    const cards = [card("S"), card("S"), card("S")];
    const app = planKeyApplication(cards, [t(2), t(1), t(1)], base);
    expect(app.direct).toEqual([{ childId: "S", target: t(2), indices: [0] }]);
    expect(app.branch).toEqual([{ childId: "S", target: t(1), indices: [1, 2] }]); // +1 の2配置＝分家1つ共有
  });

  it("現在の実体キーと同じターゲット＝no-op（direct に入れない・無転調プランは操作ゼロ）", () => {
    const cards = [card("A", 5, "minor"), card("S")]; // A は既に F minor・S は継承（base=C major）
    const app = planKeyApplication(cards, [t(5, "minor"), t(0, "major")], base);
    expect(app.direct).toEqual([]);
    expect(app.branch).toEqual([]);
  });

  it("mode の反転だけでも更新対象（同主調転調）", () => {
    const cards = [card("A")];
    const app = planKeyApplication(cards, [t(0, "minor")], base);
    expect(app.direct).toEqual([{ childId: "A", target: t(0, "minor"), indices: [0] }]);
  });

  it("targets が cards より短い＝余った配置は触らない（防御）", () => {
    const cards = [card("A"), card("B")];
    const app = planKeyApplication(cards, [t(3)], base);
    expect(app.direct).toEqual([{ childId: "A", target: t(3), indices: [0] }]);
    expect(app.branch).toEqual([]);
  });
});

describe("transitionWindowNotes（遷移試聴＝境界±halfSpan の部分窓・縫い目E）", () => {
  const n = (start: number, dur: number, pitch = 60) => ({ pitch, start, dur });

  it("窓 [境界-w, 境界+w) 内のノートを 0 起点にシフトして返す", () => {
    // 境界=32・w=8 → 窓 [24,40)
    const notes = [n(0, 4), n(24, 4), n(31, 2), n(36, 4), n(40, 4)];
    const win = transitionWindowNotes(notes, 32, 8);
    expect(win).toEqual([n(0, 4), n(7, 2), n(12, 4)]); // 24→0・31→7・36→12。窓外(0/40)は落ちる
  });

  it("窓をまたぐロングノートは端でクリップ（前から食い込む白玉も鳴る）", () => {
    const notes = [n(20, 8), n(38, 6)]; // 20-28 は窓頭で・38-44 は窓尾でクリップ
    const win = transitionWindowNotes(notes, 32, 8);
    expect(win).toEqual([n(0, 4), n(14, 2)]); // [24,28)→0-4・[38,40)→14-16
  });

  it("曲頭の境界＝lo を 0 でクリップ（負の窓を作らない）", () => {
    const notes = [n(0, 4), n(6, 2)];
    const win = transitionWindowNotes(notes, 4, 8); // 窓 [max(0,-4)=0, 12)
    expect(win).toEqual([n(0, 4), n(6, 2)]); // シフト量 0＝そのまま
  });

  it("窓内が空なら空配列", () => {
    expect(transitionWindowNotes([n(0, 4)], 100, 8)).toEqual([]);
  });
});

describe("scaffoldPlan（suggest_form 候補→足場の前置和射影）", () => {
  it("役割列＋小節数 → position（前置和・拍）に落ちる", () => {
    const plan = scaffoldPlan([{ role: "intro", bars: 4 }, { role: "verse", bars: 8 }, { role: "chorus", bars: 8 }], 4);
    expect(plan).toEqual([
      { role: "intro", bars: 4, position: 0 },
      { role: "verse", bars: 8, position: 16 },
      { role: "chorus", bars: 8, position: 48 },
    ]);
  });
  it("空＝空・bars 0/負は 0 扱い（射影が壊れない防御）", () => {
    expect(scaffoldPlan([], 4)).toEqual([]);
    const plan = scaffoldPlan([{ role: "intro", bars: 0 }, { role: "verse", bars: 8 }], 4);
    expect(plan[1]!.position).toBe(0);
  });
});

describe("energyChips（エナジーΔチップ＝前セクション比の矢印・揮発表示）", () => {
  it("level 差分→ ↑↑/↑/→/↓/↓↓（先頭は基準＝→）", () => {
    const chips = energyChips([{ level: 2 }, { level: 4 }, { level: 4 }, { level: 1 }, { level: 5 }, { level: 4 }]);
    expect(chips).toEqual(["→", "↑↑", "→", "↓↓", "↑↑", "↓"]);
  });
  it("+1 は ↑・空は空", () => {
    expect(energyChips([{ level: 1 }, { level: 2 }])).toEqual(["→", "↑"]);
    expect(energyChips([])).toEqual([]);
  });
});
