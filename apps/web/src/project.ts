// 複数プロジェクト（prj: 名前空間タグ）の境界ヘルパ（docs/design.md「複数プロジェクト」）。
// プロジェクト所属＝ネタの `prj:<名前>` タグ（多対多）。意味タグ(mood/ジャンル)と同じ
// neta_tag を再利用しつつ、UI では prj: を意味タグ列から外してプロジェクト軸に振り分ける。
export const PROJECT_TAG_PREFIX = "prj:";

export function isProjectTag(t: string): boolean {
  return t.startsWith(PROJECT_TAG_PREFIX);
}

// プロジェクト名 → タグ（"みなそこ" → "prj:みなそこ"）
export function projectTag(name: string): string {
  return PROJECT_TAG_PREFIX + name;
}

// タグ → プロジェクト名（"prj:みなそこ" → "みなそこ"）。prj: でなければそのまま返す。
export function projectName(tag: string): string {
  return isProjectTag(tag) ? tag.slice(PROJECT_TAG_PREFIX.length) : tag;
}
