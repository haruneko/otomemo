import os

from .db import connect
from .worker import run_loop


def main() -> None:  # pragma: no cover
    """常駐エントリ。CM_DB の job 表をポーリングして消化し続ける。"""
    path = os.environ.get("CM_DB", "./data/cm.sqlite")
    conn = connect(path)
    run_loop(conn)


if __name__ == "__main__":  # pragma: no cover
    main()
