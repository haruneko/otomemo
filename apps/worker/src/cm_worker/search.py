"""意味検索（docs/design.md #6）。

- 埋め込みモデル（Ruri v3）を常駐で1個ロード。
- neta を遅延埋め込み（neta_embedding にキャッシュ、updated が変われば再計算）。
- 検索はブルートフォース cosine（規模=数千〜数万件なのでミリ秒、ANN不要）。
- encoder を差し替え可能にしてテスト時はモデル不要。
"""

import os
import sqlite3

import numpy as np

MODEL_ID = os.environ.get("CM_EMBED_MODEL", "cl-nagoya/ruri-v3-310m")
QPREFIX = "検索クエリ: "
DPREFIX = "検索文書: "

EMBED_SCHEMA = """
CREATE TABLE IF NOT EXISTS neta_embedding (
  neta_id TEXT PRIMARY KEY,
  updated TEXT,
  dim     INTEGER,
  vec     BLOB
);
"""


def _text_of(row: sqlite3.Row) -> str:
    parts = [row["kind"], row["title"], row["text"], row["mood"]]
    joined = " ".join(p for p in parts if p)
    return joined or (row["kind"] or "")


class SearchIndex:
    def __init__(self, db_path: str, encoder=None, model_id: str = MODEL_ID):
        self.db_path = db_path
        self._encoder = encoder
        self._model_id = model_id
        self._model = None

    def _encode(self, texts: list[str]) -> np.ndarray:
        if self._encoder is not None:
            return np.asarray(self._encoder(texts), dtype=np.float32)
        if self._model is None:
            from sentence_transformers import SentenceTransformer

            self._model = SentenceTransformer(self._model_id, trust_remote_code=True)
        return np.asarray(
            self._model.encode(texts, normalize_embeddings=True), dtype=np.float32
        )

    def _conn(self) -> sqlite3.Connection:
        c = sqlite3.connect(self.db_path)
        c.row_factory = sqlite3.Row
        c.execute("PRAGMA journal_mode=WAL")
        c.executescript(EMBED_SCHEMA)
        return c

    def sync(self, conn: sqlite3.Connection) -> int:
        conn.executescript(EMBED_SCHEMA)
        rows = conn.execute(
            """
            SELECT n.id, n.kind, n.title, n.text, n.mood, n.updated
            FROM neta n LEFT JOIN neta_embedding e ON e.neta_id = n.id
            WHERE e.neta_id IS NULL OR e.updated != n.updated
            """
        ).fetchall()
        if not rows:
            return 0
        vecs = self._encode([DPREFIX + _text_of(r) for r in rows])
        for r, v in zip(rows, vecs):
            v = np.asarray(v, dtype=np.float32)
            conn.execute(
                "INSERT INTO neta_embedding (neta_id, updated, dim, vec) VALUES (?,?,?,?) "
                "ON CONFLICT(neta_id) DO UPDATE SET updated=excluded.updated, dim=excluded.dim, vec=excluded.vec",
                (r["id"], r["updated"], int(v.shape[0]), v.tobytes()),
            )
        conn.commit()
        return len(rows)

    def search(self, q: str, k: int = 20) -> list[dict]:
        conn = self._conn()
        try:
            self.sync(conn)
            rows = conn.execute("SELECT neta_id, vec FROM neta_embedding").fetchall()
            if not rows:
                return []
            mat = np.stack([np.frombuffer(r["vec"], dtype=np.float32) for r in rows])
            qv = self._encode([QPREFIX + q])[0]
            sims = mat @ qv
            order = np.argsort(-sims)[: max(k, 0)]
            return [
                {"neta_id": rows[i]["neta_id"], "score": float(sims[i])} for i in order
            ]
        finally:
            conn.close()
