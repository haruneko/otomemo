import { test, expect, type APIRequestContext } from "@playwright/test";

// 実機(実ブラウザ)で再生経路を横断検証：フォールバックしてないか／音高が正しいか／
// ドラムがGM標準キットに載るか。診断ログ [CMAUDIO]（localStorage cm.debugAudio=1）を読む。
// SoundFont が無い環境では「フォールバックで必ず鳴る（後退ゼロ）」を検証する。

type Created = { id: string; title: string };

async function makeNeta(request: APIRequestContext, data: unknown): Promise<Created> {
  const r = await request.post("/api/neta", { data });
  return (await r.json()) as Created;
}

// ネタを開いて再生し、[CMAUDIO] ログを集める
async function playAndCollect(page: import("@playwright/test").Page, title: string): Promise<string[]> {
  const logs: string[] = [];
  const onMsg = (m: { text(): string }) => {
    const t = m.text();
    if (t.includes("[CMAUDIO]")) logs.push(t);
  };
  page.on("console", onMsg);
  await page.goto("/");
  await page.waitForLoadState("networkidle");
  await page.waitForTimeout(1200); // initSoundFont 自己修復
  await page.getByText(title, { exact: false }).first().click();
  await page.getByLabel("edit-neta").waitFor({ timeout: 5000 });
  await page.getByLabel("play-pause").click();
  for (let i = 0; i < 40; i++) {
    if (logs.some((l) => l.includes("note pitch") || l.includes("engine="))) break;
    await page.waitForTimeout(500);
  }
  await page.waitForTimeout(3500);
  page.off("console", onMsg);
  return logs;
}

const engineOf = (logs: string[]) => (logs.find((l) => l.includes("engine="))?.match(/engine= (\S+)/)?.[1] ?? "");
const pitchesOf = (logs: string[]) =>
  logs.filter((l) => l.includes("note pitch")).map((l) => Number(l.split("note pitch")[1]?.trim().split(" ")[0]));

test.beforeEach(async ({ page }) => {
  await page.addInitScript(() => localStorage.setItem("cm.debugAudio", "1"));
});

test("melody plays the exact input pitches (no半音ズレ) and never silently drops to nothing", async ({
  page,
  request,
}) => {
  const mel = await makeNeta(request, {
    kind: "melody",
    title: "ZZAUDIO-MEL",
    content: { program: 0, notes: Array.from({ length: 12 }, (_, i) => ({ pitch: 60 + i, start: i * 0.2, dur: 0.2 })) },
  });
  const logs = await playAndCollect(page, mel.title);
  // フォールバックでも sf2 でも、送られた音高は入力と完全一致（半音ズレなし）
  expect(pitchesOf(logs)).toEqual([60, 61, 62, 63, 64, 65, 66, 67, 68, 69, 70, 71]);
  // ロード失敗が出ていないこと（SoundFont選択時）
  expect(logs.some((l) => l.includes("sfLastError= Invalid"))).toBe(false);
  await request.delete(`/api/neta/${mel.id}`);
});

test("chord expands to correct triads (Cmaj=C E G, Am=A C E)", async ({ page, request }) => {
  const ch = await makeNeta(request, {
    kind: "chord_progression",
    title: "ZZAUDIO-CH",
    content: {
      chords: [
        { root: 0, quality: "", start: 0, dur: 2 },
        { root: 9, quality: "m", start: 2, dur: 2 },
      ],
    },
  });
  const logs = await playAndCollect(page, ch.title);
  expect(pitchesOf(logs)).toEqual([60, 64, 67, 69, 72, 76]);
  await request.delete(`/api/neta/${ch.id}`);
});

test("when a SoundFont is selected, playback uses sf2 (not fallback) and drums map to a GM kit", async ({
  page,
  request,
}) => {
  const list = await (await request.get("/api/assets?kind=soundfont")).json();
  test.skip(!Array.isArray(list) || list.length === 0, "SoundFont 未登録のためスキップ");

  const rh = await makeNeta(request, {
    kind: "rhythm",
    title: "ZZAUDIO-RH",
    content: {
      rhythm: {
        steps: 16,
        lanes: [
          { name: "Kick", midi: 36, hits: [0, 8] },
          { name: "Snare", midi: 38, hits: [4, 12] },
          { name: "HiHat", midi: 42, hits: [0, 4, 8, 12] },
        ],
      },
    },
  });
  const logs = await playAndCollect(page, rh.title);
  expect(engineOf(logs)).toBe("sf2"); // フォールバックしていない
  // kick/snare/hihat が SF2 ドラムに載っている（簡易キットに落ちていない）
  const drumLine = logs.find((l) => l.includes("drumKits=")) ?? "";
  expect(drumLine).toContain("36");
  expect(drumLine).toContain("38");
  expect(drumLine).toContain("42");
  await request.delete(`/api/neta/${rh.id}`);
});

test("a deleted/stale SoundFont selection self-heals to a valid one (no永久fallback)", async ({ page, request }) => {
  const list = await (await request.get("/api/assets?kind=soundfont")).json();
  test.skip(!Array.isArray(list) || list.length === 0, "SoundFont 未登録のためスキップ");

  await page.addInitScript(() => localStorage.setItem("cm.soundfont", "stale-deadbeef-0000-0000-000000000000"));
  await page.goto("/");
  await page.waitForLoadState("networkidle");
  await page.waitForTimeout(1500);
  const healed = await page.evaluate(() => localStorage.getItem("cm.soundfont"));
  expect(healed).not.toBe("stale-deadbeef-0000-0000-000000000000");
  expect(list.some((a: { id: string }) => a.id === healed)).toBe(true);
});
