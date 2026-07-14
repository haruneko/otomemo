// 資産リポジトリ（#6）：asset（ファイル資産）・neta_asset（ネタ↔資産）・song（曲overlay）を所有。
// 他テーブル(neta)への依存は存在チェックの read-only クエリのみ（inter-repo 結合を持たない）。
import { randomUUID } from "node:crypto";
import { type Db, now, parseJsonColumn } from "./util";

export interface Asset {
  id: string;
  kind: string;
  name: string | null;
  path: string;
  size: number | null;
  mime: string | null;
  meta: unknown;
  created: string;
}

// WP-X2 ゲームBGMループ本体の範囲（小節・0起点）。endBar→startBar へ戻る。tailBars=頭へ重ねる余韻尺。
export interface SongLoop {
  startBar: number;
  endBar: number;
  tailBars?: number;
}

export interface SongOverlay {
  neta_id: string;
  stage: string | null;
  next_action: string | null;
  loop: SongLoop | null; // WP-X2 未指定=null（既存曲は無影響）
  updated: string;
}

function rowToAsset(row: Record<string, unknown>): Asset {
  return {
    id: row.id as string,
    kind: row.kind as string,
    name: (row.name as string) ?? null,
    path: row.path as string,
    size: (row.size as number) ?? null,
    mime: (row.mime as string) ?? null,
    meta: parseJsonColumn(row.meta, "asset.meta"),
    created: row.created as string,
  };
}

export class AssetRepo {
  constructor(private readonly db: Db) {}

  private netaExists(id: string): boolean {
    return !!this.db.prepare(`SELECT 1 FROM neta WHERE id=?`).get(id);
  }

  // --- asset（#77 SoundFont等のファイル資産。実体は data/assets/、ここはメタ）---
  addAsset(input: {
    kind: string;
    name?: string | null;
    path: string;
    size?: number | null;
    mime?: string | null;
    meta?: unknown;
  }): Asset {
    const id = randomUUID();
    this.db
      .prepare(
        `INSERT INTO asset (id,kind,name,path,size,mime,meta,created)
         VALUES (@id,@kind,@name,@path,@size,@mime,@meta,@created)`,
      )
      .run({
        id,
        kind: input.kind,
        name: input.name ?? null,
        path: input.path,
        size: input.size ?? null,
        mime: input.mime ?? null,
        meta: input.meta == null ? null : JSON.stringify(input.meta),
        created: now(),
      });
    return this.getAsset(id)!;
  }

  listAssets(kind?: string): Asset[] {
    const rows = (
      kind
        ? this.db.prepare(`SELECT * FROM asset WHERE kind=? ORDER BY created DESC`).all(kind)
        : this.db.prepare(`SELECT * FROM asset ORDER BY created DESC`).all()
    ) as Record<string, unknown>[];
    return rows.map(rowToAsset);
  }

  getAsset(id: string): Asset | null {
    const row = this.db.prepare(`SELECT * FROM asset WHERE id=?`).get(id) as
      | Record<string, unknown>
      | undefined;
    return row ? rowToAsset(row) : null;
  }

  deleteAsset(id: string): boolean {
    return this.db.prepare(`DELETE FROM asset WHERE id=?`).run(id).changes > 0;
  }

  // --- song（#83 曲の箱 overlay：neta[kind=song] と 1:1。段階／次の一手）---
  updateSong(
    netaId: string,
    patch: { stage?: string | null; next_action?: string | null; loop?: SongLoop | null },
  ): SongOverlay | null {
    if (!this.netaExists(netaId)) return null;
    const cur = this.getSong(netaId);
    const stage = patch.stage !== undefined ? patch.stage : (cur?.stage ?? null);
    const next_action = patch.next_action !== undefined ? patch.next_action : (cur?.next_action ?? null);
    const loop = patch.loop !== undefined ? patch.loop : (cur?.loop ?? null); // WP-X2 未指定=据え置き
    this.db
      .prepare(
        `INSERT INTO song (neta_id, stage, next_action, loop, updated) VALUES (@n,@s,@a,@l,@u)
         ON CONFLICT(neta_id) DO UPDATE SET stage=@s, next_action=@a, loop=@l, updated=@u`,
      )
      .run({ n: netaId, s: stage, a: next_action, l: loop == null ? null : JSON.stringify(loop), u: now() });
    return this.getSong(netaId);
  }

  getSong(netaId: string): SongOverlay | null {
    const row = this.db.prepare(`SELECT * FROM song WHERE neta_id=?`).get(netaId) as
      | Record<string, unknown>
      | undefined;
    return row
      ? {
          neta_id: row.neta_id as string,
          stage: (row.stage as string) ?? null,
          next_action: (row.next_action as string) ?? null,
          loop: (parseJsonColumn(row.loop, "song.loop") as SongLoop | null) ?? null,
          updated: row.updated as string,
        }
      : null;
  }

  // --- neta_asset（#83 ネタ↔資産の紐付け：role=source/attachment/render）---
  linkAsset(netaId: string, assetId: string, role = "attachment"): boolean {
    if (!this.netaExists(netaId) || !this.getAsset(assetId)) return false;
    this.db
      .prepare(
        `INSERT INTO neta_asset (neta_id, asset_id, role, created) VALUES (?,?,?,?)
         ON CONFLICT(neta_id, asset_id, role) DO NOTHING`,
      )
      .run(netaId, assetId, role, now());
    return true;
  }

  unlinkAsset(netaId: string, assetId: string, role?: string): boolean {
    const sql = role
      ? this.db.prepare(`DELETE FROM neta_asset WHERE neta_id=? AND asset_id=? AND role=?`).run(netaId, assetId, role)
      : this.db.prepare(`DELETE FROM neta_asset WHERE neta_id=? AND asset_id=?`).run(netaId, assetId);
    return sql.changes > 0;
  }

  getNetaAssets(netaId: string): (Asset & { role: string })[] {
    const rows = this.db
      .prepare(
        `SELECT a.*, na.role AS na_role FROM neta_asset na JOIN asset a ON a.id = na.asset_id
         WHERE na.neta_id=? ORDER BY na.created DESC`,
      )
      .all(netaId) as Record<string, unknown>[];
    return rows.map((r) => ({ ...rowToAsset(r), role: r.na_role as string }));
  }
}
