"""#92 メロディ類似度（記号）。音程列の重み付き編集距離（簡易 Mongeau-Sankoff）。

移調不変（音程差で測る）。作風寄せ／重複検出／「これに近い過去メロ」探索の土台。
"""


def _intervals(notes) -> list[int]:
    """ノート列→隣接音程列（移調不変にするため絶対音高でなく差分）。"""
    ns = sorted([n for n in (notes or []) if "pitch" in n], key=lambda n: float(n.get("start", 0)))
    return [int(ns[i + 1]["pitch"]) - int(ns[i]["pitch"]) for i in range(len(ns) - 1)]


def _edit_distance(a: list[int], b: list[int]) -> int:
    """音程列の編集距離。置換コスト=音程差(上限2)、挿入/削除=1（簡易 Mongeau-Sankoff）。"""
    m, n = len(a), len(b)
    dp = [[0] * (n + 1) for _ in range(m + 1)]
    for i in range(m + 1):
        dp[i][0] = i
    for j in range(n + 1):
        dp[0][j] = j
    for i in range(1, m + 1):
        for j in range(1, n + 1):
            sub = dp[i - 1][j - 1] + min(abs(a[i - 1] - b[j - 1]), 2)
            dp[i][j] = min(sub, dp[i - 1][j] + 1, dp[i][j - 1] + 1)
    return dp[m][n]


def melody_similarity(a_notes, b_notes) -> float:
    """2メロの類似度 0..1（1=同型・移調しても高い）。"""
    a, b = _intervals(a_notes), _intervals(b_notes)
    if not a and not b:
        return 1.0
    if not a or not b:
        return 0.0
    dist = _edit_distance(a, b)
    return max(0.0, 1.0 - dist / (2 * max(len(a), len(b))))


def find_similar(target_notes, candidates, top: int = 5) -> list[dict]:
    """target に近い順に候補を返す。candidates=[{id?,label?,notes}]→[{id?,label?,similarity}]。"""
    scored = []
    for c in candidates or []:
        if not isinstance(c, dict):
            continue
        s = melody_similarity(target_notes, c.get("notes") or [])
        scored.append({**{k: v for k, v in c.items() if k != "notes"}, "similarity": round(s, 3)})
    scored.sort(key=lambda x: -x["similarity"])
    return scored[: max(1, top)]
