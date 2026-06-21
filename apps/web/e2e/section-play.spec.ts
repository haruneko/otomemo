import { test, expect } from "./fixtures";
import { createNeta, deleteNeta, stamp, waitAudio, engineOf } from "./helpers";

// U10b：section 合成再生（compositeNotes＝子をsection調へ移調＋位置オフセット）が鳴る。
test("section composite playback produces notes via sf2/fallback (U10b)", async ({
  page,
  request,
  logs,
}) => {
  const s = stamp();
  const sec = await createNeta(request, {
    kind: "section",
    title: `${s}-sp`,
    key: 2,
    tempo: 120,
    meter: "4/4",
  });
  const mel = await createNeta(request, {
    kind: "melody",
    title: `${s}-spchild`,
    content: { notes: [{ pitch: 60, start: 0, dur: 4 }] },
  });
  await request.post("/api/compose", { data: { parent: sec.id, child: mel.id, position: 0, ord: 0 } });
  try {
    await page.goto("/");
    await page.getByLabel(`play-${sec.id}`).click();
    await waitAudio(logs.audio, page, 2500);
    expect(["sf2", "fallback-synth"]).toContain(engineOf(logs.audio())); // 経路がある＝鳴る
    // 合成された＝notes>0（playNotes ログ）
    expect(logs.audio().some((l) => /playNotes.*notes= [1-9]/.test(l))).toBe(true);
  } finally {
    await deleteNeta(request, sec.id);
    await deleteNeta(request, mel.id);
  }
});
