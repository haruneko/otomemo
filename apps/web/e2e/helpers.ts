import { type APIRequestContext, type Page, expect } from "@playwright/test";

// 共通ヘルパ（docs/process/e2e-test-plan.md §2.3）。データ独立：接頭辞 ZZE2E- ＋ finally 削除。
export const PREFIX = "ZZE2E";
export const stamp = () => `${PREFIX}-${Date.now()}-${Math.floor(Math.random() * 1e4)}`;

export type Created = { id: string; title: string; kind: string };

export async function createNeta(request: APIRequestContext, data: unknown): Promise<Created> {
  const r = await request.post("/api/neta", { data });
  expect(r.ok(), `createNeta failed: ${r.status()}`).toBeTruthy();
  return (await r.json()) as Created;
}

export async function deleteNeta(request: APIRequestContext, id: string): Promise<void> {
  await request.delete(`/api/neta/${id}`).catch(() => {});
}

export async function cleanup(request: APIRequestContext, ids: string[]): Promise<void> {
  for (const id of ids) await deleteNeta(request, id);
}

// 一覧でネタを開く（編集ペーンが出るまで待つ）。networkidle に頼らず label 待ち。
export async function openNeta(page: Page, title: string): Promise<void> {
  await page.goto("/");
  await page.getByText(title, { exact: false }).first().click();
  await page.getByLabel("edit-neta").waitFor({ timeout: 8000 });
}

// 編集ペーンの再生開始。
export async function play(page: Page): Promise<void> {
  await page.getByLabel("play-pause").click();
}

// 再生ログ（[CMAUDIO]）が note/engine を吐くまで待ってから少し集める。
export async function waitAudio(
  audio: () => string[],
  page: Page,
  ms = 3000,
): Promise<string[]> {
  for (let i = 0; i < 40; i++) {
    if (audio().some((l) => l.includes("note pitch") || l.includes("engine="))) break;
    await page.waitForTimeout(500);
  }
  await page.waitForTimeout(ms);
  return audio();
}

export const engineOf = (logs: string[]) =>
  logs.find((l) => l.includes("engine="))?.match(/engine= (\S+)/)?.[1] ?? "";
export const pitchesOf = (logs: string[]) =>
  logs
    .filter((l) => l.includes("note pitch"))
    .map((l) => Number(l.split("note pitch")[1]?.trim().split(" ")[0]));
export const drumMapOf = (logs: string[]) =>
  logs
    .filter((l) => l.includes(" drum ") && l.includes("->"))
    .map((l) => l.replace(/^.*\] /, "")); // "drum 36 -> Standard Kick 1 @note 60 (root 60 )"
