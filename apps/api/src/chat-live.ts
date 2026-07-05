// #100 チャットのターン再アタッチ：走行中ターンの stream-json イベントを thread 毎に
// バッファ＋ファンアウトする小さなレジストリ。チャットを閉じて開き直しても「途中から」
// 購読し直せる＝ストリーム切れ対策。完了したターンは履歴(chat_message)へ落ちるので、
// ここからは done を1回流して破棄（メモリに溜めない）。脳は持たない＝ただの中継バッファ。

export type LiveEv = Record<string, unknown>;
type Sub = (e: LiveEv) => void;
interface Turn {
  events: LiveEv[]; // ターン開始以降の全イベント（遅れて来た購読者へのリプレイ用）
  subs: Set<Sub>;
  done: boolean;
}

const turns = new Map<string, Turn>();

/** 購読者に「このターンは完了」を伝える番兵イベント。SSE では `event: done` に変換して閉じる。 */
export const DONE: LiveEv = { type: "__cm_done__" };

/** ターン開始（既存があれば作り直し＝1 thread=1 走行ターン）。 */
export function beginTurn(thread: string): void {
  turns.set(thread, { events: [], subs: new Set(), done: false });
}

/** 1イベントをバッファ＋全購読者へ配布。ターンが無い/完了済みは無視。 */
export function pushTurnEvent(thread: string, e: LiveEv): void {
  const t = turns.get(thread);
  if (!t || t.done) return;
  t.events.push(e);
  for (const s of [...t.subs]) {
    try { s(e); } catch { /* 購読者の死は他に波及させない */ }
  }
}

/** ターン完了：DONE を全購読者へ流し、購読を解いてレジストリから破棄。 */
export function endTurn(thread: string): void {
  const t = turns.get(thread);
  if (!t) return;
  t.done = true;
  for (const s of [...t.subs]) {
    try { s(DONE); } catch { /* noop */ }
  }
  t.subs.clear();
  turns.delete(thread);
}

/** この thread に走行中ターンがあるか。 */
export function isTurnLive(thread: string): boolean {
  const t = turns.get(thread);
  return !!t && !t.done;
}

/**
 * 走行中ターンに購読する。購読と同時に**バッファ済みイベントを即リプレイ**（＝途中参加でも頭から届く）。
 * ターンが無ければ null を返す（呼び手は即 done を返せばよい）。返り値は購読解除関数。
 */
export function attachTurn(thread: string, sub: Sub): (() => void) | null {
  const t = turns.get(thread);
  if (!t) return null;
  for (const e of t.events) {
    try { sub(e); } catch { /* noop */ }
  }
  if (t.done) { try { sub(DONE); } catch { /* noop */ } return () => {}; }
  t.subs.add(sub);
  return () => t.subs.delete(sub);
}
