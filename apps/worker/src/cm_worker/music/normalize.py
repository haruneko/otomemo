"""#86 入力の正規化層（口1=worker直呼び も 口2=MCP も**ここを通す**）。

Claude が param を自由形式で渡す揺れ（key="C"/time_signature/bpm 等）を1箇所で吸収。
MCP の inputSchema はこの正規化の"外側ガード"に過ぎず、根治はこの層（acceptor 重大3）。
"""

from .theory import norm_root


def normalize_frame(frame) -> dict:
    """枠(frame)を正規化：key→0-11 int、meter(time_signature別名)→str、tempo(bpm別名)、bars→1..16、mood→str。
    未知/不正は落とす（安全既定）。"""
    f = frame if isinstance(frame, dict) else {}
    out: dict = {}
    k = f.get("key")
    if isinstance(k, (int, float)) and 0 <= k <= 11:
        out["key"] = int(k)
    elif isinstance(k, str) and k[:1].upper() in "CDEFGAB":  # 音名のみ受ける（不正名は落とす）
        out["key"] = norm_root(k)
    meter = f.get("meter") or f.get("time_signature")
    if meter:
        out["meter"] = str(meter)
    tempo = f.get("tempo") if f.get("tempo") is not None else f.get("bpm")
    if isinstance(tempo, (int, float)) and tempo > 0:
        out["tempo"] = tempo
    b = f.get("bars")
    if isinstance(b, (int, float)):  # 0/負も与えられたら 1..16 へclamp（不在のみ未設定→下流既定）
        out["bars"] = max(1, min(16, int(b)))
    mood = f.get("mood")
    if mood:
        out["mood"] = str(mood)
    return out


def normalize_chords(chords) -> list[dict]:
    """コード列を content スキーマ（root 0-11 int・quality str・start/dur float）へ正規化。
    root が音名("C#"等)でも吸収。不正要素はスキップ。"""
    out: list[dict] = []
    for c in chords or []:
        if not isinstance(c, dict) or "root" not in c:
            continue
        try:
            out.append(
                {
                    "root": norm_root(c.get("root", 0)),
                    "quality": str(c.get("quality", "")),
                    "start": float(c.get("start", 0)),
                    "dur": float(c.get("dur", 0)),
                }
            )
        except Exception:  # noqa: BLE001
            continue
    return out
