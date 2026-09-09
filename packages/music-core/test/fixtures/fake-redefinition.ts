// 陰性対照の材料（テスト専用・どこからも import されない）。
// 「api か web が music-core と同名の関数を自前で持ってしまった」状態を模したファイル。
// verify-shared-single-impl.test.ts の走査がこれを必ず検出することで、番人が空振りでないことを示す。
export function splitMora(kana: string): string[] {
  return [...kana]; // わざと違う実装（1文字1モーラ＝拗音が壊れる）
}
const chordPcs = (root: number): number[] => [root, root + 4, root + 7];
export const useFake = (): number[] => chordPcs(0);
