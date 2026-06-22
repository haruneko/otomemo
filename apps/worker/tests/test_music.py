"""cm-music（#86）ユニットテスト：判定とルール生成（決定的・契約）。"""

from cm_worker.music import (
    analyze_fit,
    analyze_progression,
    band,
    detect_key,
    gen_bass,
    gen_chords,
    gen_drums,
    gen_melody,
    normalize_chords,
    normalize_frame,
)


def test_normalize_frame_absorbs_claude_drift():
    # #86 口1/口2共通の正規化層：Claudeの揺れ(key="A"/time_signature/bpm/範囲外bars)を吸収
    f = normalize_frame({"key": "A", "time_signature": "6/8", "bpm": 120, "bars": 99, "mood": "切ない"})
    assert f["key"] == 9 and f["meter"] == "6/8" and f["tempo"] == 120 and f["bars"] == 16 and f["mood"] == "切ない"
    assert normalize_frame({"key": "C#"})["key"] == 1
    assert normalize_frame(None) == {}  # 安全
    assert "key" not in normalize_frame({"key": "Zzz"})  # 不正は落とす


def test_normalize_chords_root_names():
    cs = normalize_chords([{"root": "C", "quality": "", "start": 0, "dur": 4}, {"root": "A", "quality": "m", "start": 4, "dur": 4}])
    assert [c["root"] for c in cs] == [0, 9]
    assert normalize_chords(None) == []


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


def test_gen_chords_starts_and_ends_on_tonic_seed_independent():
    # seedに依らず開始・終止が主和音(度数1=root0)・全ダイアトニック
    diatonic = {0, 2, 4, 5, 7, 9, 11}
    for s in range(20):
        chords = gen_chords({"bars": 4}, seed=s)["items"][0]["content"]["chords"]
        assert chords[0]["root"] == 0 and chords[-1]["root"] == 0
        assert all(c["root"] in diatonic for c in chords)


def test_gen_chords_bars_clamped():
    assert len(gen_chords({"bars": 0})["items"][0]["content"]["chords"]) == 1
    assert len(gen_chords({"bars": 100})["items"][0]["content"]["chords"]) == 16
    assert len(gen_chords({"bars": -3})["items"][0]["content"]["chords"]) == 1


def test_analyze_fit_accepts_string_root():
    # root が音名("C")でも落ちず正しく判定（堅牢化）
    mel = [{"pitch": 60, "start": 0, "dur": 1}, {"pitch": 64, "start": 1, "dur": 1}]
    r = analyze_fit(mel, [{"root": "C", "quality": "", "start": 0, "dur": 2}], key=0)
    assert r["in_chord_rate"] == 1.0


def test_gen_melody_fits_given_chords():
    # #86 ルールメロは渡したコードに"合う"ことを保証＝analyze_fit が高スコア
    g = gen_chords({"bars": 4}, seed=7)
    chords = g["items"][0]["content"]["chords"]
    m = gen_melody({"bars": 4}, chords=chords, seed=7)
    notes = m["items"][0]["content"]["notes"]
    assert m["items"][0]["kind"] == "melody" and len(notes) == 16  # 4小節×4拍
    fit = analyze_fit(notes, chords, key=0)
    assert fit["in_chord_rate"] >= 0.6   # 拍頭コードトーン拘束で高い当てはまり
    assert fit["score"] >= 0.6
    # 全音スケール内（外し音ゼロ）
    assert fit["scale_outside_rate"] == 0.0


def test_gen_melody_deterministic():
    assert gen_melody({"bars": 2}, seed=1) == gen_melody({"bars": 2}, seed=1)


def test_gen_bass_fits_chords_low_register():
    chords = gen_chords({"bars": 4}, seed=5)["items"][0]["content"]["chords"]
    res = gen_bass({"bars": 4}, chords=chords, seed=5)
    assert res["items"][0]["kind"] == "bass"  # #bass 絶対モード(notes)を bass kind で返す
    notes = res["items"][0]["content"]["notes"]
    assert all(36 <= n["pitch"] <= 48 for n in notes)  # 低域
    # root/5th はコードトーン → 当てはまり高い
    assert analyze_fit(notes, chords, key=0)["in_chord_rate"] >= 0.8


def test_melody_similarity_transposition_invariant():
    # #92 移調不変・同型1.0・別物低
    from cm_worker.music import find_similar, melody_similarity

    a = [{"pitch": p, "start": i, "dur": 1} for i, p in enumerate([60, 62, 64, 65])]
    transposed = [{"pitch": n["pitch"] + 5, "start": n["start"], "dur": 1} for n in a]
    diff = [{"pitch": p, "start": i, "dur": 1} for i, p in enumerate([60, 67, 59, 72])]
    assert melody_similarity(a, a) == 1.0
    assert melody_similarity(a, transposed) == 1.0  # 移調不変
    assert melody_similarity(a, diff) < 0.5
    ranked = find_similar(a, [{"id": "x", "notes": diff}, {"id": "y", "notes": transposed}], top=2)
    assert ranked[0]["id"] == "y"  # 近い順


def test_fit_to_chords_snaps_other_keeps_passing():
    # #91 補正：other(正当でない外し音)はコードトーンへ、経過は残す、スコア改善
    from cm_worker.music import fit_to_chords

    mel = [
        {"pitch": 60, "start": 0, "dur": 1},
        {"pitch": 62, "start": 1, "dur": 1},  # D = 経過
        {"pitch": 64, "start": 2, "dur": 1},
        {"pitch": 61, "start": 3, "dur": 1},  # C# = other（要補正）
    ]
    ch = [{"root": 0, "quality": "", "start": 0, "dur": 4}]
    res = fit_to_chords(mel, ch, key=0)
    notes = res["items"][0]["content"]["notes"]
    assert notes[1]["pitch"] == 62  # 経過は残す
    assert notes[3]["pitch"] != 61 and notes[3]["pitch"] % 12 in {0, 4, 7}  # other→コードトーン
    meta = res["items"][0]["meta"]
    assert meta["fit"]["score"] > meta["fit_before"]  # 改善


def test_gen_drums_valid_pattern():
    g = gen_drums({}, seed=1)
    r = g["items"][0]["content"]["rhythm"]
    assert g["items"][0]["kind"] == "rhythm" and r["steps"] == 16
    names = {la["name"] for la in r["lanes"]}
    assert {"Kick", "Snare", "HiHat"} <= names
    assert 4 in next(la["hits"] for la in r["lanes"] if la["name"] == "Snare")  # バックビート
    assert gen_drums({}, seed=1) == gen_drums({}, seed=1)  # 決定的


# ---- #bass S2 相対モードの解決エンジン（design「ベース kind=bass・2モード」より） ----

def test_band_places_pc_into_E1_register():
    # band(pc)=28+((pc-4)%12)。E1(28)..D#2(39) 帯の代表音へ。
    from cm_worker.music import band

    assert band(4) == 28   # E → E1（床）
    assert band(0) == 36   # C → C2
    assert band(7) == 31   # G → G1
    assert band(3) == 39   # D# → D#2（帯の上端）
    assert band(5) == 29   # F → F1
    # どの pc でも 28..39 帯に収まる
    assert all(28 <= band(pc) <= 39 for pc in range(12))


def test_resolve_relative_bass_root_fifth_octave_on_C_major():
    # C調 I=C（コード無し→tonic を I とみなす）。R→36, 5→31(G1), 8→48
    from cm_worker.music import resolve_relative_bass

    pattern = [
        {"step": 0, "degree": "R", "dur": 1},
        {"step": 1, "degree": "5", "dur": 1},
        {"step": 2, "degree": "8", "dur": 1},
    ]
    notes = resolve_relative_bass(pattern, chords=None, key=0)
    # 度数はルートから上（修正）：root=C2(36), 5=root+7=43(G2), 8=root+12=48(C3)
    assert [n["pitch"] for n in notes] == [36, 43, 48]


def test_resolve_relative_bass_third_seventh_from_chord_quality():
    # コード G7 上（度数はルートから上）：root=band(7)=31(G1), 3=root+4=35(B1/長3度), 7=root+10=41(F2/短7度)
    from cm_worker.music import resolve_relative_bass

    pattern = [
        {"step": 0, "degree": "R", "dur": 1},
        {"step": 1, "degree": "3", "dur": 1},
        {"step": 2, "degree": "7", "dur": 1},
    ]
    chords = [{"root": 7, "quality": "7", "start": 0, "dur": 4}]
    notes = resolve_relative_bass(pattern, chords, key=0)
    assert [n["pitch"] for n in notes] == [31, 35, 41]


def test_resolve_relative_bass_minor_third():
    # Am 上の 3度は短3度（C, pc=0）→ band(0)=36
    from cm_worker.music import resolve_relative_bass

    pattern = [{"step": 0, "degree": "3", "dur": 1}]
    chords = [{"root": 9, "quality": "m", "start": 0, "dur": 4}]
    notes = resolve_relative_bass(pattern, chords, key=0)
    assert notes[0]["pitch"] == band(0)  # C → 36


def test_resolve_relative_bass_approach_chromatic_to_next_root():
    # approach=次の解決ルートへ半音で寄せる（歩くベース）。
    # C(0) のあと G(7) のルートへ寄せる：G帯=band(7)=31 の半音下=30（近い方）。
    from cm_worker.music import band, resolve_relative_bass

    pattern = [
        {"step": 0, "degree": "R", "dur": 1},
        {"step": 1, "degree": "approach", "dur": 1},
    ]
    chords = [
        {"root": 0, "quality": "", "start": 0, "dur": 1},
        {"root": 7, "quality": "", "start": 1, "dur": 1},
    ]
    notes = resolve_relative_bass(pattern, chords, key=0)
    assert notes[0]["pitch"] == band(0)  # C2=36
    # 次ルート G の帯代表=31、半音上下(30/32)の近い方＝approach 前の音(36)に近い 32 ではなく
    # 解決先(31)へ"寄せる"半音＝31±1 のうち直前音に近い側 → 32
    assert notes[1]["pitch"] in (30, 32)


def test_resolve_relative_bass_no_chord_uses_key_tonic():
    # chords 空 → key の tonic を I コードとみなす（単体プレビュー）。key=2(D) → R=band(2)=38
    from cm_worker.music import band, resolve_relative_bass

    notes = resolve_relative_bass([{"step": 0, "degree": "R", "dur": 2}], chords=None, key=2)
    assert notes[0]["pitch"] == band(2)
    assert notes[0]["start"] == 0.0 and notes[0]["dur"] == 0.5  # step→拍（1step=16分=0.25拍）×2


def test_resolve_relative_bass_step_timing_quarter_grid():
    # step→拍：1step=16分=0.25拍。dur は step 数。
    from cm_worker.music import resolve_relative_bass

    pattern = [{"step": 4, "degree": "R", "dur": 4}]  # 2拍目頭から1拍
    notes = resolve_relative_bass(pattern, chords=None, key=0)
    assert notes[0]["start"] == 1.0 and notes[0]["dur"] == 1.0


def test_resolve_relative_bass_floor_not_below_28():
    # 床(28)より下は出さない。approach が 27 になるケースは床へクランプ or 1oct上げ。
    from cm_worker.music import resolve_relative_bass

    notes = resolve_relative_bass([{"step": 0, "degree": "R", "dur": 1}], chords=None, key=4)  # E→band=28（床ちょうど）
    assert all(n["pitch"] >= 28 for n in notes)


def test_resolve_relative_bass_empty_safe():
    from cm_worker.music import resolve_relative_bass

    assert resolve_relative_bass([], None, key=0) == []
    assert resolve_relative_bass(None, None, key=0) == []


# --- #98 名前付き進行DB（C基準・確定realize） ---
def test_named_progression_marunouchi_exact():
    # 丸の内進行＝FM7-E7-Am7-Gm7-C7（C基準）。記憶でなく確定realize。
    from cm_worker.music import realize_progression

    res = realize_progression("丸の内進行", {"meter": "4/4"})
    chords = res["items"][0]["content"]["chords"]
    pairs = [(c["root"], c["quality"]) for c in chords]
    assert pairs == [(5, "maj7"), (4, "7"), (9, "m7"), (7, "m7"), (0, "7")]
    # 1コード1小節・4/4＝4拍刻み
    assert chords[0]["start"] == 0.0 and chords[0]["dur"] == 4.0
    assert chords[1]["start"] == 4.0


def test_named_progression_aliases_and_meter():
    from cm_worker.music import realize_progression

    # 別名（小室/6451）でも引ける。6/8＝1小節3拍。
    res = realize_progression("6451", {"meter": "6/8"})
    chords = res["items"][0]["content"]["chords"]
    pairs = [(c["root"], c["quality"]) for c in chords]
    assert pairs == [(9, "m"), (5, ""), (7, ""), (0, "")]  # Am-F-G-C
    assert chords[0]["dur"] == 3.0  # 6/8→3拍


def test_named_progression_blues_12bars():
    from cm_worker.music import realize_progression

    res = realize_progression("12小節ブルース", {"meter": "4/4"})
    chords = res["items"][0]["content"]["chords"]
    assert len(chords) == 12
    assert all(c["quality"] == "7" for c in chords)  # 全部ドミナント7
    assert chords[4]["root"] == 5  # 5小節目はIV(F)


def test_named_progression_unknown_returns_empty():
    from cm_worker.music import realize_progression, find_progression

    assert find_progression("存在しない適当な名前") is None
    assert realize_progression("存在しない適当な名前", {}) == {"items": [], "edges": []}


def test_named_progression_short_query_no_false_match():
    # 極短クエリ(2文字以下)はエイリアスの部分一致で誤realizeしない（"ii"/"12"/"45"）。
    from cm_worker.music import find_progression

    for q in ("ii", "12", "45", "64", "1", "5"):
        assert find_progression(q) is None, q
    # 3文字以上の正当な別名表記は引ける（"251"=ツーファイブ・"two"=JtToU=丸の内）。
    assert find_progression("251")[0] == "ツーファイブ"
    assert find_progression("two")[0] == "丸の内"
