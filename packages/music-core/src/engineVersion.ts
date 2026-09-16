// phrase_maker 由来エンジンの版（M0契約 §2 `engine: { version: string }`／同 §3-2 の 3）。
// 正典＝docs/archive/2026-08-20-phrasemaker-M0-contract.md §2・§3-2 の 3／design.md 追補 (k)。
//
// なぜ刻むか：移植エンジンは**バッサリ更新していく**（旧レゾルバを残さない・告知機構も作らない）。
// 版はゴールデン回帰と決定性の識別のためだけに残す＝「同一 (入力, seed, engineVersion) → 同一出力」の
// 固定条件の1つ（M0契約 §6③）。旧音に戻したい時は git 履歴から考え直す（ソロ利用ゆえ告知不要）。
//
// 置き場＝`rngSalt.ts` の隣（凍結される横断定数はここに集める＝計画 §5-2 M3 の「着手前に決めた5点」の5）。
//
// ⚠ **載せ方の鉄則**＝**phrase_maker 由来の新経路を実際に使ったときだけ** content に `engine:{version}` を載せる。
//    既定経路（従来の genBass/genDrums/…）は**キーを生やさない**＝既存出力と bit 一致（design.md 追補 (k)）。
//
// 版の刻み方：出音が変わり得る移植を入れたら上げる（patch=不変・minor=出音が変わり得る）。
export const PM_ENGINE_VERSION = "pm-1.0.0";

/** content へ載せる `engine` ブロック（新経路使用時のみ）。形は M0契約 §2 に合わせる。 */
export function pmEngineTag(): { version: string } {
  return { version: PM_ENGINE_VERSION };
}
