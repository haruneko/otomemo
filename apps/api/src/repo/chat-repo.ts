// チャットリポジトリ（#6）：chat_message 表（thread=対象neta id or 'global'/'chat:*'）を所有。
import { randomUUID } from "node:crypto";
import { type Db, now, parseJsonColumn } from "./util";

export interface ChatMessage {
  id: string;
  thread: string;
  role: string;
  kind: string | null;
  text: string | null;
  data: unknown;
  created: string;
}

function rowToChatMessage(row: Record<string, unknown>): ChatMessage {
  return {
    id: row.id as string,
    thread: row.thread as string,
    role: row.role as string,
    kind: (row.kind as string) ?? null,
    text: (row.text as string) ?? null,
    data: parseJsonColumn(row.data, "chat.data"),
    created: row.created as string,
  };
}

export class ChatRepo {
  constructor(private readonly db: Db) {}

  addChatMessage(input: {
    thread: string;
    role: string;
    kind?: string | null;
    text?: string | null;
    data?: unknown;
  }): ChatMessage {
    const id = randomUUID();
    this.db
      .prepare(
        `INSERT INTO chat_message (id, thread, role, kind, text, data, created)
         VALUES (@id, @thread, @role, @kind, @text, @data, @created)`,
      )
      .run({
        id,
        thread: input.thread,
        role: input.role,
        kind: input.kind ?? null,
        text: input.text ?? null,
        data: input.data == null ? null : JSON.stringify(input.data),
        created: now(),
      });
    return rowToChatMessage(
      this.db.prepare(`SELECT * FROM chat_message WHERE id = ?`).get(id) as Record<string, unknown>,
    );
  }

  listChatMessages(thread: string, limit = 200): ChatMessage[] {
    const rows = this.db
      .prepare(`SELECT * FROM chat_message WHERE thread = ? ORDER BY created, rowid LIMIT ?`)
      .all(thread, limit) as Record<string, unknown>[];
    return rows.map(rowToChatMessage);
  }

  clearChatThread(thread: string): void {
    this.db.prepare(`DELETE FROM chat_message WHERE thread = ?`).run(thread);
  }

  // 会話セッションを器（プロジェクト）に束ねる。upsert（部分更新は既存を温存＝COALESCE）。
  // project/title 省略時は既存値を保つ（id 採番時の登録 → 後からタイトル付与、の順を許す）。
  setChatThread(input: { thread: string; project?: string | null; title?: string | null }): void {
    const ts = now();
    this.db
      .prepare(
        `INSERT INTO chat_thread (thread, project, title, created, updated)
         VALUES (@thread, @project, @title, @ts, @ts)
         ON CONFLICT(thread) DO UPDATE SET
           project = COALESCE(@project, project),
           title   = COALESCE(@title, title),
           updated = @ts`,
      )
      .run({
        thread: input.thread,
        project: input.project ?? null,
        title: input.title ?? null,
        ts,
      });
  }

  // フリーChatの会話セッション一覧（thread='global' か 'chat:*'）。最終時刻・件数・冒頭プレビュー付き。
  // ネタ別スレッド(thread=neta id)は対象外（ネタから辿るため）。
  // project 指定時はその器に束ねたセッションのみ（chat_thread.project 一致）。未指定＝全フリーChat。
  // メッセージ前の空セッション（chat_thread 行のみ）も器に表示する＝新規作成直後から一覧に出る。
  listChatThreads(
    project?: string | null,
  ): {
    thread: string;
    last: string | null;
    count: number;
    preview: string | null;
    project: string | null;
    title: string | null;
  }[] {
    const rows = this.db
      .prepare(
        `WITH ids AS (
           SELECT thread FROM chat_message WHERE thread = 'global' OR thread LIKE 'chat:%'
           UNION
           SELECT thread FROM chat_thread
         )
         SELECT i.thread AS thread,
           (SELECT MAX(created) FROM chat_message WHERE thread = i.thread) AS last,
           (SELECT COUNT(*) FROM chat_message WHERE thread = i.thread) AS count,
           (SELECT x.text FROM chat_message x
              WHERE x.thread = i.thread AND x.role = 'user' AND x.text IS NOT NULL
              ORDER BY x.created LIMIT 1) AS preview,
           t.project AS project, t.title AS title, t.created AS t_created
         FROM ids i
         LEFT JOIN chat_thread t ON t.thread = i.thread
         WHERE (@project IS NULL OR t.project = @project)
         ORDER BY COALESCE((SELECT MAX(created) FROM chat_message WHERE thread = i.thread), t.created) DESC`,
      )
      .all({ project: project ?? null }) as Record<string, unknown>[];
    return rows.map((r) => ({
      thread: r.thread as string,
      last: (r.last as string) ?? null,
      count: Number(r.count),
      preview: (r.preview as string) ?? null,
      project: (r.project as string) ?? null,
      title: (r.title as string) ?? null,
    }));
  }
}
