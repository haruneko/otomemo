import { useEffect, useRef, useState } from "react";
import { useAlive } from "../poll";
import { api, type Neta, type ChatMessage, type ChatThread, type JobOutcome } from "../api";
import { playNotes, notesForContent } from "../music";
import { MUSIC_KINDS, KIND_LABEL } from "../kinds";
import { MiniRoll } from "./MiniRoll";
import { parseTurnEvent, toolCardFromResult, type ToolCard, type ToolCardItem } from "../chat-stream";

interface Opt {
  title: string;
  body: string;
}
interface Ref {
  title: string;
  artist?: string;
  why?: string;
  points?: string;
}
// #102 S3 既存ネタの変異提案（承認制）。op/target_id/args は worker の判別ユニオンと一致。
interface Proposal {
  op: string;
  target_id: string;
  args?: Record<string, unknown>;
  rationale?: string;
}
interface Msg {
  role: "user" | "ai";
  text?: string;
  options?: Opt[];
  references?: Ref[];
  jobId?: string;
  saveable?: string;
  neta?: Neta; // #68 作成したネタ（開く/試聴リンク用）
  proposals?: Proposal[]; // #102 S3 変異提案（承認カード）
  summary?: string; // #102 S3 提案群の要約
  cards?: ToolCard[]; // #100④-S3b turn 中の tool_use 結果（生成候補/書込）
}
type Mode = "consult" | "research";

// #102 S3 変異 op の表示名
const OP_LABEL: Record<string, string> = {
  update_content: "中身を直す",
  transform: "変形する",
  fit_to: "コードに合わせる",
  place_child: "配置する",
  remove_child: "配置から外す",
  link: "関連づける",
  unlink: "関連を外す",
  delete: "削除する",
};

// 構造系 proposal を1行で説明（content を持たない op 用）。
function describeStructural(op: string, a: Record<string, unknown>): string {
  switch (op) {
    case "place_child":
      return `「${String(a.parent_id ?? "?")}」の子として配置（位置 ${Number(a.position ?? 0)}）`;
    case "remove_child":
      return `「${String(a.parent_id ?? "?")}」の配置から外す`;
    case "link":
      return `「${String(a.to_id ?? "?")}」と関連づける（${String(a.type ?? "related")}）`;
    case "unlink":
      return `「${String(a.to_id ?? "?")}」との関連を外す`;
    case "delete":
      return "このネタを削除する（取り消せません）";
    default:
      return "";
  }
}

// 提案が自動適用可能か（proposal 単体から純粋に決まる＝一括承認のフィルタにも使う）。
// content系は args.content が要る（変形の承認後ルール適用は後続 S4）。構造系は必須 args で判定。
function canApplyProposal(p: Proposal): boolean {
  const a = p.args ?? {};
  if (p.op === "delete") return true;
  if (["update_content", "transform", "fit_to"].includes(p.op)) return !!a.content;
  if (p.op === "place_child" || p.op === "remove_child") return !!a.parent_id;
  if (p.op === "link" || p.op === "unlink") return !!a.to_id;
  return false;
}

type PStatus = "idle" | "applying" | "applied" | "rejected";

// #102 S3 承認カード（controlled）。変更前後をプレビューし、原本 vs 提案を再生して聴いてから承認/却下。
// 適用は承認時のみ＝既存 HTTP 書込（TS core 1箇所）を呼ぶ。書込は agentic では起きない。
function ProposalCard({
  p,
  status,
  onApprove,
  onReject,
}: {
  p: Proposal;
  status: PStatus;
  onApprove: () => void;
  onReject: () => void;
}) {
  const [before, setBefore] = useState<Neta | null>(null);
  useEffect(() => {
    let on = true;
    void api
      .getNeta(p.target_id)
      .then((n) => on && setBefore(n))
      .catch(() => {});
    return () => void (on = false);
  }, [p.target_id]);

  const a = p.args ?? {};
  const afterContent = a.content; // content系のみ（無ければ構造系 or 適用未対応）
  const isMusic = !!before && MUSIC_KINDS.includes(before.kind);
  const label = OP_LABEL[p.op] ?? p.op;
  const targetName = before ? (before.title ?? before.text ?? before.kind) : p.target_id;
  const canApply = canApplyProposal(p);

  function play(content: unknown) {
    if (!before) return;
    void playNotes(notesForContent(before.kind, content, { key: before.key ?? 0 }), before.tempo ?? 120);
  }

  if (status === "applied") return <div className="proposal-card done">✅ {label}：適用しました</div>;
  if (status === "rejected") return <div className="proposal-card done muted">却下しました（{label}）</div>;

  return (
    <div className="proposal-card" aria-label="proposal">
      <div className="proposal-head">
        <strong>{label}</strong>
        <span className="muted">{String(targetName).slice(0, 24)}</span>
      </div>
      {p.rationale && <p className="proposal-why">{p.rationale}</p>}
      {!afterContent && <p className="proposal-desc">{describeStructural(p.op, a)}</p>}
      {isMusic && (
        <div className="proposal-diff">
          <div className="proposal-side">
            <span className="muted">原本</span>
            {before && <MiniRoll neta={before} />}
            <button type="button" className="bs-btn" aria-label="play-before" onClick={() => play(before!.content)}>
              ▶ 原本
            </button>
          </div>
          {!!afterContent && before && (
            <div className="proposal-side">
              <span className="muted">提案</span>
              <MiniRoll neta={{ ...before, content: afterContent } as Neta} />
              <button type="button" className="bs-btn" aria-label="play-after" onClick={() => play(afterContent)}>
                ▶ 提案
              </button>
            </div>
          )}
        </div>
      )}
      <div className="proposal-actions">
        <button
          type="button"
          className="primary"
          aria-label="approve"
          disabled={!canApply || status === "applying"}
          onClick={onApprove}
        >
          {status === "applying" ? "…" : "承認"}
        </button>
        <button type="button" className="bs-btn" aria-label="reject" onClick={onReject}>
          却下
        </button>
      </div>
      {!canApply && <p className="muted proposal-note">この提案の自動適用は未対応です（変形の適用は後続）。</p>}
    </div>
  );
}

// #102 S4 提案グループ。複数提案の状態を束ね、「すべて承認」で適用可能な未処理だけを順に適用。
function ProposalGroup({
  proposals,
  summary,
  onApply,
}: {
  proposals: Proposal[];
  summary?: string;
  onApply: (p: Proposal) => Promise<void>;
}) {
  const [statuses, setStatuses] = useState<PStatus[]>(() => proposals.map(() => "idle"));

  async function approveAt(i: number) {
    setStatuses((s) => s.map((v, k) => (k === i ? "applying" : v)));
    try {
      await onApply(proposals[i]!);
      setStatuses((s) => s.map((v, k) => (k === i ? "applied" : v)));
    } catch {
      setStatuses((s) => s.map((v, k) => (k === i ? "idle" : v)));
    }
  }
  function rejectAt(i: number) {
    setStatuses((s) => s.map((v, k) => (k === i ? "rejected" : v)));
  }
  async function approveAll() {
    for (let i = 0; i < proposals.length; i++) {
      if (statuses[i] === "idle" && canApplyProposal(proposals[i]!)) await approveAt(i);
    }
  }

  // 「すべて承認」は、適用可能で未処理の提案が2件以上あるときだけ出す。
  const pendingAppliable = proposals.filter((p, i) => statuses[i] === "idle" && canApplyProposal(p)).length;

  return (
    <div className="proposals">
      {summary && <div className="chat-text proposals-summary">{summary}</div>}
      {pendingAppliable >= 2 && (
        <button type="button" className="bs-btn proposal-approve-all" aria-label="approve-all" onClick={() => void approveAll()}>
          すべて承認（{pendingAppliable}）
        </button>
      )}
      {proposals.map((p, k) => (
        <ProposalCard
          key={k}
          p={p}
          status={statuses[k] ?? "idle"}
          onApprove={() => void approveAt(k)}
          onReject={() => rejectAt(k)}
        />
      ))}
    </div>
  );
}

// #100④-S3b turn 中の tool 結果カード。候補（generate/fit…）＝試聴＋保存／書込（capture）＝開く＋取り消す(可逆)。
function ChatToolCard({
  card,
  onOpen,
  onSaveItem,
  onUndo,
}: {
  card: ToolCard;
  onOpen: (neta: Neta) => void;
  onSaveItem: (it: ToolCardItem) => Promise<void>;
  onUndo: (id: string) => Promise<void>;
}) {
  const [saved, setSaved] = useState<Set<number>>(new Set());
  const [undone, setUndone] = useState(false);

  if (card.klass === "candidate" && card.items && card.items.length > 0) {
    return (
      <div className="tool-card" aria-label="candidate-card">
        <div className="tool-card-head muted">{card.label}＝候補</div>
        {card.items.map((it, k) => {
          const isMusic = MUSIC_KINDS.includes(it.kind);
          return (
            <div key={k} className="tool-card-item">
              <span className="muted">{KIND_LABEL[it.kind] ?? it.kind}</span>
              {isMusic && <MiniRoll neta={{ id: "", kind: it.kind, content: it.content } as Neta} />}
              {isMusic && (
                <button
                  type="button"
                  className="bs-btn"
                  aria-label="play-candidate"
                  onClick={() => void playNotes(notesForContent(it.kind, it.content, { key: 0 }), 120)}
                >
                  ▶ 試聴
                </button>
              )}
              <button
                type="button"
                className="bs-btn"
                aria-label="save-candidate"
                disabled={saved.has(k)}
                onClick={() => void onSaveItem(it).then(() => setSaved((s) => new Set(s).add(k)))}
              >
                {saved.has(k) ? "保存しました" : "保存"}
              </button>
            </div>
          );
        })}
      </div>
    );
  }
  if (card.klass === "write" && card.neta?.id) {
    const neta = card.neta;
    const kindLabel = KIND_LABEL[neta.kind ?? ""] ?? neta.kind ?? "ネタ";
    return (
      <div className="tool-card" aria-label="write-card">
        <div className="tool-card-head">
          {kindLabel} を{card.tool === "capture" ? "作成" : "更新"}しました
        </div>
        <div className="chat-neta-actions">
          <button type="button" className="bs-btn" aria-label="open-card-neta" onClick={() => onOpen(neta as Neta)}>
            ✎ 開く
          </button>
          {card.tool === "capture" && !undone && (
            <button
              type="button"
              className="bs-btn"
              aria-label="undo-card"
              onClick={() => void onUndo(neta.id!).then(() => setUndone(true))}
            >
              ↩ 取り消す
            </button>
          )}
          {undone && <span className="muted">取り消しました</span>}
        </div>
      </div>
    );
  }
  return null;
}

// 相談（docs/design.md #19/#20）。target 付きで開くと「このネタについての相談」になり、
// 最初の提案を自動で出す。案は Chat 上で選んでネタ化（from_job で対象に紐づく）。
export function Chat({
  target,
  onChanged,
  onClose,
  onOpenNeta,
}: {
  target?: Neta;
  onChanged?: () => void;
  onClose: () => void;
  onOpenNeta?: (neta: Neta) => void; // #68 ネタを開く（Chatは閉じる）
}) {
  const [msgs, setMsgs] = useState<Msg[]>([]);
  const [input, setInput] = useState("");
  const [mode, setMode] = useState<Mode>("consult");
  const [busy, setBusy] = useState(false);
  // 待ち中の進捗（subtask 完了/総数・経過秒）。null=非ワーカー待ち。UX：止まってる不安を解消。
  const [waitInfo, setWaitInfo] = useState<{ done: number; total: number; sec: number } | null>(null);
  const cancelWait = useRef(false); // 「待たずに戻る」で立てる＝waitForJob を打ち切り入力を解放（裏で続行）。
  const [thinkSec, setThinkSec] = useState(0); // 「考え中」(分解前 planning)の経過秒＝沈黙の不安を解消。
  const [thinkLabel, setThinkLabel] = useState(""); // #99 実況：job.progress（「メロを作ってる」等）。空=ラベル無し。
  const [streamText, setStreamText] = useState(""); // #100④-S3 常駐 claude の途中テキスト（ストリーミング表示）。
  const [liveCards, setLiveCards] = useState<ToolCard[]>([]); // #100④-S3b turn 中に出た候補/書込カード（確定でメッセージへ畳む）。
  const [inflight, setInflight] = useState(0); // 裏で実行中のジョブ数（リロードで待ち状態が消えても可視化）。
  const [loaded, setLoaded] = useState(false); // #70 履歴ロード完了（自動初回提案はこの後）
  const started = useRef(false);
  const alive = useAlive(); // ワーカー待ちは長い＝閉じた後に setState しないためのガード（poll.ts 共通）

  // busy の間（特に分解前の「考え中」planning）に経過秒を刻む＝無進捗の沈黙をなくす。
  useEffect(() => {
    if (!busy) {
      setThinkSec(0);
      setThinkLabel("");
      return;
    }
    setThinkSec(0);
    const t = setInterval(() => setThinkSec((s) => s + 1), 1000);
    return () => clearInterval(t);
  }, [busy]);

  // 待ち中にリロードすると待ち状態(busy/waitInfo)が消える。実行中ジョブを定期確認してバナー表示＝
  // 「まだ動いてるのか不明」をなくす。0に戻ったら一覧を更新（結果が reap されてトレイ📥/ネタ帳へ）。
  useEffect(() => {
    let on = true;
    let prev = 0;
    const check = async () => {
      try {
        const [q, r] = await Promise.all([api.listJobs({ status: "queued" }), api.listJobs({ status: "running" })]);
        if (!on) return;
        const n = q.length + r.length;
        if (prev > 0 && n === 0) onChanged?.(); // 実行中→0：結果が届いた→ネタ帳/トレイ更新
        prev = n;
        setInflight(n);
      } catch {
        /* ネットワーク揺れは無視 */
      }
    };
    void check();
    const t = setInterval(check, 4000);
    return () => {
      on = false;
      clearInterval(t);
    };
  }, [onChanged]);
  // 複数会話セッション（フリーChatのみ。Claude/ChatGPT風に作って切替/見返す）。
  const [sessionId, setSessionId] = useState(() =>
    target ? "" : (localStorage.getItem("cm-chat-session") ?? "global"),
  );
  const [showSessions, setShowSessions] = useState(false);
  const [sessions, setSessions] = useState<ChatThread[]>([]);

  const targetLabel = target ? (target.title ?? target.text ?? "(無題)") : null;

  // #70 スレッド＝対象ネタ id（無ければフリーChatの会話セッションid）。
  const thread = target?.id ?? sessionId;

  // #70 永続化（後退ゼロ）：保存に失敗してもメモリだけで従来どおり動く。
  // 構造化ペイロード（options/references/neta/jobId/saveable）は data へ畳む。
  function persistMsg(m: Msg) {
    const { role, text, ...rest } = m;
    const data = Object.keys(rest).length ? rest : undefined;
    const kind = m.proposals
      ? "proposals"
      : m.options
        ? "options"
        : m.references
          ? "research"
          : m.neta
            ? "content"
            : "chat";
    void api.addChatMessage(thread, { role, kind, text: text ?? null, data }).catch(() => {});
  }
  // 保存しつつ画面にも積む（送受信の両方でこれを使う）。
  function pushMsg(m: Msg) {
    setMsgs((prev) => [...prev, m]);
    persistMsg(m);
  }

  // サーバのスレッド履歴から再描画（生成結果は reaper がサーバ側で記録済＝クライアント非依存・fb-3）。
  async function reloadMsgs() {
    try {
      const rows = await api.listChatMessages(thread);
      if (!alive.current) return;
      setMsgs(
        rows.map((r) => ({
          role: r.role === "user" ? "user" : "ai",
          text: r.text ?? undefined,
          ...((r.data as Partial<Msg>) ?? {}),
        })),
      );
    } catch {
      /* 取得失敗＝現状維持 */
    }
  }

  // #70 開いたとき該当スレッドの履歴を復元（失敗＝空のまま＝従来挙動）。
  // セッション切替でも thread が変わり、ここで一旦クリア→復元する。
  useEffect(() => {
    let alive = true;
    setMsgs([]);
    started.current = false;
    setLoaded(false);
    void api
      .listChatMessages(thread)
      .then((rows: ChatMessage[]) => {
        if (!alive || rows.length === 0) return;
        setMsgs(
          rows.map((r) => ({
            role: r.role === "user" ? "user" : "ai",
            text: r.text ?? undefined,
            ...((r.data as Partial<Msg>) ?? {}),
          })),
        );
        started.current = true; // 復元したら自動初回提案は出さない（二重防止）
      })
      .catch(() => {})
      .finally(() => {
        if (alive) setLoaded(true);
      });
    return () => {
      alive = false;
    };
  }, [thread]);

  // #100④-S3 ディスパッチ：consult は常駐 claude（SSE）／research は当面 旧ジョブ経路（フォールバック）。
  async function run(text: string) {
    if (mode === "consult") return runStream(text);
    return runJob(text);
  }

  // #100④-S3 常駐 claude に1ターン。stream-json を逐次描画し、result（or 最後の text）を AI 発言として確定。
  // 脳は Claude＝自然文＋ツール選択。書込(capture/revise/assemble)は事前承認済で可逆（#100 a）。
  async function runStream(text: string) {
    pushMsg({ role: "user", text });
    setBusy(true);
    setStreamText("");
    setThinkLabel("");
    setLiveCards([]);
    const toolNames = new Map<string, string>(); // tool_use id → name（tool_result と突合）
    const cards: ToolCard[] = [];
    let acc = "";
    let finalText = "";
    let errored = false;
    try {
      await api.chatTurnStream(thread, text, (ev) => {
        if (!alive.current) return;
        for (const a of parseTurnEvent(ev as Parameters<typeof parseTurnEvent>[0])) {
          if (a.kind === "text") { acc = a.text; setStreamText(acc); }
          else if (a.kind === "tool") { setThinkLabel(a.label); if (a.id) toolNames.set(a.id, a.name); }
          else if (a.kind === "toolResult") {
            const name = a.id ? toolNames.get(a.id) : undefined;
            if (name) {
              const card = toolCardFromResult(name, a.payload);
              // 読取(search/analyze)はカードにしない＝実況のみ。候補/書込だけ見せる。
              if (card.klass !== "read" && (card.items?.length || card.neta)) { cards.push(card); setLiveCards([...cards]); }
            }
          } else if (a.kind === "result") { finalText = a.text; errored = a.isError; }
        }
      });
    } catch {
      errored = true;
    } finally {
      setStreamText("");
      setThinkLabel("");
      setLiveCards([]);
      setBusy(false);
    }
    const out = finalText || acc;
    if (out || cards.length) {
      pushMsg({ role: "ai", text: out || undefined, saveable: out || undefined, cards: cards.length ? cards : undefined });
    } else {
      pushMsg({ role: "ai", text: errored ? "うまくいきませんでした（もう一度試してください）" : "（応答がありませんでした）" });
    }
    onChanged?.();
  }

  // #100④-S3b カードの操作：候補を保存（capture 相当）／書込を取り消す（可逆・undo）。
  async function saveCandidate(it: ToolCardItem) {
    await api.createNeta({ kind: it.kind, content: it.content });
    onChanged?.();
  }
  async function undoWrite(id: string) {
    await api.deleteNeta(id);
    onChanged?.();
  }

  async function runJob(text: string) {
    pushMsg({ role: "user", text });
    setBusy(true);
    try {
      const ctx = target ? (target.title ?? target.text ?? "") : "";
      const intent = mode === "research" ? "research" : "consult";
      // chat_thread を渡す＝生成結果を**サーバ側で**このスレッドに記録（クライアント離脱でも残る・fb-3）。
      const params =
        mode === "research"
          ? { topic: text, chat_thread: thread }
          : { context: ctx, instruction: text, target_kind: target?.kind, chat_thread: thread };
      const job = await api.createJob({ intent, target_neta_id: target?.id, params });
      // 予算は worker の agentic timeout(240s) を覆う＝180tick×1.5s=270s。
      // 以前は 80tick=120s で **ジョブ完了前にUIが降り無言で消えた**（#99 固まる正体）。
      const MAX_TICKS = 180;
      for (let i = 0; i < MAX_TICKS; i++) {
        const j = await api.getJob(job.id);
        if (j.status === "done") {
          if (mode === "research") {
            const r = j.result as { summary?: string; references?: Ref[] } | null;
            const summary = r?.summary ?? "";
            const references = Array.isArray(r?.references) ? r!.references : [];
            pushMsg({ role: "ai", text: summary, saveable: summary, references, jobId: job.id });
          } else {
            await handleConsult(j.result, job.id); // #61 判別ユニオン
          }
          return;
        }
        if (j.status === "failed") {
          pushMsg({ role: "ai", text: j.error ?? "失敗しました" });
          return;
        }
        // #99 実況：worker が書いた「今なにしてるか」を表示（無進捗の沈黙をなくす）。
        if (alive.current) setThinkLabel(typeof j.progress === "string" ? j.progress : "");
        await new Promise((r) => setTimeout(r, 1500));
      }
      // #99 予算超過：無言で消さない。裏で続行＝結果は reaper がこのスレッドに残す（fb-3）。
      pushMsg({
        role: "ai",
        text: "まだ処理中です…このまま続けます。できたらこのチャットと受信箱 📥 に届きます（閉じても大丈夫）。",
      });
    } finally {
      setBusy(false);
    }
  }

  // ディスパッチ後もこのチャットで完了を待つ（受信箱お任せをやめる）。jobOutcome を
  // settled になるまでポーリングし、reap interval(5s) がネタ化するまで少し猶予して返す。
  // 待ち中は busy のまま＝入力ロック（「待ち中は話せなくてよい」要望どおり）。
  async function waitForJob(jobId: string): Promise<JobOutcome | null> {
    let last: JobOutcome | null = null;
    let settledAt = -1;
    cancelWait.current = false;
    setWaitInfo({ done: 0, total: 1, sec: 0 });
    for (let i = 0; i < 200 && alive.current; i++) {
      if (cancelWait.current) return null; // 「待たずに戻る」＝裏で続行・トレイで受け取る
      await new Promise((r) => setTimeout(r, 1500));
      let o: JobOutcome;
      try {
        o = await api.jobOutcome(jobId);
      } catch {
        continue; // ネットワーク揺れは次tickで再試行
      }
      last = o;
      // 進捗を可視化：subtask の 完了(done+failed)/総数 ＋ 経過秒。「止まってる不安」を解消。
      const total = Math.max(1, o.jobs.length);
      const done = o.jobs.filter((j) => j.status === "done" || j.status === "failed").length;
      if (alive.current) setWaitInfo({ done, total, sec: Math.round((i + 1) * 1.5) });
      if (o.settled) {
        if (settledAt < 0) settledAt = i;
        // 終端後、reap がネタ化するのを最大 ~6tick(≈9s) 待つ。ネタが出たら即返す。
        if (o.neta.length > 0 || o.failed > 0 || i - settledAt >= 6) return o;
      } else {
        settledAt = -1;
      }
    }
    return last;
  }

  // ワーカー待ちの決着をチャットに反映：できたネタをインライン表示（開く/試聴）。
  async function finishWait(o: JobOutcome | null) {
    setWaitInfo(null); // 進捗表示を消す
    if (!alive.current) return;
    if (cancelWait.current) {
      cancelWait.current = false;
      // 「待たずに戻る」：ジョブは裏で続行→結果はサーバがこのスレッドに記録（次回開いても残る）。
      pushMsg({ role: "ai", text: "バックグラウンドで続けています。できたらここと受け取りトレイ 📥 に届きます。" });
      return;
    }
    // 生成結果は reaper が**サーバ側で**このスレッドに記録済み＝サーバ履歴から再描画（クライアント
    // 待ち中に離脱/リロードしても結果が必ずチャットに残る・fb-3）。
    await reloadMsgs();
    onChanged?.();
    if (o && o.neta.length === 0 && o.failed > 0) pushMsg({ role: "ai", text: "生成に失敗しました" });
    else if (!o) pushMsg({ role: "ai", text: "完了確認がタイムアウト（結果は届き次第ここに出ます／トレイ 📥）" });
  }

  // #61 consult の判別ユニオン: chat / options / content(生成→正しいkindでネタ化) / plan
  async function handleConsult(result: unknown, jobId: string) {
    const r = result as {
      type?: string;
      text?: string;
      options?: Opt[];
      neta_kind?: string;
      content?: unknown;
      plan?: string;
      items?: unknown[];
      proposals?: Proposal[];
      summary?: string;
    } | null;
    if (r?.type === "proposals") {
      // #102 S3 既存ネタの変異提案。**適用せず承認カードを出す**（承認で初めて書込）。
      const props = Array.isArray(r.proposals) ? r.proposals : [];
      if (props.length === 0) {
        pushMsg({ role: "ai", text: "提案を作れませんでした。もう少し具体的だと提案できます。" });
      } else {
        pushMsg({ role: "ai", proposals: props, summary: r.summary, jobId });
      }
    } else if (r?.type === "options") {
      pushMsg({ role: "ai", options: r.options ?? [], jobId });
    } else if (r?.type === "items") {
      // #86 S2b agentic：ツールで作った一式。materialize は server(reap)が担う。
      // 受信箱お任せにせず、このチャットで reap 完了を待ってネタをインライン表示する。
      pushMsg({ role: "ai", text: "パーツを仕上げています…" });
      await finishWait(await waitForJob(jobId));
    } else if (r?.type === "content" && r.neta_kind) {
      const neta = await api.createNeta({ kind: r.neta_kind, content: r.content, from_job: jobId });
      onChanged?.();
      const label = KIND_LABEL[r.neta_kind] ?? r.neta_kind;
      pushMsg({ role: "ai", text: `「${label}」を作りました`, neta });
    } else if (r?.type === "plan") {
      // おまかせ＝子ジョブに分解。受信箱お任せにせず、このチャットで子の完了まで待つ。
      pushMsg({ role: "ai", text: `${r.plan ?? "分解しました"}（仕上げています…）` });
      await finishWait(await waitForJob(jobId));
    } else {
      const t = r?.text ?? "";
      pushMsg({ role: "ai", text: t, saveable: t || undefined });
    }
  }

  async function send() {
    const text = input.trim();
    if (!text || busy) return;
    setInput("");
    await run(text);
  }

  // 対象付きで開いたら最初の提案を自動で出す
  useEffect(() => {
    if (loaded && target && !started.current) {
      started.current = true;
      void run("この内容を発展させる方向性の案を出して");
    }
  }, [target, loaded]);

  async function pick(o: Opt, jobId?: string) {
    const neta = await api.createNeta({
      kind: target?.kind ?? "knowledge", // #61 other 廃止（無targetは知見として）
      title: o.title || undefined,
      text: o.body,
      from_job: jobId,
    });
    onChanged?.();
    pushMsg({ role: "ai", text: `「${o.title || "案"}」をネタ化しました`, neta });
  }

  // #102 S3 承認時の適用＝既存 HTTP 書込を op ごとに呼ぶ（TS core 1箇所）。
  async function applyProposal(p: Proposal) {
    const a = p.args ?? {};
    switch (p.op) {
      case "update_content":
      case "transform":
      case "fit_to":
        if (a.content) await api.updateNeta(p.target_id, { content: a.content });
        break;
      case "place_child":
        await api.placeChild(String(a.parent_id), p.target_id, Number(a.position ?? 0));
        break;
      case "remove_child":
        await api.removeChild(String(a.parent_id), p.target_id);
        break;
      case "link":
        await api.link(p.target_id, String(a.to_id), a.type ? String(a.type) : undefined);
        break;
      case "unlink":
        await api.unlink(p.target_id, String(a.to_id), a.type ? String(a.type) : undefined);
        break;
      case "delete":
        await api.deleteNeta(p.target_id);
        break;
    }
    onChanged?.();
  }

  // #68 ネタを開く＝Chatを閉じて編集画面へ
  function openNeta(neta: Neta) {
    onOpenNeta?.(neta);
    onClose();
  }
  // #68 試聴プレビュー（音楽kindのみ）
  function preview(neta: Neta) {
    // 相対bass は neta の key を tonic に解決して試聴（#bass S2）。
    void playNotes(notesForContent(neta.kind, neta.content, { key: neta.key ?? 0 }), neta.tempo ?? 120);
  }

  async function saveKnowledge(text: string) {
    await api.createNeta({ kind: "knowledge", text });
    onChanged?.();
    pushMsg({ role: "ai", text: "知見として保存しました" });
  }

  // #9 参考曲を1曲だけ reference ネタとして保存
  async function saveRef(r: Ref, jobId?: string) {
    const body = [r.why, r.points].filter(Boolean).join("\n");
    await api.createNeta({
      kind: "reference",
      title: r.artist ? `${r.title} / ${r.artist}` : r.title,
      text: body,
      content: { references: [r] },
      from_job: jobId,
    });
    onChanged?.();
    pushMsg({ role: "ai", text: `参考曲「${r.title}」を保存しました` });
  }

  // #70 履歴クリア（サーバ＋画面）。失敗してもメモリだけクリア＝従来挙動。
  function clearHistory() {
    setMsgs([]);
    void api.clearChatThread(thread).catch(() => {});
  }

  // 会話セッション：一覧を開く／新規作成／切替（フリーChatのみ）。
  function openSessions() {
    setShowSessions(true);
    void api.listChatThreads().then(setSessions).catch(() => {});
  }
  function pickSession(id: string) {
    localStorage.setItem("cm-chat-session", id);
    setSessionId(id);
    setShowSessions(false);
  }
  function newSession() {
    const id = "chat:" + (crypto.randomUUID?.() ?? Date.now().toString(36));
    pickSession(id);
  }

  return (
    <div className="dialog-backdrop" onClick={onClose}>
      <div className="dialog chat" role="dialog" aria-label="chat" onClick={(e) => e.stopPropagation()}>
        <header>
          <div className="chat-mode">
            <button className={mode === "consult" ? "on" : ""} onClick={() => setMode("consult")}>
              相談
            </button>
            <button className={mode === "research" ? "on" : ""} onClick={() => setMode("research")}>
              調べる
            </button>
          </div>
          <div className="chat-actions">
            {!target && (
              <>
                <button aria-label="sessions" title="会話一覧" onClick={openSessions}>
                  ☰
                </button>
                <button aria-label="new-session" title="新しい会話" onClick={newSession}>
                  ＋
                </button>
              </>
            )}
            <button aria-label="clear-history" title="履歴を消す" onClick={clearHistory}>
              🗑
            </button>
            <button aria-label="close" onClick={onClose}>
              ✕
            </button>
          </div>
        </header>
        {showSessions && !target && (
          <div className="chat-sessions" role="dialog" aria-label="chat-sessions">
            <div className="chat-sessions-head">
              <strong>会話</strong>
              <button onClick={newSession}>＋ 新しい会話</button>
              <button aria-label="close-sessions" onClick={() => setShowSessions(false)}>
                ✕
              </button>
            </div>
            {sessions.length === 0 && <p className="muted">まだ会話がありません</p>}
            {sessions.map((s) => (
              <button
                key={s.thread}
                type="button"
                className={"chat-session-item" + (s.thread === thread ? " on" : "")}
                onClick={() => pickSession(s.thread)}
              >
                <span className="chat-session-title">
                  {s.preview ?? (s.thread === "global" ? "(最初の会話)" : "(無題の会話)")}
                </span>
                <span className="muted">{new Date(s.last).toLocaleString()} · {s.count}</span>
              </button>
            ))}
          </div>
        )}
        {targetLabel && <div className="chat-target">「{targetLabel.slice(0, 30)}」についての相談</div>}
        {/* リロード等で待ち状態が消えても、裏で動いてるジョブを可視化（待ちか不明をなくす）。 */}
        {inflight > 0 && !busy && (
          <div className="chat-inflight" aria-label="inflight">
            🔄 {inflight}件 実行中…（できたら受け取りトレイ 📥 とネタ帳に届きます）
          </div>
        )}
        <div className="chat-log">
          {msgs.length === 0 && (
            <p className="muted">
              {mode === "research"
                ? "調べたいことを入力（参考曲・手法など）"
                : "相談・発展・「コード進行作って」「一式そろえて」など何でも"}
            </p>
          )}
          {msgs.map((m, i) => (
            <div key={i} className={"chat-msg " + m.role}>
              {m.text && <div className="chat-text">{m.text}</div>}
              {m.proposals && (
                <ProposalGroup proposals={m.proposals} summary={m.summary} onApply={applyProposal} />
              )}
              {m.cards?.map((card, k) => (
                <ChatToolCard key={k} card={card} onOpen={openNeta} onSaveItem={saveCandidate} onUndo={undoWrite} />
              ))}
              {m.saveable && (
                <button type="button" className="bs-btn" onClick={() => void saveKnowledge(m.saveable!)}>
                  知見化
                </button>
              )}
              {m.options && (
                <div className="bs-options">
                  {m.options.map((o, k) => (
                    <button
                      key={k}
                      type="button"
                      className="bs-option"
                      onClick={() => void pick(o, m.jobId)}
                    >
                      <strong>{o.title || "案"}</strong>
                      <span>{o.body}</span>
                    </button>
                  ))}
                </div>
              )}
              {m.references && m.references.length > 0 && (
                <div className="ref-list">
                  {m.references.map((r, k) => (
                    <div key={k} className="ref-card">
                      <div className="ref-head">
                        <strong>{r.title}</strong>
                        {r.artist && <span className="ref-artist">{r.artist}</span>}
                      </div>
                      {r.why && <p className="ref-why">{r.why}</p>}
                      {r.points && <p className="ref-points">{r.points}</p>}
                      <button
                        type="button"
                        className="bs-btn"
                        aria-label={`save-ref-${k}`}
                        onClick={() => void saveRef(r, m.jobId)}
                      >
                        参考曲を保存
                      </button>
                    </div>
                  ))}
                </div>
              )}
              {m.neta && (
                <div className="chat-neta-actions">
                  <button
                    type="button"
                    className="bs-btn"
                    aria-label="open-neta"
                    onClick={() => openNeta(m.neta!)}
                  >
                    ✎ 開く
                  </button>
                  {MUSIC_KINDS.includes(m.neta.kind) && (
                    <button
                      type="button"
                      className="bs-btn"
                      aria-label="preview-neta"
                      onClick={() => preview(m.neta!)}
                    >
                      ▶ 試聴
                    </button>
                  )}
                </div>
              )}
            </div>
          ))}
          {busy && (streamText || liveCards.length > 0) && (
            <div className="chat-msg ai" aria-label="streaming">
              {streamText && <div className="chat-text">{streamText}</div>}
              {liveCards.map((card, k) => (
                <ChatToolCard key={k} card={card} onOpen={openNeta} onSaveItem={saveCandidate} onUndo={undoWrite} />
              ))}
            </div>
          )}
          {busy && (
            <div className="chat-msg ai" aria-label="thinking">
              {waitInfo ? (
                // ワーカー待ち：進捗(完了/総数・経過秒)＋「待たずに戻る」。止まってる不安と拘束を解消。
                <div className="chat-wait">
                  <div className="chat-text thinking">
                    仕上げています{waitInfo.total > 1 ? ` ${waitInfo.done}/${waitInfo.total}` : ""}
                    <span className="dots" aria-hidden="true" />
                    <span className="wait-sec"> {waitInfo.sec}s</span>
                  </div>
                  {waitInfo.total > 1 && (
                    <div className="wait-bar" aria-hidden="true">
                      <div className="wait-bar-fill" style={{ width: `${(waitInfo.done / waitInfo.total) * 100}%` }} />
                    </div>
                  )}
                  <button
                    className="wait-cancel"
                    aria-label="stop-waiting"
                    onClick={() => (cancelWait.current = true)}
                  >
                    待たずに戻る（裏で続行）
                  </button>
                </div>
              ) : (
                // 分解前(planning)：経過秒＋不確定バーで「動いてる」ことを示す（沈黙の不安を解消）。
                <div className="chat-wait">
                  <div className="chat-text thinking">
                    {thinkLabel || "考え中"}
                    <span className="dots" aria-hidden="true" />
                    <span className="wait-sec"> {thinkSec}s</span>
                  </div>
                  <div className="wait-bar" aria-hidden="true">
                    <div className="wait-bar-indet" />
                  </div>
                </div>
              )}
            </div>
          )}
        </div>
        <div className="chat-input">
          <input
            aria-label="chat-input"
            placeholder={busy ? "待ち中（待たずに戻れます）…" : mode === "research" ? "調べる…" : "相談を入力…"}
            value={input}
            disabled={busy} // 待ち中はこのチャットをロック（要望どおり）
            onChange={(e) => setInput(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter") void send();
            }}
          />
          <button onClick={() => void send()} disabled={busy}>
            {busy ? "…" : "送信"}
          </button>
        </div>
      </div>
    </div>
  );
}
