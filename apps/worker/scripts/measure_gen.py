"""ルール生成 vs Claude生成 の当てはまり実測ハーネス（#86 生成移管の判断材料）。

ルール側は決定的・無料なので基線を即測れる。Claude側は claude_prompt が要りコスト高なので
既定では測らない（--claude で有効化）。判定は cm-music の analyze_fit（同じ物差し）。

使い方:
  uv run python scripts/measure_gen.py            # ルール基線のみ
  uv run python scripts/measure_gen.py --claude   # Claude側も測る(コスト注意)
"""

import statistics as st
import sys

from cm_worker.music import analyze_fit, gen_bass, gen_chords, gen_melody

FRAMES = ({"bars": 4}, {"bars": 4, "meter": "6/8", "mood": "切ない"}, {"bars": 8})


def _stats(xs: list[float]) -> str:
    return f"mean={st.mean(xs):.3f} min={min(xs):.3f} max={max(xs):.3f} p10={sorted(xs)[len(xs)//10]:.3f}"


def measure_rule(seeds: int = 50) -> None:
    mel_score, mel_in, bass_in = [], [], []
    for s in range(seeds):
        for frame in FRAMES:
            chords = gen_chords(frame, seed=s)["items"][0]["content"]["chords"]
            notes = gen_melody(frame, chords=chords, seed=s)["items"][0]["content"]["notes"]
            f = analyze_fit(notes, chords, key=0)
            mel_score.append(f["score"])
            mel_in.append(f["in_chord_rate"])
            bn = gen_bass(frame, chords=chords, seed=s)["items"][0]["content"]["notes"]
            bass_in.append(analyze_fit(bn, chords, key=0)["in_chord_rate"])
    print(f"[ルール] N={len(mel_score)} (={seeds} seed × {len(FRAMES)} frame)")
    print("  メロ score   :", _stats(mel_score))
    print("  メロ in_chord:", _stats(mel_in))
    print("  ベース in    :", _stats(bass_in))
    print(f"  メロ score<0.6 の割合: {sum(1 for x in mel_score if x < 0.6) / len(mel_score) * 100:.1f}%")


if __name__ == "__main__":
    measure_rule()
    if "--claude" in sys.argv:
        print("[Claude] gen_melody(Claude経路) を同コードで生成→analyze_fit で比較する実装を足してください"
              "（コスト高のため既定では未実行。worker の旧 Claude 生成経路を呼ぶ）。")
