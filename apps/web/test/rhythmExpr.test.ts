import { describe, it, expect } from "vitest";
import {
  rhythmToNotes,
  rhythmOf,
  laneWithHitToggled,
  laneWithHitVel,
  hitVelState,
  hitVel,
  snapBps,
  drumVel,
  DRUMS,
  type RhythmContent,
  type RhythmLane,
  type Note,
} from "../src/music";

// #29 P0 の pre-change 挙動（step/4・dur 0.25・velCurve/beatsPerStep 無視）を再現した黄金参照。
// velCurve 無し・16分のみのリズムはこれと byte 一致でなければならない。
function oldRhythmToNotes(r: RhythmContent): Note[] {
  return r.lanes.flatMap((l) =>
    l.hits.map((step) => ({
      pitch: l.midi,
      start: step / 4,
      dur: 0.25,
      drum: true,
      vel: drumVel(l.midi, l.vel),
      kit: r.kit,
    })),
  );
}

// velCurve 無し・16分のみの golden コーパス（既定 rhythmOf 含む）。
const GOLDEN: RhythmContent[] = [
  rhythmOf(null), // 既定（空 hits）
  { steps: 16, lanes: [{ name: "Kick", midi: 36, hits: [0, 4, 8, 12] }] },
  {
    steps: 16,
    kit: 24,
    lanes: [
      { name: "Kick", midi: 36, hits: [0, 8] },
      { name: "Snare", midi: 38, hits: [4, 12], vel: 100 },
      { name: "HiHat", midi: 42, hits: [0, 2, 4, 6, 8, 10, 12, 14] },
    ],
  },
  // beatsPerStep=0.25 を明示しても 16 格子は bit 一致（step*0.25===step/4）。
  { steps: 32, beatsPerStep: 0.25, lanes: [{ name: "Kick", midi: 36, hits: [0, 6, 8, 11, 16, 22, 24, 27] }] },
  // 6/8 の 12step は bps=round3(3/12)=0.25＝偶然一致で bit（§1c の正当化）。
  { steps: 12, lanes: [{ name: "HiHat", midi: 42, hits: [0, 3, 6, 9] }] },
];

describe("#29 P0-1 rhythmToNotes bit-identical guard", () => {
  it("velCurve-absent + 16th-only rhythms deepEqual the old formula (golden corpus incl. rhythmOf)", () => {
    for (const r of GOLDEN) expect(rhythmToNotes(r)).toEqual(oldRhythmToNotes(r));
  });

  it("snapBps: undefined→0.25, 0.25 passthrough, 0.333→exact 1/3", () => {
    expect(snapBps(undefined)).toBe(0.25);
    expect(snapBps(0.25)).toBe(0.25);
    expect(snapBps(0.333)).toBeCloseTo(1 / 3, 12);
    expect(snapBps(1 / 3)).toBe(1 / 3);
    expect(snapBps(0.5)).toBe(0.5); // 他はそのまま
  });

  it("12-grid shuffle (beatsPerStep≈1/3) snaps to exact 1/3 and lands on the beat", () => {
    const r: RhythmContent = {
      steps: 12,
      beatsPerStep: 0.333, // genDrums が round3 で保存する値
      lanes: [{ name: "Kick", midi: 36, hits: [0, 3, 6, 9] }],
    };
    const notes = rhythmToNotes(r);
    // 拍頭（step 0/3/6/9）が丁度 0,1,2,3 拍に着地（round3 で 3*(1/3)=1.0）。
    expect(notes.map((n) => n.start)).toEqual([0, 1, 2, 3]);
    expect(notes[0]!.dur).toBeCloseTo(1 / 3, 12);
  });

  it("reads velCurve per hit (fill crescendo survives)", () => {
    const r: RhythmContent = {
      steps: 16,
      lanes: [{ name: "Snare", midi: 38, hits: [0, 4, 8, 12], velCurve: [70, 90, 110, 124] }],
    };
    expect(rhythmToNotes(r).map((n) => n.vel)).toEqual([70, 90, 110, 124]);
  });
});

describe("#29 P0-2 laneWithHitToggled alignment", () => {
  it("velCurve-absent lane: only hits change, no velCurve key grown (bit)", () => {
    const lane: RhythmLane = { name: "Kick", midi: 36, hits: [0, 4] };
    const on = laneWithHitToggled(lane, 2);
    expect(on.turnedOn).toBe(true);
    expect(on.lane).toEqual({ name: "Kick", midi: 36, hits: [0, 2, 4] });
    expect("velCurve" in on.lane).toBe(false);
    const off = laneWithHitToggled(lane, 0);
    expect(off.turnedOn).toBe(false);
    expect(off.lane).toEqual({ name: "Kick", midi: 36, hits: [4] });
  });

  it("keeps velCurve aligned when inserting at a sorted position", () => {
    const lane: RhythmLane = { name: "Snare", midi: 38, hits: [0, 8], velCurve: [70, 124] };
    const r = laneWithHitToggled(lane, 4); // 挿入は index 1
    expect(r.lane.hits).toEqual([0, 4, 8]);
    // 新 index 1 に base(=drumVel Snare 105) が入り、既存 70/124 はズレない。
    expect(r.lane.velCurve).toEqual([70, drumVel(38), 124]);
  });

  it("keeps velCurve aligned when removing a hit", () => {
    const lane: RhythmLane = { name: "Snare", midi: 38, hits: [0, 4, 8], velCurve: [70, 100, 124] };
    const r = laneWithHitToggled(lane, 4); // index 1 除去
    expect(r.lane.hits).toEqual([0, 8]);
    expect(r.lane.velCurve).toEqual([70, 124]);
  });

  it("drops velCurve when it becomes uniform (normalize to minimal content)", () => {
    const base = drumVel(38);
    const lane: RhythmLane = { name: "Snare", midi: 38, hits: [0, 4], velCurve: [base, 124] };
    const r = laneWithHitToggled(lane, 4); // 124 の hit を除去→残り [base]＝一様→削除
    expect(r.lane.hits).toEqual([0]);
    expect("velCurve" in r.lane).toBe(false);
  });

  it("removes divs entry for the removed step (P2 forward-guard)", () => {
    const lane: RhythmLane = { name: "Snare", midi: 38, hits: [0, 4], divs: { "4": 2 } };
    const r = laneWithHitToggled(lane, 4);
    expect("divs" in r.lane).toBe(false);
  });
});

describe("#29 P0-4 laneWithHitVel 3-state mapping", () => {
  const lane: RhythmLane = { name: "Snare", midi: 38, hits: [0, 4] };
  const base = drumVel(38); // 105

  it("accent = min(127, base+18); ghost = 28", () => {
    const acc = laneWithHitVel(lane, 4, "accent");
    expect(acc.velCurve).toEqual([base, base + 18]);
    const gh = laneWithHitVel(lane, 4, "ghost");
    expect(gh.velCurve).toEqual([base, 28]);
  });

  it("accent clamps at 127", () => {
    const loud: RhythmLane = { name: "Kick", midi: 36, hits: [0], vel: 120 };
    expect(laneWithHitVel(loud, 0, "accent").velCurve).toEqual([127]);
  });

  it("normal restores base and drops velCurve when all-uniform (3-state toggle back)", () => {
    const acc = laneWithHitVel(lane, 4, "accent");
    const back = laneWithHitVel(acc, 4, "normal");
    expect("velCurve" in back).toBe(false);
  });

  it("empty (non-hit) cell is a no-op", () => {
    expect(laneWithHitVel(lane, 7, "accent")).toBe(lane);
  });

  it("hitVelState reflects the written state", () => {
    expect(hitVelState(lane, 4)).toBe("normal");
    expect(hitVelState(laneWithHitVel(lane, 4, "accent"), 4)).toBe("accent");
    expect(hitVelState(laneWithHitVel(lane, 4, "ghost"), 4)).toBe("ghost");
  });

  it("hitVel returns effective velocity (velCurve wins over base)", () => {
    const l: RhythmLane = { name: "Snare", midi: 38, hits: [0, 4], velCurve: [70, 124] };
    expect(hitVel(l, 0)).toBe(70);
    expect(hitVel({ name: "Kick", midi: 36, hits: [0] }, 0)).toBe(drumVel(36));
  });
});

// 参照：DRUMS 既定レーンが velCurve 無し＝rhythmOf の golden 対象であることの明示。
it("default DRUMS lanes carry no velCurve", () => {
  expect(DRUMS.every((d) => !("velCurve" in d))).toBe(true);
});
