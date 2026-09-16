// 繰り返しに変奏の層（design.md 追補 (k-7)・2026-09-16 オーナー裁定・設計案 docs/drafts/2026-09-15-riff-variation-layer-design.md）。
//
// 何を：2小節（32 step）の表を貼る**2回目以降の反復単位**に、古典的なモチーフ変換（docs/research/2026-08-02-riff-structure-and-variation.md B-1）を
//   決定的に当てる。**動かすのは答句（pickup/answer/blue/climb の単音）だけ**＝頭・ペダル・刻み・リズムの格子は変えない（B-6「軸を1本だけ壊す」）。
// どこで：表を敷いたあと・錨（キックのロック）の**前**。ベースの錨経路とギターのリフ経路が同じ関数を呼ぶ。
// 入力は表ではなく「役割つきオンセット列を反復単位で束ねたもの」＝規則生成（案4）が同じ形を出せばそのまま使える。
//
// **変換は登録口（`RIFF_VARIATION_LEVERS`）で持つ**。2026-09-16 裁定「リズムのずらしは研究を先に」により v1 は**音高と間だけ**。
//   リズムの変換は研究の結論が出たら、レバーを1本ここへ登録し `riffVariationSchedule` に名前を足すだけ（additive）。
// **変換の組み合わせ・強さ・階段・向きの規則はすべて「仮」**＝耳で決まる値（物差しはオーナー）。
//
// 決定的＝乱数・時刻・hash を使わない。seed は (i) ゼクエンツの向き (ii) reselect の回転 にだけ使う。入力は破壊しない。

export type RiffCellKind = "accent" | "note" | "ghost" | "dead";
export type RiffVoicing = "mono" | "power" | "power8";

/** 役割つきオンセット（楽器非依存。deg はルートからの半音＝ベースは度数トークンを半音へ写して渡す）。 */
export interface RiffCell {
  /** 反復単位内の step（0..31） */
  step: number;
  kind: RiffCellKind;
  deg: number;
  anchor: boolean;
  role: string;
  voicing?: RiffVoicing;
}

/** 反復単位（2小節の貼り付け1枚）。index 0＝提示＝決して触らない。 */
export interface RiffTile {
  index: number;
  cells: RiffCell[];
  last: boolean;
}

export type RiffVariationLevel = 0 | 0.5 | 1;

export interface RiffVariationOpts {
  /** なし／中／多め */
  level: RiffVariationLevel;
  seed: number;
  /** 手を出さない global step（＝index×32＋step）。錨の候補地＝キック */
  protectedSteps: ReadonlySet<number>;
  /** 装飾レバーの中身が違う */
  instrument: "bass" | "guitar";
  /** 既定＝リフ語彙の階段 `RIFF_LADDER`（仮） */
  ladder?: readonly number[];
  /** スケジュールの差し替え（変異検査と将来の追加の口）。未指定＝`riffVariationSchedule` */
  schedule?: (level: RiffVariationLevel, index: number, last: boolean) => string[];
}

export interface RiffVariationReport {
  tiles: { index: number; levers: string[]; changed: number }[];
}

/** 反復単位の長さ（文法は2小節×16分）。 */
export const RIFF_TILE_STEPS = 32;
/** リフ語彙の階段 `[R, b3, 4, b5, 5, b7, 8]`（仮・研究 A-3）。 */
export const RIFF_LADDER: readonly number[] = [0, 3, 5, 6, 7, 10, 12];
/** 全セルが端で動けなかった時に回す候補（源流 `diverge` の reselect・仮）。 */
export const RIFF_RESELECT: readonly number[] = [7, 10, 12, 5];

const ANSWER_ROLES = new Set(["pickup", "answer", "blue", "climb"]);
const PEDAL_ROLES = new Set(["pedal", "chug"]);

export interface RiffLeverCtx {
  tile: RiffTile;
  opts: RiffVariationOpts;
  ladder: readonly number[];
}
/** 変換1本＝セル列 → セル列（入力を破壊しない純関数）。 */
export type RiffLever = (cells: readonly RiffCell[], ctx: RiffLeverCtx) => RiffCell[];

const mod = (a: number, n: number): number => ((a % n) + n) % n;
const isProtected = (ctx: RiffLeverCtx, step: number): boolean => ctx.opts.protectedSteps.has(ctx.tile.index * RIFF_TILE_STEPS + step);
/** 答句＝anchor でない・役割が pickup/answer/blue/climb（ギターは単音も条件）。 */
export function isRiffAnswerCell(c: RiffCell, instrument: "bass" | "guitar"): boolean {
  return !c.anchor && ANSWER_ROLES.has(c.role) && (instrument !== "guitar" || c.voicing === "mono");
}
const answerCells = (cells: readonly RiffCell[], ctx: RiffLeverCtx): RiffCell[] =>
  cells.filter((c) => isRiffAnswerCell(c, ctx.opts.instrument)).sort((a, b) => a.step - b.step);
/** 向き（仮）＝(seed + index) が奇数なら上。 */
const directionUp = (ctx: RiffLeverCtx): boolean => mod(ctx.opts.seed + ctx.tile.index, 2) === 1;
/**
 * 拡大・装飾の基準＝後半小節の最初の答句（無ければ前半小節の最初の答句）。
 * **反復単位の元のセル（レバーを当てる前）で決める**＝拡大が answer に変えたセルを頭と取り違えない。音高は今のセル列から引く。
 */
function answerHead(cells: readonly RiffCell[], ctx: RiffLeverCtx): RiffCell | null {
  const ans = answerCells(ctx.tile.cells, ctx);
  const h = ans.find((c) => c.step >= 16) ?? ans[0];
  return h ? cells.find((c) => c.step === h.step) ?? null : null;
}

/** ゼクエンツ（仮）：答句の各セルを階段で1段（端で止まる）。全部止まったら reselect で1音は必ず変える。 */
const sequenceLever: RiffLever = (cells, ctx) => {
  const up = directionUp(ctx);
  const out = cells.map((c) => ({ ...c }));
  const targets = out.filter((c) => isRiffAnswerCell(c, ctx.opts.instrument) && !isProtected(ctx, c.step)).sort((a, b) => a.step - b.step);
  let moved = 0;
  for (const c of targets) {
    const next = up ? ctx.ladder.find((d) => d > c.deg) : [...ctx.ladder].reverse().find((d) => d < c.deg);
    if (next === undefined) continue;
    c.deg = next;
    moved++;
  }
  if (moved === 0 && targets.length > 0) {
    const first = targets[0]!;
    const r = mod(ctx.opts.seed, RIFF_RESELECT.length);
    const order = [...RIFF_RESELECT.slice(r), ...RIFF_RESELECT.slice(0, r)];
    const pick = order.find((d) => d !== first.deg);
    if (pick !== undefined) first.deg = pick;
  }
  return out;
};

/** 断片化（仮）：小節ごとに答句の頭1セルだけ残す。ギターは残した頭より後の同じ小節の ghost/dead も落とす（本当の空白）。 */
const fragmentLever: RiffLever = (cells, ctx) => {
  const drop = new Set<RiffCell>();
  for (const bar of [0, 1]) {
    const ans = answerCells(cells, ctx).filter((c) => Math.floor(c.step / 16) === bar);
    if (ans.length === 0) continue;
    const head = ans[0]!;
    for (const c of ans.slice(1)) if (!isProtected(ctx, c.step)) drop.add(c);
    if (ctx.opts.instrument === "guitar") {
      for (const c of cells) {
        if ((c.kind === "ghost" || c.kind === "dead") && !c.anchor && Math.floor(c.step / 16) === bar && c.step > head.step && !isProtected(ctx, c.step)) drop.add(c);
      }
    }
  }
  return cells.filter((c) => !drop.has(c)).map((c) => ({ ...c }));
};

/** 拡大（仮）：答句の頭を含む拍の直前1拍のペダル／刻みを answer に変え、階段で頭へ1段ずつ近づける。 */
const expandLever: RiffLever = (cells, ctx) => {
  const out = cells.map((c) => ({ ...c }));
  const head = answerHead(out, ctx);
  if (!head) return out;
  const beatStart = Math.floor(head.step / 4) * 4;
  const win = out.filter((c) => c.step >= beatStart - 4 && c.step < beatStart && PEDAL_ROLES.has(c.role)
    && (c.kind === "note" || c.kind === "accent") && !c.anchor && !isProtected(ctx, c.step)).sort((a, b) => a.step - b.step);
  let hIdx = 0;
  for (let i = 0; i < ctx.ladder.length; i++) if (ctx.ladder[i]! <= head.deg) hIdx = i;
  win.forEach((c, i) => {
    c.role = "answer";
    c.deg = ctx.ladder[Math.max(0, hIdx - (win.length - i))]!;
    if (ctx.opts.instrument === "guitar") c.voicing = "mono";
  });
  return out;
};

/** 装飾（仮・楽器別）：ギター＝頭の小節の ghost/dead を外し頭の1 step 前に ghost を1つ／ベース＝頭より前の最後のペダルをオクターブ上。 */
const ornamentLever: RiffLever = (cells, ctx) => {
  const head = answerHead(cells, ctx);
  if (!head) return cells.map((c) => ({ ...c }));
  if (ctx.opts.instrument === "guitar") {
    const bar = Math.floor(head.step / 16);
    const out = cells.filter((c) => !((c.kind === "ghost" || c.kind === "dead") && !c.anchor && Math.floor(c.step / 16) === bar && !isProtected(ctx, c.step)))
      .map((c) => ({ ...c }));
    const g = head.step - 1;
    if (g >= bar * 16 && !out.some((c) => c.step === g) && !isProtected(ctx, g)) {
      out.push({ step: g, kind: "ghost", deg: 0, anchor: false, role: "dead", voicing: "mono" });
    }
    return out.sort((a, b) => a.step - b.step);
  }
  const out = cells.map((c) => ({ ...c }));
  const ped = out.filter((c) => c.role === "pedal" && c.kind === "note" && !c.anchor && c.deg === 0 && c.step < head.step && !isProtected(ctx, c.step))
    .sort((a, b) => b.step - a.step)[0];
  if (ped) ped.deg = 12;
  return out;
};

/**
 * 変換の登録口。**名前 → 純関数**。リズムの変換（研究中）は結論が出たらここへ足す。
 * ⚠ ここに足しただけでは鳴らない＝`riffVariationSchedule` に名前を入れた段だけで効く（既定の出音を守る）。
 */
export const RIFF_VARIATION_LEVERS: Readonly<Record<string, RiffLever>> = {
  sequence: sequenceLever,
  fragment: fragmentLever,
  expand: expandLever,
  ornament: ornamentLever,
};

/**
 * 段ごとに当てるレバー（**仮**＝試聴帳で耳が決める）。多めは中を含む（入れ子）。
 * | 反復単位 | なし | 中 | 多め |
 * | 0（提示） | — | — | — |
 * | 奇数・最後でない | — | sequence | sequence＋ornament |
 * | 偶数≥2・最後でない | — | — | fragment |
 * | 最後（≥1） | — | sequence | sequence＋expand＋ornament |
 */
export function riffVariationSchedule(level: RiffVariationLevel, index: number, last: boolean): string[] {
  if (level === 0 || index === 0) return [];
  if (level === 0.5) return last || index % 2 === 1 ? ["sequence"] : [];
  if (last) return ["sequence", "expand", "ornament"];
  return index % 2 === 1 ? ["sequence", "ornament"] : ["fragment"];
}

/** 変奏量を 0／0.5／1 の最寄りへ（同距離は小さい方）。数でなければ 0。rounded＝入力と違った。 */
export function normalizeRiffVariationLevel(x: unknown): { level: RiffVariationLevel; rounded: boolean } {
  if (typeof x !== "number" || !Number.isFinite(x)) return { level: 0, rounded: true };
  const cand: RiffVariationLevel[] = [0, 0.5, 1];
  let best: RiffVariationLevel = 0;
  for (const c of cand) if (Math.abs(c - x) < Math.abs(best - x)) best = c;
  return { level: best, rounded: best !== x };
}

const cellKey = (c: RiffCell): string => `${c.step}|${c.kind}|${c.deg}|${c.anchor}|${c.role}|${c.voicing ?? ""}`;
function countChanged(a: readonly RiffCell[], z: readonly RiffCell[]): number {
  const ka = new Map(a.map((c) => [c.step, cellKey(c)])), kz = new Map(z.map((c) => [c.step, cellKey(c)]));
  let n = 0;
  for (const s of new Set([...ka.keys(), ...kz.keys()])) if (ka.get(s) !== kz.get(s)) n++;
  return n;
}

/** 変奏の層本体。level 0・提示（index 0）はセルの写しをそのまま返す（恒等）。 */
export function varyRiffTiles(tiles: readonly RiffTile[], opts: RiffVariationOpts): { tiles: RiffTile[]; report: RiffVariationReport } {
  const ladder = opts.ladder ?? RIFF_LADDER;
  const schedule = opts.schedule ?? riffVariationSchedule;
  const report: RiffVariationReport = { tiles: [] };
  const out = tiles.map((tile) => {
    const copy = tile.cells.map((c) => ({ ...c }));
    const levers = tile.index === 0 ? [] : schedule(opts.level, tile.index, tile.last);
    if (levers.length === 0) {
      report.tiles.push({ index: tile.index, levers: [], changed: 0 });
      return { index: tile.index, last: tile.last, cells: copy };
    }
    let cells: RiffCell[] = copy;
    for (const name of levers) {
      const lever = RIFF_VARIATION_LEVERS[name];
      if (!lever) continue;
      cells = lever(cells, { tile, opts, ladder });
    }
    cells = cells.map((c, i) => [c, i] as const).sort((a, b) => (a[0].step - b[0].step) || (a[1] - b[1])).map(([c]) => c);
    report.tiles.push({ index: tile.index, levers, changed: countChanged(tile.cells, cells) });
    return { index: tile.index, last: tile.last, cells };
  });
  return { tiles: out, report };
}
