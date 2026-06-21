"""cm-music（#86）：Claude非依存の音楽理論層＝記号エンジン。

役割分担(#86)：Claudeは音符に触らない。音符づくり(gen_*)と当てはまり判定(analyze_fit)はここが担う。
- analyze_fit / detect_key / analyze_progression … 判定（"提案"の前提）
- gen_chords … ルールベース生成（機能和声）
content スキーマ（design #14）：C基準・拍ベース。melody=notes[{pitch,start,dur}]、
chord=[{root(0-11),quality,start,dur}]。戻りは #85 の items 形に合わせる。
"""

from .analyze import analyze_fit, detect_key, analyze_progression
from .correct import fit_to_chords
from .generate import gen_chords, gen_melody, gen_bass, gen_drums
from .normalize import normalize_frame, normalize_chords
from .similar import melody_similarity, find_similar

__all__ = [
    "analyze_fit", "detect_key", "analyze_progression", "fit_to_chords",
    "gen_chords", "gen_melody", "gen_bass", "gen_drums",
    "normalize_frame", "normalize_chords",
    "melody_similarity", "find_similar",
]
