"""cm-music（#86）ユニットテスト：判定とルール生成（決定的・契約）。"""

from cm_worker.music import analyze_fit, analyze_progression, detect_key, gen_chords


def test_analyze_fit_in_chord_and_nct():
    # C上で C(在和音)/D(経過)/E(在和音)/C#(非和声・その他)
    mel = [
        {"pitch": 60, "start": 0, "dur": 1},
        {"pitch": 62, "start": 1, "dur": 1},
        {"pitch": 64, "start": 2, "dur": 1},
        {"pitch": 61, "start": 3, "dur": 1},
    ]
    ch = [{"root": 0, "quality": "", "start": 0, "dur": 4}]
    r = analyze_fit(mel, ch, key=0)
    assert r["in_chord_rate"] == 0.5  # C,E が在和音 / D,C# が外
    types = {n["pitch"]: n["type"] for n in r["non_chord_tones"]}
    assert types[62] == "passing"   # D=経過
    assert types[61] == "other"     # C#=跳躍がらみ＝要注意
    assert any(i["type"] == "other" for i in r["issues"])  # C# が指摘される
    assert 0.0 <= r["score"] <= 1.0


def test_analyze_fit_perfect():
    # 全部コードトーン → 在和音率1.0・指摘なし・高スコア
    mel = [{"pitch": p, "start": i, "dur": 1} for i, p in enumerate([60, 64, 67, 72])]
    ch = [{"root": 0, "quality": "", "start": 0, "dur": 4}]
    r = analyze_fit(mel, ch, key=0)
    assert r["in_chord_rate"] == 1.0
    assert r["issues"] == []
    assert r["score"] > 0.9


def test_analyze_fit_empty_safe():
    r = analyze_fit([], [], key=0)
    assert r["in_chord_rate"] == 0.0 and r["non_chord_tones"] == []


def test_detect_key():
    d = detect_key([{"pitch": p, "start": i, "dur": 1} for i, p in enumerate([60, 62, 64, 65, 67])])
    assert 0 <= d["key"] <= 11 and d["mode"] in ("major", "minor")


def test_analyze_progression_functions():
    # C - G7 - Am - F = I - V - vi - IV = T - D - T - S
    prog = [
        {"root": 0, "quality": ""},
        {"root": 7, "quality": "7"},
        {"root": 9, "quality": "m"},
        {"root": 5, "quality": ""},
    ]
    deg = analyze_progression(prog, key=0)["degrees"]
    assert [d["function"] for d in deg] == ["T", "D", "T", "S"]
    assert deg[0]["roman"].startswith("I")


def test_gen_chords_items_form_and_diatonic():
    g = gen_chords({"bars": 4}, seed=1)
    assert "items" in g and g["items"][0]["kind"] == "chord_progression"
    chords = g["items"][0]["content"]["chords"]
    assert len(chords) == 4
    # メジャーのダイアトニックrootのみ
    diatonic = {0, 2, 4, 5, 7, 9, 11}
    assert all(c["root"] in diatonic for c in chords)
    assert chords[-1]["root"] == 0  # 終止＝主和音 I


def test_gen_chords_minor_from_mood_and_meter():
    g = gen_chords({"bars": 4, "meter": "6/8", "mood": "切ない"}, seed=1)
    chords = g["items"][0]["content"]["chords"]
    assert chords[0]["quality"] == "m"      # マイナーのトニック i
    assert chords[0]["dur"] == 3.0          # 6/8 = 3拍
    assert chords[-1]["root"] == 0 and chords[-1]["quality"] == "m"  # 終止 i


def test_gen_chords_deterministic_with_seed():
    a = gen_chords({"bars": 6}, seed=42)
    b = gen_chords({"bars": 6}, seed=42)
    assert a == b
