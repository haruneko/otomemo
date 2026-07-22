// プロジェクト＝一曲(or組曲)の器の「画面」（Claude Projects 風ランディング・メインペーン埋め込み）。
// 上＝この曲について会話を始める起点、下＝会話/曲・セクション（左）とファイル＝知識（右）。
// 要件「一曲（または組曲）の器にまとめる」/ design「プロジェクト＝…ホーム」。データは既存テーブルの読み。
import { useCallback, useEffect, useRef, useState } from "react";
import { useDismiss } from "../useDismiss";
import { api, type Neta, type ProjectFile, type ChatThread, type Project, type Job } from "../api";
import { projectTag } from "../project";
import { Icon } from "./Icon";

function fileSize(n: number | null): string {
  if (n == null) return "";
  if (n < 1024) return `${n} B`;
  if (n < 1024 * 1024) return `${Math.round(n / 1024)} KB`;
  return `${(n / (1024 * 1024)).toFixed(1)} MB`;
}

// ジョブ状態のラベル（投げて受け取るの可視化）。絵文字は □ 化するので色ドット＋テキストで表す。
const JOB_STATUS: Record<string, string> = {
  queued: "待機",
  running: "実行中",
  waiting: "確認待ち",
  done: "完了",
  failed: "失敗",
};

export function ProjectScreen({
  project,
  onOpenNeta,
  onOpenSession,
  onStartChat,
  onCreateSong,
  onDeleted,
}: {
  project: string;
  onOpenNeta: (neta: Neta) => void;
  onOpenSession: (thread: string) => void;
  onStartChat: (seed: string) => void; // この曲についての新規会話を始める（seed=最初の一言・空可）
  onCreateSong: () => void; // 器の中で曲を新規に組む（左レールに戻らず完結）
  onDeleted?: () => void; // 器を削除した後（ホームへ戻る・一覧更新）
}) {
  const [songs, setSongs] = useState<Neta[]>([]); // kind=song/section
  const [files, setFiles] = useState<ProjectFile[]>([]);
  const [sessions, setSessions] = useState<ChatThread[]>([]);
  const [jobs, setJobs] = useState<Job[]>([]);
  const [seed, setSeed] = useState("");
  const [meta, setMeta] = useState<Project | null>(null);
  const [editing, setEditing] = useState(false); // 説明・指示の編集パネル開閉
  const [descDraft, setDescDraft] = useState("");
  const [instrDraft, setInstrDraft] = useState("");
  const [importing, setImporting] = useState(false); // 未仕分け会話の取り込みパネル
  const importRef = useRef<HTMLElement>(null);
  useDismiss(importRef, importing, useCallback(() => setImporting(false), [])); // 外タップ/Escで閉じる
  const [unsorted, setUnsorted] = useState<ChatThread[]>([]);

  // 器の中身（曲/ファイル/会話/ジョブ）を読み直す。変更操作（改名/削除）後にも呼ぶ。
  const loadContent = useCallback(async () => {
    try {
      const [netas, fs, th, js] = await Promise.all([
        api.listNeta({ tags: [projectTag(project)] }),
        api.listProjectFiles(project),
        api.listChatThreads(project),
        api.listProjectJobs(project),
      ]);
      setSongs(netas.filter((n) => n.kind === "song" || n.kind === "section"));
      setFiles(fs);
      setSessions(th);
      setJobs(js);
    } catch {
      /* 取得失敗＝現状維持 */
    }
  }, [project]);

  useEffect(() => {
    let alive = true;
    void loadContent();
    void api
      .getProject(project)
      .then((pm) => {
        if (!alive) return;
        setMeta(pm);
        setDescDraft(pm.description ?? "");
        setInstrDraft(pm.instructions ?? "");
      })
      .catch(() => {});
    return () => {
      alive = false;
    };
  }, [project, loadContent]);

  async function saveMeta() {
    try {
      const pm = await api.setProject(project, { description: descDraft, instructions: instrDraft });
      setMeta(pm);
      setEditing(false);
    } catch {
      /* 失敗＝編集のまま */
    }
  }

  // 会話セッションの改名／削除（器の中で完結）。
  async function renameSession(s: ChatThread) {
    const name = window.prompt("会話のタイトル", s.title ?? s.preview ?? "")?.trim();
    if (name == null) return;
    await api.setChatThread(s.thread, { title: name }).catch(() => {});
    await loadContent();
  }
  async function deleteSession(s: ChatThread) {
    if (!window.confirm(`会話「${s.title ?? s.preview ?? "(無題)"}」を削除します。取り消せません。`)) return;
    await api.deleteChatThread(s.thread).catch(() => {});
    await loadContent();
  }
  async function deleteFile(f: ProjectFile) {
    if (!window.confirm(`ファイル「${f.name ?? f.id}」を削除します。取り消せません。`)) return;
    await api.deleteAsset(f.id).catch(() => {});
    await loadContent();
  }

  // 未仕分け（どの器にも属さない）会話の取り込み：一覧を開く→選んで今の器へ束ねる。
  async function openImport() {
    setImporting(true);
    try {
      const all = await api.listChatThreads(); // 器指定なし＝全フリーChat
      setUnsorted(all.filter((t) => !t.project)); // project=null＝未仕分けのみ
    } catch {
      setUnsorted([]);
    }
  }
  async function importSession(t: ChatThread) {
    await api.setChatThread(t.thread, { project }).catch(() => {});
    setImporting(false);
    await loadContent();
  }

  function start() {
    onStartChat(seed.trim());
    setSeed("");
  }

  // 器を削除＝所属タグを外すだけ（ネタは消えず未仕分けに残る）。中身があれば件数を明示して確認。
  async function deleteProject() {
    const n = songs.length;
    const warn =
      `プロジェクト「${project}」を削除します。\n` +
      (n > 0
        ? `中の曲・パーツ(${n}件+)は削除されず「未仕分け」に残ります（プロジェクトのラベルと説明だけ消えます）。`
        : "（説明・指示だけの空のプロジェクトです。ネタは影響しません。）");
    if (!window.confirm(warn)) return;
    await api.deleteProject(project).catch(() => {});
    onDeleted?.();
  }

  return (
    <div className="project-screen" aria-label="project-screen">
      <div className="ps-titlebar">
        <h2 className="ps-title">
          <Icon name="home" size={22} /> {project}
        </h2>
        <button className="ps-edit" aria-label="edit-project" onClick={() => setEditing((v) => !v)}>
          {editing ? "閉じる" : "編集"}
        </button>
      </div>
      {!editing && meta?.description && <p className="ps-desc">{meta.description}</p>}
      {!editing && meta?.instructions && (
        <p className="ps-instr muted" title="このプロジェクトでの会話に効く指示">
          <Icon name="pin" size={15} /> {meta.instructions}
        </p>
      )}

      {editing && (
        <div className="ps-meta-edit" aria-label="project-meta-edit">
          <label>
            説明（この曲はどんな曲か・メモ）
            <textarea
              aria-label="project-description"
              rows={2}
              value={descDraft}
              onChange={(e) => setDescDraft(e.target.value)}
              placeholder="例：切ない疾走感のミドルバラード。サビで一気に上がる。"
            />
          </label>
          <label>
            AIへの指示（このプロジェクトの会話に常に効く）
            <textarea
              aria-label="project-instructions"
              rows={3}
              value={instrDraft}
              onChange={(e) => setInstrDraft(e.target.value)}
              placeholder="例：キーはAm。サビは上行で締める。コードは王道進行を避けて少しひねる。"
            />
          </label>
          <div className="ps-meta-actions">
            <button className="primary" onClick={() => void saveMeta()}>
              保存
            </button>
            <button
              className="ps-delete"
              aria-label="delete-project"
              title="このプロジェクトを削除（ネタは未仕分けに残る）"
              onClick={() => void deleteProject()}
            >
              プロジェクトを削除
            </button>
          </div>
        </div>
      )}

      {/* 起点：この曲について会話を始める（Claude Projects のチャット入力にあたる主役） */}
      <form
        className="ps-starter"
        onSubmit={(e) => {
          e.preventDefault();
          start();
        }}
      >
        <input
          aria-label="start-chat"
          placeholder={`「${project}」について相談・続きを書く…`}
          value={seed}
          onChange={(e) => setSeed(e.target.value)}
        />
        <button type="submit" className="primary" aria-label="start-chat-go">
          ↑
        </button>
      </form>

      <div className="ps-grid">
        <div className="ps-main">
          {jobs.length > 0 && (
            <section className="ps-block" aria-label="jobs">
              <h3>進行中・受け取り <span className="muted">{jobs.length}</span></h3>
              <ul className="ps-list">
                {jobs.map((j) => (
                  <li key={j.id}>
                    <div className="ps-job">
                      <span className="ph-title">{j.instruction ?? j.intent}</span>
                      <span className="muted">
                        <span className={"job-dot " + j.status} aria-hidden="true" />
                        {JOB_STATUS[j.status] ?? j.status}
                        {j.progress ? ` · ${j.progress}` : ""}
                      </span>
                    </div>
                  </li>
                ))}
              </ul>
            </section>
          )}

          <section className="ps-block" aria-label="sessions" ref={importRef}>
            <h3 className="ps-block-head">
              <span>会話 <span className="muted">{sessions.length}</span></span>
              <button type="button" className="ps-add" aria-label="import-session" onClick={() => void openImport()}>
                ＋取り込む
              </button>
            </h3>
            {importing && (
              <div className="ps-import" aria-label="import-panel">
                <div className="ps-import-head">
                  <span className="muted">未仕分けの会話を選んでこのプロジェクトへ</span>
                  <button type="button" aria-label="close-import" onClick={() => setImporting(false)}>
                    ✕
                  </button>
                </div>
                {unsorted.length === 0 && <p className="muted">取り込める未仕分けの会話はありません</p>}
                <ul className="ps-list">
                  {unsorted.map((t) => (
                    <li key={t.thread}>
                      <button type="button" onClick={() => void importSession(t)}>
                        <span className="ph-title">{t.title ?? t.preview ?? "(無題の会話)"}</span>
                        <span className="muted">{t.last ? new Date(t.last).toLocaleString() : "新規"} · {t.count}</span>
                      </button>
                    </li>
                  ))}
                </ul>
              </div>
            )}
            {sessions.length === 0 && <p className="muted">まだ会話がありません。上から始められます。</p>}
            <ul className="ps-list">
              {sessions.map((s) => (
                <li key={s.thread} className="ps-row">
                  <button type="button" className="ps-row-main" onClick={() => onOpenSession(s.thread)}>
                    <span className="ph-title">{s.title ?? s.preview ?? "(無題の会話)"}</span>
                    <span className="muted">
                      {s.last ? new Date(s.last).toLocaleString() : "新規"} · {s.count}
                    </span>
                  </button>
                  <span className="ps-row-actions">
                    <button type="button" aria-label="rename-session" title="改名" onClick={() => void renameSession(s)}>
                      <Icon name="edit" size={16} />
                    </button>
                    <button type="button" aria-label="delete-session" title="削除" onClick={() => void deleteSession(s)}>
                      <Icon name="trash" size={16} />
                    </button>
                  </span>
                </li>
              ))}
            </ul>
          </section>

          <section className="ps-block" aria-label="songs">
            <h3 className="ps-block-head">
              <span>曲・セクション <span className="muted">{songs.length}</span></span>
              <button type="button" className="ps-add" aria-label="create-song" onClick={onCreateSong}>
                ＋曲を組む
              </button>
            </h3>
            {songs.length === 0 && <p className="muted">まだ曲がありません。「＋曲を組む」から。</p>}
            <ul className="ps-list">
              {songs.map((n) => (
                <li key={n.id}>
                  <button type="button" onClick={() => onOpenNeta(n)}>
                    <span className="ph-title">{n.title ?? n.text ?? "(無題)"}</span>
                    <span className="muted">{n.kind === "song" ? "曲" : "セクション"}</span>
                  </button>
                </li>
              ))}
            </ul>
          </section>
        </div>

        {/* 知識＝この曲に貯めたファイル（Claude Projects の Project knowledge にあたる） */}
        <aside className="ps-knowledge" aria-label="files">
          <h3>ファイル <span className="muted">{files.length}</span></h3>
          {files.length === 0 && <p className="muted">まだファイルがありません</p>}
          <ul className="ps-list">
            {files.map((f) => (
              <li key={f.id} className="ps-row">
                <a className="ps-row-main" href={api.assetUrl(f.id)} download={f.name ?? undefined}>
                  <span className="ph-title">{f.name ?? f.id}</span>
                  <span className="muted">
                    {f.kind}
                    {f.size != null ? ` · ${fileSize(f.size)}` : ""} ·{" "}
                    {f.attachedTo.map((a) => a.title ?? a.kind).join("、")}
                  </span>
                </a>
                <span className="ps-row-actions">
                  <button type="button" aria-label="delete-file" title="削除" onClick={() => void deleteFile(f)}>
                    <Icon name="trash" size={16} />
                  </button>
                </span>
              </li>
            ))}
          </ul>
        </aside>
      </div>
    </div>
  );
}
