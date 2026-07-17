import { useSyncExternalStore } from "react";
import { subscribeSfLoading, isSfLoading, subscribeSfPreparing, isSfPreparing } from "./audio";

// F1 再生ローディング表示の共有フック（設計2026-07-17・「漏れ5画面」）。
// TransportBar と同じグローバルストア（audio.ts の subscribeSfLoading / subscribeSfPreparing）を
// useSyncExternalStore で購読し、「音源読込中…」＞「楽器準備中…」の優先順位で1本の文言 or null を返す。
// TransportBar が無い自前 play ボタンの画面（ネタ一覧/Chat/骨格の机/アナリーゼ/StudyView）で使い回す＝
// 新機構ゼロ・購読ロジックの5コピーを1本に集約（DRY）。参照実装＝TransportBar.tsx:39-43。
export function usePrepPending(): string | null {
  const sfLoading = useSyncExternalStore(subscribeSfLoading, isSfLoading, () => false);
  const sfPreparing = useSyncExternalStore(subscribeSfPreparing, isSfPreparing, () => false);
  // 優先順位「音源読込中…（SF2本体）」＞「楽器準備中…（sampler初出ロード）」。TransportBar と同文言。
  return sfLoading ? "音源読込中…" : sfPreparing ? "楽器準備中…" : null;
}

// F1 の見た目の語彙を踏襲した準備中チップ（.sf-loading）。グローバルの SF2/sampler 準備テキストを出す。
// null（準備なし）は何も描かない＝従来 markup 完全一致。押下直後のローカルなフィードバック（fetch 待ち等の
// スピナー）は各画面の play ボタン側が担う（本チップはグローバル状態のみ）。
export function PrepStatus() {
  const text = usePrepPending();
  if (text == null) return null;
  return (
    <span className="sf-loading" role="status" aria-label="prep-status" title="再生の準備中">
      {text}
    </span>
  );
}
