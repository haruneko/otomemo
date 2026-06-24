// 合成リポジトリ（#6）：compose_edge（任意子DAG・parent/child/position/ord）を所有。
// 循環判定(descendantIds)と配置/解除はここ。ツリー取得(getComposition)は neta ノードを組むため
// 集約跨ぎ＝Core 側のサービスに残し、ここの childEdges を使って構築する。
import { type Db } from "./util";

export class ComposeRepo {
  constructor(private readonly db: Db) {}

  // 合成の子孫 id 集合（compose_edge を BFS）。循環判定用。
  descendantIds(id: string): Set<string> {
    const out = new Set<string>();
    const stack = [id];
    while (stack.length) {
      const cur = stack.pop()!;
      const rows = this.db
        .prepare(`SELECT child_id FROM compose_edge WHERE parent_id = ?`)
        .all(cur) as { child_id: string }[];
      for (const r of rows) if (!out.has(r.child_id)) (out.add(r.child_id), stack.push(r.child_id));
    }
    return out;
  }

  placeChild(parentId: string, childId: string, position = 0, ord = 0): void {
    // section に section を入れる等のネストを許すが、**循環は禁止**（自分自身／子孫を親に置けない）。
    if (childId === parentId) throw new Error("自分自身は子にできない");
    if (this.descendantIds(childId).has(parentId)) throw new Error("循環になる配置はできない");
    // #54: 同じ子を別位置に複数置ける。同位置への再配置は冪等（ord を更新）。
    this.db
      .prepare(
        `INSERT INTO compose_edge (parent_id, child_id, position, ord) VALUES (?, ?, ?, ?)
         ON CONFLICT(parent_id, child_id, position) DO UPDATE SET ord = excluded.ord`,
      )
      .run(parentId, childId, position, ord);
  }

  // position 指定で1インスタンスのみ解除。未指定なら (parent,child) の全インスタンス。
  removeChild(parentId: string, childId: string, position?: number): void {
    if (position === undefined) {
      this.db.prepare(`DELETE FROM compose_edge WHERE parent_id = ? AND child_id = ?`).run(parentId, childId);
    } else {
      this.db
        .prepare(`DELETE FROM compose_edge WHERE parent_id = ? AND child_id = ? AND position = ?`)
        .run(parentId, childId, position);
    }
  }

  // 直下の子辺（ord, position 順）。getComposition がこれを使って neta ツリーを組む。
  childEdges(parentId: string): { child_id: string; position: number; ord: number }[] {
    return this.db
      .prepare(`SELECT child_id, position, ord FROM compose_edge WHERE parent_id = ? ORDER BY ord, position`)
      .all(parentId) as { child_id: string; position: number; ord: number }[];
  }
}
