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


def chord_pcs(root: int, quality: str) -> set[int]:
    """コードの構成ピッチクラス集合（0-11）。未知 quality はトライアド扱い。"""
    ivals = QUALITY_INTERVALS.get(str(quality), [0, 4, 7])
    return {(int(root) + i) % 12 for i in ivals}


def scale_pcs(key: int, mode: str = "major") -> set[int]:
    """調のスケール構成ピッチクラス集合。"""
    base = MINOR_SCALE if mode == "minor" else MAJOR_SCALE
    return {(int(key) + i) % 12 for i in base}
