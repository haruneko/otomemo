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

  // フリーChatの会話セッション一覧（thread='global' か 'chat:*'）。最終時刻・件数・冒頭プレビュー付き。
  // ネタ別スレッド(thread=neta id)は対象外（ネタから辿るため）。
  listChatThreads(): { thread: string; last: string; count: number; preview: string | null }[] {
    const rows = this.db
      .prepare(
        `SELECT m.thread AS thread, MAX(m.created) AS last, COUNT(*) AS count,
           (SELECT x.text FROM chat_message x
              WHERE x.thread = m.thread AND x.role = 'user' AND x.text IS NOT NULL
              ORDER BY x.created LIMIT 1) AS preview
         FROM chat_message m
         WHERE m.thread = 'global' OR m.thread LIKE 'chat:%'
         GROUP BY m.thread ORDER BY last DESC`,
      )
      .all() as Record<string, unknown>[];
    return rows.map((r) => ({
      thread: r.thread as string,
      last: r.last as string,
      count: Number(r.count),
      preview: (r.preview as string) ?? null,
    }));
  }
}
