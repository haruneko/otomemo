import { api, type NetaInput } from "./api";

// 出先耐性（docs/requirements.md 非機能）：オフライン時の捕獲を localStorage に貯め、
// オンライン復帰時に送る。「捕獲だけは落とさない」。
const KEY = "cm-outbox";

function read(): NetaInput[] {
  try {
    return JSON.parse(localStorage.getItem(KEY) ?? "[]") as NetaInput[];
  } catch {
    return [];
  }
}
function write(items: NetaInput[]): void {
  localStorage.setItem(KEY, JSON.stringify(items));
}

export function queueNeta(input: NetaInput): void {
  write([...read(), input]);
}

export function outboxCount(): number {
  return read().length;
}

/** 貯めた捕獲を順に送る。送れた数を返す。送れなかったものは残す。 */
export async function flushOutbox(): Promise<number> {
  const items = read();
  if (items.length === 0) return 0;
  const remaining: NetaInput[] = [];
  let sent = 0;
  for (const it of items) {
    try {
      await api.createNeta(it);
      sent++;
    } catch {
      remaining.push(it);
    }
  }
  write(remaining);
  return sent;
}
