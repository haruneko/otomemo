"""ジョブワーカー（docs/design.md #15）。SQLite の job 表をポーリングして消化。

run_once() は1件処理してテスト可能に。run_loop() は常駐用。
TS が job を積み（生産者）、ここが消費する（producer/consumer 境界＝ジョブ表）。
"""

import json
import logging
import sqlite3
import time
import uuid
from datetime import datetime, timezone

from .jobs import HANDLERS, split_mora

log = logging.getLogger(__name__)


def _now() -> str:
    return datetime.now(timezone.utc).isoformat()


def _resolve_fit_context(conn: sqlite3.Connection, params: dict) -> dict:
    """#85 S2b condition.fit_to を展開済み fit_context へ解決（worker=生産者側でDBを読む）。
    handler は純粋でなくてよい（_style_block も既にDB読む）が、合わせる相手の解決はここに集約し、
    handler は fit_context だけ見れば条件を満たせる。歌詞→音数(モーラ)、コード→chords、メロ→notes。"""
    cond = params.get("condition")
    if not isinstance(cond, dict):
        return params
    fit_to = cond.get("fit_to")
    by = cond.get("by")
    if not isinstance(fit_to, list) or not fit_to:
        return params
    ctx: dict = {}
    for nid in fit_to:
        row = conn.execute(
            "SELECT kind, content, text FROM neta WHERE id=?", (str(nid),)
        ).fetchone()
        if row is None:
            continue
        try:
            content = json.loads(row["content"]) if row["content"] else {}
        except Exception:  # noqa: BLE001
            content = {}
        if (by == "syllable" or row["kind"] == "lyric") and row["text"]:
            lines = [ln for ln in row["text"].splitlines() if ln.strip()]
            ctx.setdefault("mora_counts", []).extend(len(split_mora(ln)) for ln in lines)
            ctx["lyric"] = row["text"]
        elif (by == "harmony" or row["kind"] == "chord_progression") and isinstance(
            content.get("chords"), list
        ):
            ctx["chords"] = content["chords"]
        elif row["kind"] == "melody" and isinstance(content.get("notes"), list):
            ctx["notes"] = content["notes"]
        elif row["kind"] == "rhythm" and isinstance(content.get("rhythm"), dict):
            ctx["rhythm"] = content["rhythm"]
    return {**params, "fit_context": ctx} if ctx else params


def _enqueue_children(
    conn: sqlite3.Connection, parent_id: str, subtasks: list, target: str | None = None,
    chat_thread: str | None = None,
) -> int:
    """plan の結果から子ジョブを queued で積む（見てない間も進む）。次以降のループで消化される。
    結果が元の対象に紐づくよう、plan の target_neta_id を子に引き継ぐ（design 原則3）。
    chat_thread があれば子 params に伝播＝子の生成結果もそのチャットへ記録される（fb-3）。"""
    n = 0
    for st in subtasks:
        if not isinstance(st, dict):
            continue
        intent = str(st.get("intent", ""))
        # plan/consult を子に積ませない（自己再帰・無限ループ防止 #33/#61）
        if intent not in HANDLERS or intent in ("plan", "consult"):
            continue
        child_params = dict(st.get("params") or {})
        if chat_thread:
            child_params.setdefault("chat_thread", chat_thread)
        conn.execute(
            "INSERT INTO job (id, intent, params, status, level, parent_job_id, target_neta_id, "
            "priority, created, updated) VALUES (?,?,?,?,?,?,?,?,?,?)",
            (
                str(uuid.uuid4()),
                intent,
                json.dumps(child_params, ensure_ascii=False),
                "queued",
                "atomic",
                parent_id,
                target,
                0,
                _now(),
                _now(),
            ),
        )
        n += 1
    return n


def run_once(conn: sqlite3.Connection) -> int:
    """queued を優先度順に1件処理。処理したら1、無ければ0。"""
    row = conn.execute(
        "SELECT * FROM job WHERE status='queued' ORDER BY priority DESC, created LIMIT 1"
    ).fetchone()
    if row is None:
        return 0

    job_id = row["id"]
    conn.execute("UPDATE job SET status='running', updated=? WHERE id=?", (_now(), job_id))
    conn.commit()

    try:
        handler = HANDLERS.get(row["intent"])
        if handler is None:
            raise ValueError(f"no handler for intent: {row['intent']}")
        params = json.loads(row["params"]) if row["params"] else {}
        params = _resolve_fit_context(conn, params)  # #85 S2b 合わせる相手を展開
        result = handler(params)
        conn.execute(
            "UPDATE job SET status='done', result_summary=?, progress=NULL, updated=? WHERE id=?",
            (json.dumps(result, ensure_ascii=False), _now(), job_id),
        )
        # plan、または consult が type=plan を返したとき、子ジョブを積む（#61）
        is_plan = row["intent"] == "plan" or (
            row["intent"] == "consult" and result.get("type") == "plan"
        )
        if is_plan and isinstance(result.get("subtasks"), list):
            # 親の chat_thread を子へ伝播＝子の生成結果もそのチャットに残る（fb-3）。
            _enqueue_children(conn, job_id, result["subtasks"], row["target_neta_id"], params.get("chat_thread"))
        # #93 方向確認：handler が _propose を返したら「承認待ち」ジョブを積む（1案はこのジョブで
        # materialize 済み。承認で answerJob が残りを継続）。
        prop = result.get("_propose") if isinstance(result, dict) else None
        if isinstance(prop, dict) and prop.get("intent") in HANDLERS:
            conn.execute(
                "INSERT INTO job (id, intent, params, status, level, parent_job_id, target_neta_id, "
                "question, priority, created, updated) VALUES (?,?,?,?,?,?,?,?,?,?,?)",
                (
                    str(uuid.uuid4()), prop["intent"],
                    json.dumps(prop.get("params") or {}, ensure_ascii=False),
                    "waiting", "atomic", job_id, row["target_neta_id"],
                    str(prop.get("ask") or "この方向でいい？"), 0, _now(), _now(),
                ),
            )
    except Exception as e:  # noqa: BLE001  どんな失敗もjob.errorに残して継続（ループは止めない）。
        # ただし無音にはしない＝静かな失敗（毎回 failed）を検知できるようログにも出す（traceback付き）。
        log.warning("job %s (%s) failed: %s", job_id, row["intent"], e, exc_info=True)
        conn.execute(
            "UPDATE job SET status='failed', error=?, updated=? WHERE id=?",
            (str(e), _now(), job_id),
        )
    conn.commit()
    return 1


def run_loop(conn: sqlite3.Connection, interval: float = 1.0) -> None:  # pragma: no cover
    while True:
        if run_once(conn) == 0:
            time.sleep(interval)
