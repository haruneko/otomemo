import { test, expect } from "./fixtures";
import { createNeta, deleteNeta, openNeta, stamp, waitAudio, engineOf, drumMapOf } from "./helpers";

// U12/#79：ドラムが GM 標準キットに正しく載る。kick/snare=原音高、hihat closed(42)/open(46)=
// 別noteで区別、tom=GM note(音程差)、crash=Crash Cymbal。フォールバックしない(engine=sf2)。
test("drum kit maps GM notes; hihat close/open distinguished (U12/#79)", async ({
  page,
  request,
  logs,
}) => {
  const list = await (await request.get("/api/assets?kind=soundfont")).json();
  test.skip(!Array.isArray(list) || list.length === 0, "SoundFont 未登録のためスキップ");

  const s = stamp();
  const rh = await createNeta(request, {
    kind: "rhythm",
    title: `${s}-KIT`,
    content: {
      rhythm: {
        steps: 16,
        lanes: [
          { name: "Kick", midi: 36, hits: [0] },
          { name: "Snare", midi: 38, hits: [0] },
          { name: "HHc", midi: 42, hits: [0] },
          { name: "HHo", midi: 46, hits: [0] },
          { name: "Tom", midi: 45, hits: [0] },
          { name: "Crash", midi: 49, hits: [0] },
        ],
      },
    },
  });
  try {
    await openNeta(page, `${s}-KIT`);
    await page.getByLabel("play-pause").click();
    await waitAudio(logs.audio, page, 2500);
    expect(engineOf(logs.audio())).toBe("sf2"); // フォールバックしていない
    const map = drumMapOf(logs.audio()).join("\n");
    // kick/snare はヒューリスティック（#55f 好評の音色）、その他は権威マップ（#55e）
    expect(map).toMatch(/drum 36 -> Standard Kick 1 @note 60/); // kick=好評のKick1@原音高
    expect(map).toMatch(/drum 38 -> Standard Snare 1 @note 60/); // snare=原音高
    expect(map).toMatch(/drum 42 -> Hi-Hats @note 42/); // closed
    expect(map).toMatch(/drum 46 -> Hi-Hats @note 46/); // open（#79：42と別noteで区別）
    expect(map).toMatch(/drum 45 -> Standard Toms @note 45/); // tom=GM note(音程差)
    expect(map).toMatch(/drum 49 -> Crash Cymbal 1 @note 49/); // crash(効果音誤マッチ無し)
  } finally {
    await deleteNeta(request, rh.id);
  }
});
