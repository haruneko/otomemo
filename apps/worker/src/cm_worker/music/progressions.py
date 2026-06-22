"""#98 名前付き進行DB（C基準・確定realize）。

定番進行を「名前 → 度数列(C基準の root pc＋quality)」で確定保持し、当てはまり保証つきで
realize する。routing A の「特定/名前の進行」を、Claude の"それっぽさ"から決定的な実コードへ格上げ。
ダイアトニック度数表だけの gen_chords では原理的に出せない E7/Gm7(非ダイアトニック)も正確に出せる。

root は 0-11 ピッチクラス、quality は theory.QUALITY_INTERVALS のキー。content は C基準保存
（design #14）＝実際の調は配置/ネタの key で後段トランスポーズ。
"""

from .normalize import normalize_frame

# 各進行＝C基準の (root_pc, quality) 列。aliases は小文字・スペース無しで部分一致照合。
NAMED_PROGRESSIONS: dict[str, dict] = {
    "丸の内": {
        # 丸サ進行 / Just the Two of Us：FM7-E7-Am7-Gm7-C7
        "aliases": ["丸の内", "丸サ", "marunouchi", "justthetwoofus", "jtou"],
        "degrees": [(5, "maj7"), (4, "7"), (9, "m7"), (7, "m7"), (0, "7")],
    },
    "カノン": {
        # パッヘルベルのカノン：C-G-Am-Em-F-C-F-G（I-V-vi-iii-IV-I-IV-V）
        "aliases": ["カノン", "かのん", "canon", "pachelbel", "パッヘルベル"],
        "degrees": [(0, ""), (7, ""), (9, "m"), (4, "m"), (5, ""), (0, ""), (5, ""), (7, "")],
    },
    "小室": {
        # 小室進行：Am-F-G-C（vi-IV-V-I＝6451）
        "aliases": ["小室", "komuro", "6451"],
        "degrees": [(9, "m"), (5, ""), (7, ""), (0, "")],
    },
    "王道": {
        # 王道進行(4536)：FM7-G7-Em7-Am7（IV-V-iii-vi）
        "aliases": ["王道", "royalroad", "4536"],
        "degrees": [(5, "maj7"), (7, "7"), (4, "m7"), (9, "m7")],
    },
    "ツーファイブ": {
        # ツーファイブワン：Dm7-G7-CM7（ii-V-I）
        "aliases": ["ツーファイブ", "ツーファイブワン", "2-5-1", "251", "twofive", "ii-v-i", "iivi"],
        "degrees": [(2, "m7"), (7, "7"), (0, "maj7")],
    },
    "ブルース": {
        # 12小節ブルース：I7×4 / IV7×2 I7×2 / V7 IV7 I7 V7
        "aliases": ["ブルース", "blues", "12小節", "12-bar", "twelvebar", "12bar"],
        "degrees": [
            (0, "7"), (0, "7"), (0, "7"), (0, "7"),
            (5, "7"), (5, "7"), (0, "7"), (0, "7"),
            (7, "7"), (5, "7"), (0, "7"), (7, "7"),
        ],
    },
}


def _norm_query(s) -> str:
    """照合用に正規化：小文字化・空白/区切り/「進行」除去。"""
    t = str(s or "").lower()
    for junk in (" ", "　", "進行", "・", "—", "-", "ー", "the", "of"):
        t = t.replace(junk, "")
    return t


def find_progression(name) -> tuple[str, dict] | None:
    """名前（別名可・表記揺れ可）から進行を引く。見つからなければ None。"""
    q = _norm_query(name)
    if not q:
        return None
    for canon, entry in NAMED_PROGRESSIONS.items():
        for alias in [canon, *entry["aliases"]]:
            a = _norm_query(alias)
            if not a:
                continue
            # a in q：エイリアスがクエリに含まれる（「丸の内進行で」等）＝安全。
            # q in a：クエリがエイリアスの一部（短い別名表記）＝**3文字以上のときだけ**許可。
            # でないと "ii"/"12"/"45" 等の極短クエリが別進行に誤マッチする。
            if a == q or a in q or (len(q) >= 3 and q in a):
                return canon, entry
    return None


def list_progressions() -> list[str]:
    """登録されている進行の正準名一覧（Chat の候補提示用）。"""
    return list(NAMED_PROGRESSIONS.keys())


def _beats_per_bar(meter) -> float:
    try:
        n, d = str(meter).split("/")
        return int(n) * (4.0 / int(d))
    except Exception:  # noqa: BLE001
        return 4.0


def realize_progression(name, frame: dict | None = None) -> dict:
    """名前付き進行を C基準で確定realize（1コード=1小節）。返り #85 items 形。
    未知の名前は {"items": [], "edges": []}（呼び側が Claude 知識へフォールバック可）。"""
    found = find_progression(name)
    if not found:
        return {"items": [], "edges": []}
    canon, entry = found
    frame = normalize_frame(frame)
    bpb = _beats_per_bar(frame.get("meter"))
    chords = [
        {"root": root, "quality": quality, "start": round(i * bpb, 3), "dur": round(bpb, 3)}
        for i, (root, quality) in enumerate(entry["degrees"])
    ]
    return {
        "items": [{"kind": "chord_progression", "content": {"chords": chords}, "label": f"{canon}進行"[:24]}],
        "edges": [],
    }
