import { describe, it, expect } from "vitest";
import { applyFeelEnsemble, compositeNotes, feelOfTree, type CompositeChild, type Note } from "../src/music";

// 2026-09-17 オーナー裁定（揺れはパートごと）：跳ねはセクション共有・打鍵の揺れ（humanize/seed）と長さを保つ指定（keepDur）は
// そのトラックの content.feel が勝つ。以前は「最初に見つかった feel」1つが全パートに掛かっていた。
const leaf = (kind: string, content: unknown, position = 0): CompositeChild => ({ position, node: { neta: { kind, content, key: 0, mode: "major" } } });
const mel = (n = 16) => ({ notes: Array.from({ length: n }, (_, i) => ({ pitch: 60 + (i % 5), start: i * 0.5, dur: 0.5 })) });
const bass = (n = 8) => ({ notes: Array.from({ length: n }, (_, i) => ({ pitch: 36, start: i, dur: 1 })) });
const only = (ns: Note[], part: string) => ns.filter((n) => n.part === part);
const strip = (ns: Note[]) => ns.map(({ ownFeel: _o, ...n }) => n);

describe("compositeNotes：自前の揺れを持つトラックの音に再生用の印を付ける", () => {
  it("humanize を持つ feel だけ印が付く（跳ねだけの feel・feel 無しは付かない）", () => {
    const ns = compositeNotes([
      leaf("melody", { ...mel(), feel: { humanize: 0.15, seed: 3 } }),
      leaf("bass", { ...bass(), feel: { swing: 0.5 } }),
      leaf("counter", mel(4)),
    ], 0, "major");
    expect(only(ns, "melody").every((n) => n.ownFeel?.humanize === 0.15 && n.ownFeel.seed === 3)).toBe(true);
    expect(ns.filter((n) => n.part !== "melody").every((n) => n.ownFeel === undefined)).toBe(true);
  });
});

describe("applyFeelEnsemble：揺れはパートごと（2026-09-17 オーナー裁定による意図した変更）", () => {
  const children = [
    leaf("bass", { ...bass(), feel: { humanize: 1, seed: 1234, keepDur: true } }),
    leaf("melody", { ...mel(), feel: { humanize: 0.15, seed: 1234 } }),
    leaf("counter", mel(12)), // 自前の feel 無し＝セクション側（最初に見つかった feel）を受ける
  ];
  const ns = compositeNotes(children, 0, "major");
  const ens = feelOfTree(children)!;

  it("印が無い合成は従来と同じ（セクション側の feel で一括）", () => {
    const plain = strip(ns);
    expect(applyFeelEnsemble(plain, ens, { tempo: 96 })).toEqual(applyFeelEnsemble(plain, ens, { tempo: 96 }));
    expect(strip(applyFeelEnsemble(ns.map((n) => (n.part === "bass" ? n : { ...n, ownFeel: undefined })), ens, { tempo: 96 })))
      .toEqual(strip(applyFeelEnsemble(strip(ns), ens, { tempo: 96 })));
  });

  it("メロはセクション側（ベースの 1.0）でなく自分の 0.15 で揺れる", () => {
    const out = applyFeelEnsemble(ns, ens, { tempo: 96 });
    const alone = applyFeelEnsemble(strip(only(ns, "melody")), { humanize: 0.15, seed: 1234 }, { tempo: 96 });
    expect(strip(only(out, "melody"))).toEqual(alone);
    const leaked = applyFeelEnsemble(strip(only(ns, "melody")), ens, { tempo: 96 });
    expect(strip(only(out, "melody"))).not.toEqual(leaked);
  });

  it("自前の feel を持たないパートはセクション側の設定を受ける", () => {
    const out = applyFeelEnsemble(ns, ens, { tempo: 96 });
    expect(strip(only(out, "counter"))).toEqual(applyFeelEnsemble(strip(only(ns, "counter")), ens, { tempo: 96 }));
  });

  it("セクションのノリ行（humanize 0.35・keepDur 無し）でも、ピアノ等の自前の keepDur は落ちない", () => {
    const sec = { humanize: 0.35, seed: 1 };
    const out = applyFeelEnsemble(ns, sec, { tempo: 96 });
    expect(strip(only(out, "bass"))).toEqual(applyFeelEnsemble(strip(only(ns, "bass")), { humanize: 1, seed: 1234, keepDur: true }, { tempo: 96 }));
  });

  it("自前の humanize 0 は「揺らさない」として勝つ・跳ねはセクション共有", () => {
    const kids = [leaf("melody", { ...mel(), feel: { humanize: 0, swing: 0.9 } })];
    const n2 = compositeNotes(kids, 0, "major");
    const out = applyFeelEnsemble(n2, { swing: 0.5, humanize: 0.35, seed: 2 }, { tempo: 96 });
    expect(strip(out)).toEqual(applyFeelEnsemble(strip(n2), { swing: 0.5 }, { tempo: 96 }));
  });
});
