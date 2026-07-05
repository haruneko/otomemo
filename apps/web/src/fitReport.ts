// 噛み合い診断の一言テキスト（純関数＝テスト可能）。
// analyze_fit の issues は { pos,pitch,type,msg }[]（API: apps/api/src/music/fit.ts）。
// 以前フロントは issues を string[] と誤注釈し `"・"+issues[0]` でオブジェクトを連結＝『[object Object]』になっていた（監査GN-07）。
export type FitIssue = { msg: string };
export function fitReportText(r: { score: number; inChordRate?: number; issues?: FitIssue[] }): string {
  const pct = Math.round((r.inChordRate ?? 0) * 100);
  const verdict = r.score >= 0.75 ? "よく噛み合ってる" : r.score >= 0.5 ? "まあまあ" : "ズレ気味";
  const hint = r.issues?.length ? "・" + (r.issues[0]?.msg ?? "") : "";
  return `噛み合い：${verdict}（コードトーン率 ${pct}%${hint}）`;
}
