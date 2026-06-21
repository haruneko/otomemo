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


def test_search_rel_is_spread_from_floor(tmp_path):
    # #65 spread較正：各hitに rel=score-floor(集合の最小sim) が付く。
    db = str(tmp_path / "t.sqlite")
    conn = connect(db)
    _seed(conn)
    conn.close()
    hits = SearchIndex(db, encoder=_fake_encoder).search("夜に走る", k=3)
    assert {"neta_id", "score", "rel"} <= hits[0].keys()
    floor = min(h["score"] for h in hits)  # k=3=全件なので top-k の最小=集合min=floor
    for h in hits:
        assert abs(h["rel"] - (h["score"] - floor)) < 1e-6
    assert min(h["rel"] for h in hits) == 0.0  # 最下位は floor 自身＝rel 0


def test_search_nonsense_query_has_flat_rel(tmp_path):
    # #65 無意味クエリ(語彙に当たらない)＝全員横並び→rel が小さく、TS側ゲートで落ちる。
    db = str(tmp_path / "t.sqlite")
    conn = connect(db)
    _seed(conn)
    conn.close()
    hits = SearchIndex(db, encoder=_fake_encoder).search("天気予報", k=3)  # 夜/走/経理 を含まない
    assert hits  # k件は返るが…
    assert all(h["rel"] == 0.0 for h in hits)  # rel は全員0＝該当なし相当（ゲートで除外される）


def test_search_caches_and_reuses(tmp_path):
    db = str(tmp_path / "t.sqlite")
    conn = connect(db)
    _seed(conn)
    # 1回 sync して埋め込みキャッシュができる
    SearchIndex(db, encoder=_fake_encoder).sync(conn)
    n = conn.execute("SELECT COUNT(*) c FROM neta_embedding").fetchone()["c"]
    conn.close()
    assert n == 3


def test_content_text_makes_music_searchable():
    from cm_worker.search import _content_text

    assert "C4" in _content_text("melody", '{"notes":[{"pitch":60,"start":0,"dur":1}]}')
    assert "Am" in _content_text(
        "chord_progression", '{"chords":[{"root":"A","quality":"m","start":0,"dur":4}]}'
    )
    # 0–11整数root（正準）も音名でインデックスされる
    assert "C" in _content_text("chord_progression", '{"chords":[{"root":0,"quality":""}]}')
    assert "Am" in _content_text("chord_progression", '{"chords":[{"root":9,"quality":"m"}]}')
    assert "Kick:x.x." in _content_text(
        "rhythm", '{"rhythm":{"steps":4,"lanes":[{"name":"Kick","midi":36,"hits":[0,2]}]}}'
    )


def test_search_empty(tmp_path):
    db = str(tmp_path / "t.sqlite")
    conn = connect(db)
    conn.executescript(NETA_SQL)
    conn.commit()
    conn.close()
    assert SearchIndex(db, encoder=_fake_encoder).search("x") == []
