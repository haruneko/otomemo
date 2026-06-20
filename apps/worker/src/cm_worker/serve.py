"""意味検索のHTTPサービス（docs/design.md #16：TSが叩く狭い内部Python窓口）。

モデルを常駐ロードし /search を提供。TS の /search がここを proxy する。
外には露出させず localhost のみ。
"""

import os

from fastapi import FastAPI

from .search import MODEL_ID, SearchIndex

app = FastAPI()
_index: SearchIndex | None = None


def _get_index() -> SearchIndex:
    global _index
    if _index is None:
        _index = SearchIndex(os.environ.get("CM_DB", "./data/cm.sqlite"))
    return _index


@app.get("/health")
def health() -> dict:
    return {"ok": True, "model": MODEL_ID}


@app.get("/search")
def search(q: str, k: int = 20) -> list[dict]:
    return _get_index().search(q, k)


def run() -> None:  # pragma: no cover
    import uvicorn

    uvicorn.run(
        app,
        host="127.0.0.1",
        port=int(os.environ.get("CM_SEARCH_PORT", "8788")),
    )
