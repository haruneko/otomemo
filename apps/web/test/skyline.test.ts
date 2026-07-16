import { describe, it, expect } from "vitest";
import { activeLanes } from "../src/components/MiniRoll";

// 積み棒スカイライン（方向C）の素＝子 kind 集合 → 鳴るパート（固定順）。SectionMini と同じ kind→part マップ由来。
describe("activeLanes（鳴るパートを固定順で返す）", () => {
  it("section＝メロ/コード/ベース/リズム等をレーン順（メロ→…→リズム）で返す", () => {
    const layers = activeLanes(["chord", "rhythm", "melody", "bass"], false);
    expect(layers.map((l) => l.label)).toEqual(["メロ", "コード", "ベース", "リズム"]);
  });
  it("落ちサビ＝リズム抜け（ドラム無し）で段が減る＝スカイラインが低くなる", () => {
    const full = activeLanes(["melody", "counter", "chord", "riff", "section_inst", "bass", "rhythm"], false);
    const drop = activeLanes(["melody", "chord", "section_inst"], false); // ドラム/ベース抜き
    expect(full.length).toBeGreaterThan(drop.length);
    expect(drop.map((l) => l.label)).toEqual(["メロ", "コード", "管弦"]);
  });
  it("chord は複数 kind（chord/chord_progression/chord_pattern）を1レーンに畳む", () => {
    expect(activeLanes(["chord_progression"], false).map((l) => l.label)).toEqual(["コード"]);
    expect(activeLanes(["chord_pattern"], false).map((l) => l.label)).toEqual(["コード"]);
  });
  it("song＝構成レーンのみ（section を並べる編成）", () => {
    expect(activeLanes(["section"], true).map((l) => l.label)).toEqual(["構成"]);
    expect(activeLanes([], true)).toEqual([]);
  });
  it("各レーンは色変数（--k-*）を伴う", () => {
    const [melo] = activeLanes(["melody"], false);
    expect(melo!.color).toBe("--k-melody");
  });
});
