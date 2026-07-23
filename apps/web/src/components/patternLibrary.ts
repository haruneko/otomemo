import { api, type Neta } from "../api";
// Task1g：3エディタは PatternImportDialog（pick）へ移行し PatternCand 抽象を使わない。この型/写しは
// useMelodyGen 経路（第4消費者・据え置き）のため patternLibrary 内に自足させる（旧 PatternPickerBar への依存を切る）。
export interface PatternCand {
  key: string; // React key＋dedupe キー（型IDが基本・無ければ content JSON）
  name: string; // 型名（型ID or 「おまかせ」）
  scene?: string; // 場面タグ（コード楽器のみ・ドラムは無し）
  audition: () => void; // ▶試聴（消費者が notesForContent→startPlayback を注入）
  apply: () => void; // 適用＝content 置換（onChange・Undo に自然に乗る）
}

// Task2/L3（design「### Task2/L3＝ピッカーをライブラリ検索へ差し替え」）：パターン候補の**出所**を
// 生成器（gen_*）→ネタ帳ライブラリ（scope:"library"）へ移す共通口。「パターンを選ぶ」帯（3単体エディタ）と
// Section 引き出しの候補が、L1 タグ SSOT（`genre:<g>` / `scene:<role>`）で seed 済みライブラリネタを引く。
// **PatternCand 契約・試聴/適用の実音経路は不変**＝ここは source（listNeta）と neta→cand の写しだけ担う。

export const PATTERN_CAND_MAX = 4; // 候補は最大4件（帯/トレイの既存上限）。

// 候補ネタを引く（L1 タグ SSOT）。genre 空（おまかせ）＝scope:"library" 全体からシャッフルN、
// genre 指定＝`genre:<g>` タグで最大N（listNeta の tags は AND 一致＝neta-repo.ts:124-132）。
// seed 未投入なら [] ＝呼び側は空トレイ（design どおり＝従来の域外と同じ・エラーにしない）。
export async function fetchLibraryPatternNetas(kind: string, genre: string): Promise<Neta[]> {
  const tags = genre ? [`genre:${genre}`] : undefined;
  const netas = await api.listNeta({
    kind,
    scope: "library",
    ...(tags ? { tags } : {}),
    limit: genre ? PATTERN_CAND_MAX : 40, // おまかせは広めに引いてシャッフルから N
  });
  return genre ? netas.slice(0, PATTERN_CAND_MAX) : shuffle(netas).slice(0, PATTERN_CAND_MAX);
}

// scene:<role>（適用場面・L1 タグ）を1つ剥がす（コード楽器のみ・任意）。無ければ undefined。
export function sceneTagOf(neta: Neta): string | undefined {
  return neta.tags?.find((t) => t.startsWith("scene:"))?.slice("scene:".length) || undefined;
}

// ライブラリネタ→PatternCand。**content はそのまま audition/apply へ渡す**（ライブラリ原本は読むだけ・不変＝
// copy_neta 不要）。audition/apply は各エディタが既存の notesForContent→startPlayback／onChange 置換を注入する。
export function netaToPatternCand(
  neta: Neta,
  opts: { audition: (content: unknown) => void; apply: (content: unknown) => void; scene?: boolean; fallbackName: string },
): PatternCand {
  const pid = patternIdOf(neta.content);
  return {
    key: neta.id || pid || JSON.stringify(neta.content), // ネタ id が一意キー（dedupe）。
    name: neta.title || pid || opts.fallbackName, // 型名＝ネタ title（seed が型ID＋場面を入れる）。
    scene: opts.scene ? sceneTagOf(neta) : undefined,
    audition: () => opts.audition(neta.content),
    apply: () => opts.apply(neta.content),
  };
}

// content の patternId を探す（chord_pattern/bass=top-level・rhythm={rhythm:{patternId}}）＝名前/キーのフォールバック。
function patternIdOf(content: unknown): string | undefined {
  const c = content as { patternId?: string; rhythm?: { patternId?: string } } | null;
  return c?.patternId ?? c?.rhythm?.patternId ?? undefined;
}

// Fisher–Yates（おまかせのシャッフル）。テストは genre 経路（決定的）と空配列で検証＝シャッフル非決定性に依存しない。
function shuffle<T>(arr: T[]): T[] {
  const a = arr.slice();
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    const tmp = a[i]!;
    a[i] = a[j]!;
    a[j] = tmp;
  }
  return a;
}
