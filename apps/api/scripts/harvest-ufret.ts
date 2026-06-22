// U-FRET ハーベスト実行部（外部スクレイプ）。アーティスト→曲リスト→各曲→進行ループを neta化。
// 使い方: CM_DB=<path> npx tsx scripts/harvest-ufret.ts "<アーティスト1>" "<アーティスト2>" ...
//   env: CM_SONGS_PER_ARTIST(既定10), CM_HARVEST_DELAY_MS(既定1500), CM_HARVEST_DRYRUN(1=保存しない)
// ToS/負荷配慮：UA明示・リクエスト間 sleep・曲数上限。度数列＋タグ＋出典に正規化＝再現物は作らない。
import { mkdirSync } from "node:fs";
import { dirname } from "node:path";
import { openDb } from "../src/db";
import { Core } from "../src/core";
import { songToProgressions, extractSongTitle } from "../src/ingest-ufret";

const UA = "Mozilla/5.0 (creative_manager personal harvester)";
const DELAY = Number(process.env.CM_HARVEST_DELAY_MS ?? 1500);
const PER = Number(process.env.CM_SONGS_PER_ARTIST ?? 10);
const DRY = process.env.CM_HARVEST_DRYRUN === "1";
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

async function get(url: string): Promise<string> {
  const res = await fetch(url, { headers: { "User-Agent": UA } });
  if (!res.ok) throw new Error(`HTTP ${res.status} ${url}`);
  return res.text();
}

/** アーティスト検索ページから曲ID（song.php?data=）を重複なく先頭 limit 件。 */
async function songIdsFor(artist: string, limit: number): Promise<string[]> {
  const html = await get(`https://www.ufret.jp/search.php?key=${encodeURIComponent(artist)}`);
  const ids: string[] = [];
  const seen = new Set<string>();
  for (const m of html.matchAll(/song\.php\?data=(\d+)/g)) {
    const id = m[1]!;
    if (!seen.has(id)) (seen.add(id), ids.push(id));
    if (ids.length >= limit) break;
  }
  return ids;
}

async function main() {
  const artists = process.argv.slice(2);
  if (!artists.length) {
    console.error('usage: tsx scripts/harvest-ufret.ts "<artist>" ...');
    process.exit(1);
  }
  const dbPath = process.env.CM_DB ?? "./data/cm.sqlite";
  if (dbPath !== ":memory:") mkdirSync(dirname(dbPath), { recursive: true });
  const core = new Core(openDb(dbPath));
  console.log(`harvest: db=${dbPath} per=${PER} delay=${DELAY}ms dryrun=${DRY}`);

  let totalProgs = 0;
  for (const artist of artists) {
    let ids: string[] = [];
    try {
      ids = await songIdsFor(artist, PER);
    } catch (e) {
      console.error(`  [${artist}] 検索失敗: ${(e as Error).message}`);
      continue;
    }
    console.log(`[${artist}] ${ids.length}曲`);
    let made = 0;
    for (const id of ids) {
      await sleep(DELAY);
      try {
        const html = await get(`https://www.ufret.jp/song.php?data=${id}`);
        const url = `https://www.ufret.jp/song.php?data=${id}`;
        const song = extractSongTitle(html) || `song${id}`;
        const progs = songToProgressions(html, { artist, song, url, popular: true });
        for (const p of progs) {
          if (!DRY) core.createNeta(p);
          made++;
        }
      } catch (e) {
        console.error(`    song ${id} 失敗: ${(e as Error).message}`);
      }
    }
    console.log(`  → ${made} 進行${DRY ? "(dryrun)" : ""}`);
    totalProgs += made;
  }
  console.log(`done: ${totalProgs} 進行を${DRY ? "抽出(未保存)" : "neta化"}`);
}

void main();
