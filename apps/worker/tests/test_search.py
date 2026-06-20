from datetime import datetime, timezone

import numpy as np

from cm_worker.db import connect
from cm_worker.search import SearchIndex

# neta 表は本番では TS API が作る。テストではここで用意する。
NETA_SQL = """
CREATE TABLE IF NOT EXISTS neta (
  id TEXT PRIMARY KEY, kind TEXT, title TEXT, content TEXT, text TEXT,
  "key" INTEGER, mode TEXT, tempo REAL, meter TEXT, bars INTEGER, mood TEXT,
  created TEXT, updated TEXT
);
"""


def _fake_encoder(texts: list[str]) -> np.ndarray:
    """「夜」「走/駆」「経理」の出現で3次元化＋正規化（モデル不要のスタブ）。"""
    out = []
    for t in texts:
        v = np.array(
            [t.count("夜"), t.count("走") + t.count("駆"), t.count("経理")],
            dtype=np.float32,
        )
        n = float(np.linalg.norm(v))
        out.append(v / n if n else v)
    return np.array(out, dtype=np.float32)


def _seed(conn) -> None:
    conn.executescript(NETA_SQL)
    now = datetime.now(timezone.utc).isoformat()
    rows = [
        ("a", "lyric", None, "夜を駆ける"),
        ("b", "lyric", None, "夜空を走っていく"),
        ("c", "knowledge", "経理の決算メモ", None),
    ]
    for id_, kind, title, text in rows:
        conn.execute(
            "INSERT INTO neta (id,kind,title,text,created,updated) VALUES (?,?,?,?,?,?)",
            (id_, kind, title, text, now, now),
        )
    conn.commit()


def test_search_ranks_semantically(tmp_path):
    db = str(tmp_path / "t.sqlite")
    conn = connect(db)
    _seed(conn)
    conn.close()
    idx = SearchIndex(db, encoder=_fake_encoder)
    ids = [r["neta_id"] for r in idx.search("夜に走る", k=3)]
    assert ids[0] in ("a", "b")  # 夜+走/駆 が上位
    assert ids[-1] == "c"  # 経理は最下位


def test_search_caches_and_reuses(tmp_path):
    db = str(tmp_path / "t.sqlite")
    conn = connect(db)
    _seed(conn)
    # 1回 sync して埋め込みキャッシュができる
    SearchIndex(db, encoder=_fake_encoder).sync(conn)
    n = conn.execute("SELECT COUNT(*) c FROM neta_embedding").fetchone()["c"]
    conn.close()
    assert n == 3


def test_search_empty(tmp_path):
    db = str(tmp_path / "t.sqlite")
    conn = connect(db)
    conn.executescript(NETA_SQL)
    conn.commit()
    conn.close()
    assert SearchIndex(db, encoder=_fake_encoder).search("x") == []
