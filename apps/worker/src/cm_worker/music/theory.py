"""音楽理論の素片（純Python・依存なし）。コード構成音・スケール・ピッチクラス。"""

# コード品質 → ルートからの半音インターバル（content の quality に対応）
QUALITY_INTERVALS = {
    "": [0, 4, 7],          # major
    "maj": [0, 4, 7],
    "m": [0, 3, 7],         # minor
    "min": [0, 3, 7],
    "7": [0, 4, 7, 10],     # dominant7
    "maj7": [0, 4, 7, 11],
    "m7": [0, 3, 7, 10],
    "dim": [0, 3, 6],
    "m7b5": [0, 3, 6, 10],
    "aug": [0, 4, 8],
    "sus4": [0, 5, 7],
    "sus2": [0, 2, 7],
    "6": [0, 4, 7, 9],
    "m6": [0, 3, 7, 9],
}

# メジャー/ナチュラルマイナースケール（ルートからの半音）
MAJOR_SCALE = [0, 2, 4, 5, 7, 9, 11]
MINOR_SCALE = [0, 2, 3, 5, 7, 8, 10]
KEY_NAMES = ["C", "C#", "D", "D#", "E", "F", "F#", "G", "G#", "A", "A#", "B"]


_PC_BY_NAME = {"C": 0, "D": 2, "E": 4, "F": 5, "G": 7, "A": 9, "B": 11}


def norm_root(root) -> int:
    """root を 0-11 ピッチクラスへ。int はそのまま、"C#"/"Db" 等の名前も解釈（堅牢化）。"""
    if isinstance(root, (int, float)):
        return int(root) % 12
    s = str(root).strip()
    if not s:
        return 0
    base = _PC_BY_NAME.get(s[0].upper(), 0)
    for ch in s[1:]:
        if ch in ("#", "♯"):
            base += 1
        elif ch in ("b", "♭"):
            base -= 1
    return base % 12


def chord_pcs(root, quality: str) -> set[int]:
    """コードの構成ピッチクラス集合（0-11）。root は int(0-11) or 音名。未知 quality はトライアド扱い。"""
    r = norm_root(root)
    ivals = QUALITY_INTERVALS.get(str(quality), [0, 4, 7])
    return {(r + i) % 12 for i in ivals}


def scale_pcs(key: int, mode: str = "major") -> set[int]:
    """調のスケール構成ピッチクラス集合。"""
    base = MINOR_SCALE if mode == "minor" else MAJOR_SCALE
    return {(int(key) + i) % 12 for i in base}
