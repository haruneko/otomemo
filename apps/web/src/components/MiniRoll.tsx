import { useEffect, useRef, useState, type ReactNode } from "react";
import { notesForContent, beatsPerBar } from "../music";
import { api, type Neta, type CompositionNode } from "../api";

// 画面に入ったカードだけプレビューを描画・取得する遅延マウント（perf 耳FB 2026-07-09）。
// 一覧は100枚規模＝全カードが即 SVG描画＋SectionMini の getComposition を撃つと初回展開が数秒重い
// （実測: 一覧4.3s/初回セクション展開2.5s・CPU6倍絞り）。一度可視になったら保持＝再取得のちらつき回避。
// プレースホルダで高さを確保しスクロール飛びを防ぐ。IntersectionObserver 無い環境は即描画にフォールバック。
export function LazyPreview({ children, minHeight = 40 }: { children: ReactNode; minHeight?: number }) {
  const ref = useRef<HTMLDivElement | null>(null);
  const [shown, setShown] = useState(false);
  useEffect(() => {
    if (shown) return;
    const el = ref.current;
    if (!el) return;
    if (typeof IntersectionObserver === "undefined") {
      setShown(true);
      return;
    }
    const io = new IntersectionObserver(
      (ents) => {
        if (ents.some((e) => e.isIntersecting)) {
          setShown(true);
          io.disconnect();
        }
      },
      { rootMargin: "300px 0px" }, // 見える少し手前で先読み描画＝スクロールで空白が見えない
    );
    io.observe(el);
    return () => io.disconnect();
  }, [shown]);
  return (
    <div ref={ref} className="lazy-preview" style={shown ? undefined : { minHeight }}>
      {shown ? children : null}
    </div>
  );
}

// #48: カードにメロ/コード/ベース/リズムの概形（小さなピアノロール）を出す。音楽以外は何も描かない。
// notes を渡すと content の代わりにそれを描く（section/song ブロック＝合成した概形を出す用・#5）。
export function MiniRoll({ neta, notes: given }: { neta: Neta; notes?: import("../music").Note[] }) {
  // 相対bass は単体プレビュー＝neta の key を tonic に解決（#bass S2）。
  // 不正 content 由来の NaN ノートは弾く（NaN が maxT/span に伝播して <rect> が NaN 属性・描画破綻するのを防ぐ・監査 堅牢性）。
  const notes = (given ?? notesForContent(neta.kind, neta.content, { key: neta.key ?? 0 })).filter(
    (n) => Number.isFinite(n.pitch) && Number.isFinite(n.start) && Number.isFinite(n.dur),
  );
  if (!notes.length) return null;
  const W = 160;
  const H = 30;
  const pad = 2;
  const maxT = Math.max(...notes.map((n) => n.start + n.dur), 1);
  const ps = notes.map((n) => n.pitch);
  const lo = Math.min(...ps);
  const hi = Math.max(...ps);
  const range = hi - lo; // 単音/同高(range=0)は下端貼付き＝空箱に見えるので中央寄せにする（frac=0.5）
  return (
    <svg
      className="mini-roll"
      viewBox={`0 0 ${W} ${H}`}
      preserveAspectRatio="none"
      aria-label="mini-preview"
    >
      {notes.map((n, i) => {
        const x = pad + (n.start / maxT) * (W - pad * 2);
        const w = Math.max((n.dur / maxT) * (W - pad * 2), 1.5);
        const frac = range > 0 ? (n.pitch - lo) / range : 0.5; // フラットは中央
        const y = pad + (1 - frac) * (H - pad * 2 - 3);
        return <rect key={i} x={x} y={y} width={w} height={3} rx={1} />;
      })}
    </svg>
  );
}

// ④(2026-07-03) section/song カードの中身プレビュー＝レーン帯のミニ・タイムライン。
// どのパートがどの小節に入ってるかを帯で図示（編集画面タイムラインの縮小版）＋小節数。
// 子は getComposition を表示時に遅延取得（container カードのみ・数は少ない）。
// 各レーンは編集画面タイムラインと同じ種別色で塗る（単色オレンジの壁を避け、パートを見分ける）。
const MINI_LANES: { label: string; kinds: string[]; color: string }[] = [
  { label: "メロ", kinds: ["melody"], color: "--k-melody" },
  { label: "骨格", kinds: ["skeleton"], color: "--k-skeleton" }, // design #20：合成無音だがレーンは見える
  { label: "対旋律", kinds: ["counter"], color: "--k-counter" }, // WP-X3a
  { label: "コード", kinds: ["chord", "chord_progression", "chord_pattern"], color: "--k-chord" },
  { label: "リフ", kinds: ["riff"], color: "--k-riff" }, // WP-X3b
  { label: "管弦", kinds: ["section_inst"], color: "--k-section_inst" }, // WP-X3c
  { label: "ベース", kinds: ["bass"], color: "--k-bass" },
  { label: "リズム", kinds: ["rhythm"], color: "--k-rhythm" },
];
// #5 song カードは「構成（section 帯）」を出す（song は section を並べる編成）。
const SONG_MINI_LANES: { label: string; kinds: string[]; color: string }[] = [
  { label: "構成", kinds: ["section", "song"], color: "--k-section" },
];
const MINI_BARS_CAP = 16; // カードに出す最大小節（超過は帯を切って小節数で示す）

export function SectionMini({ neta }: { neta: Neta }) {
  const [children, setChildren] = useState<CompositionNode["children"] | null>(null);
  useEffect(() => {
    let live = true;
    void api
      .getComposition(neta.id)
      .then((t) => live && setChildren(t?.children ?? []))
      .catch(() => live && setChildren([]));
    return () => {
      live = false;
    };
    // neta オブジェクト依存＝一覧 reload(自動保存/配置後)で新規参照になり再取得＝子の変更がカードに反映される。
  }, [neta]);

  if (!children) return null; // 取得前は何も出さない（レイアウト揺れを避ける）
  if (!children.length) return <p className="section-mini-empty muted">（空・タップで組む）</p>;

  const bpb = beatsPerBar(neta.meter);
  // 子の実長。ネストした section/song は子を再帰で畳む（1小節固定でなく本当の尺・SectionEditor.childDur と同旨）。
  const durOf = (c: CompositionNode["children"][number]): number => {
    const k = c.node.neta.kind;
    if (k === "section" || k === "song") {
      const kids = c.node.children ?? [];
      return kids.length ? Math.max(...kids.map((kc) => kc.position + durOf(kc))) : bpb;
    }
    const ns = notesForContent(k, c.node.neta.content);
    return ns.length ? Math.max(...ns.map((n) => n.start + n.dur)) : bpb;
  };
  const endBeat = Math.max(bpb, ...children.map((c) => c.position + durOf(c)));
  // 不正 content で endBeat/bpb が NaN・Infinity になると new Array(shown) が『Invalid array length』を投げて
  // 一覧全体を白画面に落とす（監査 横断/堅牢性）。有限な正整数に丸める。
  const rawBars = Math.ceil(endBeat / bpb);
  const bars = Number.isFinite(rawBars) ? Math.max(1, rawBars) : 1;
  const shown = Math.min(bars, MINI_BARS_CAP);
  const lanes = (neta.kind === "song" ? SONG_MINI_LANES : MINI_LANES).map((lane) => {
    const cells = new Array(shown).fill(false);
    for (const c of children) {
      if (!lane.kinds.includes(c.node.neta.kind)) continue;
      const s = Math.max(0, Math.floor(c.position / bpb));
      const e = Math.ceil((c.position + durOf(c)) / bpb);
      for (let b = s; b < e && b < shown; b++) cells[b] = true;
    }
    return { label: lane.label, color: lane.color, cells, any: cells.some(Boolean) };
  });
  return (
    <div className="section-mini" aria-label="section-preview">
      {lanes.map((l) => (
        <div
          className={"sm-lane" + (l.any ? "" : " empty")}
          key={l.label}
          style={{ ["--lc" as string]: `var(${l.color})` }}
        >
          <span className="sm-label">{l.label}</span>
          <span className="sm-cells">
            {l.cells.map((on, i) => (
              <span key={i} className={"sm-cell" + (on ? " on" : "")} />
            ))}
          </span>
        </div>
      ))}
      <span className="sm-bars muted">{bars}小節</span>
    </div>
  );
}

// 積み棒スカイライン（方向C）の素＝「どのパートが鳴るか」だけの軽量サマリ。SectionMini のセル格子を描かず
// any（鳴る/鳴らない）だけを固定順で返す純関数。レーン定義(MINI_LANES/SONG_MINI_LANES)は SectionMini と共有
// ＝kind→part マップの SSOT を二重持ちしない。返す順＝レーン順（メロ→…→リズム）。
export function activeLanes(childKinds: readonly string[], isSong: boolean): { label: string; color: string }[] {
  const lanes = isSong ? SONG_MINI_LANES : MINI_LANES;
  return lanes.filter((l) => childKinds.some((k) => l.kinds.includes(k))).map((l) => ({ label: l.label, color: l.color }));
}

// フォームストリップのカード内レイヤ帯＝縦積み棒スカイライン（方向C）。鳴るパートだけを固定順（下=リズム→上=メロ）に積み、
// カードを底揃えで並べると曲のエナジーカーブになる（落ちサビはドラム抜けで低くなる）。子は表示時に遅延取得（SectionMini と同流儀）。
export function SectionSkyline({ neta }: { neta: Neta }) {
  const [children, setChildren] = useState<CompositionNode["children"] | null>(null);
  useEffect(() => {
    let live = true;
    void api
      .getComposition(neta.id)
      .then((t) => live && setChildren(t?.children ?? []))
      .catch(() => live && setChildren([]));
    return () => {
      live = false;
    };
    // neta オブジェクト依存＝reload(配置後/自動保存)で新規参照になり再取得＝編成変更がスカイラインに反映される。
  }, [neta]);
  const layers = activeLanes((children ?? []).map((c) => c.node.neta.kind), neta.kind === "song");
  // 下から積む＝レーン順(メロ…リズム)を逆順に並べ、CSS の column-reverse で最初の子(リズム)を最下段へ。
  return (
    <span className="fs-stack" aria-label="section-skyline">
      {[...layers].reverse().map((l) => (
        <i key={l.label} title={l.label} style={{ ["--c" as string]: `var(${l.color})` }} />
      ))}
    </span>
  );
}
