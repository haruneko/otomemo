import { test, expect } from "./fixtures";
import { createNeta, deleteNeta, openNeta, stamp, play, waitAudio } from "./helpers";

// U14：ネタの音色(program)が SF2 旋律楽器の選択に反映される（program違い→楽器名が変わる）。
test("melody program selects different SF2 instruments (U14)", async ({ page, request, logs }) => {
  const list = await (await request.get("/api/assets?kind=soundfont")).json();
  test.skip(!Array.isArray(list) || list.length === 0, "SoundFont 未登録のためスキップ");

  const s = stamp();
  const piano = await createNeta(request, {
    kind: "melody",
    title: `${s}-PIANO`,
    content: { program: 0, notes: [{ pitch: 60, start: 0, dur: 1 }] },
  });
  const violin = await createNeta(request, {
    kind: "melody",
    title: `${s}-VIOLIN`,
    content: { program: 40, notes: [{ pitch: 60, start: 0, dur: 1 }] },
  });
  try {
    await openNeta(page, `${s}-PIANO`);
    await play(page);
    await waitAudio(logs.audio, page, 1500);
    const p0 = logs.audio().find((l) => l.includes("melodic instrument <-"));

    await openNeta(page, `${s}-VIOLIN`);
    await play(page);
    await waitAudio(logs.audio, page, 1500);
    const p40 = logs
      .audio()
      .reverse()
      .find((l) => l.includes("melodic instrument <-") && l.includes("program 40"));

    expect(p0).toBeTruthy();
    expect(p40).toBeTruthy();
    // program 0 と 40 で別楽器名（例：Grand Piano vs Violin）
    expect(p0).not.toEqual(p40);
    expect(p40).toMatch(/program 40/);
  } finally {
    await deleteNeta(request, piano.id);
    await deleteNeta(request, violin.id);
  }
});
