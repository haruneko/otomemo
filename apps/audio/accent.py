#!/usr/bin/env python
"""日本語アクセント抽出（pyopenjtalk full-context → モーラ列＋アクセント核＋アクセント句境界）。

- 位置づけ: docs/research/2026-07-15-kariuta-accent-feasibility.md（L3）の POC を本実装化。
  api 側 `apps/api/src/accent.ts`（audio-analyze.ts と同型の spawn ヘルパ）から叩かれ、
  `analyzeLyricFit(opts.accents)`（@cm/music-core prosody.ts）へ語ごとの核位置を供給する。
- 入力: argv[1] にテキスト1本、または stdin に 1行1文。かな/漢字混在いずれも可（pyopenjtalk が読みを解決）。
- 出力: JSON 配列（stdout）。各要素＝1文。TS 側が使う主フィールドは `phrases`（アクセント句ごとの
  {moras, kernel}）。`moras`/`trans`/`hl`（デバッグ・可視化用）も併載。
- 依存: pyopenjtalk（MIT）＋同梱辞書 open_jtalk_dic（修正BSD・商用可）。PyTorch 不要・軽量（spawn 0.1〜0.2秒）。

SSOT: モーラ分割の正典は Python（pyopenjtalk）。TS splitMora はかな読みが手元にある高速パス。
本スクリプトは analyzeLyricFit のアクセント核供給に徹する＝モーラ数（phrases[].moras）は
呼び側の syllable 数（=音符数）と突合し、一致しない時は TS 側で内蔵ヒューリスティックへ graceful fallback。
"""
import sys
import re
import json
import pyopenjtalk

# 母音・特殊拍＝モーラの核（openjtalk 音素表記）。大文字=無声化母音も核として扱う。
VOWELS = {"a", "i", "u", "e", "o", "A", "I", "U", "E", "O"}
MORA_NUCLEI = VOWELS | {"N", "cl"}  # N=撥音ん cl=促音っ


def parse_label(lab):
    """1音素の HTS full-context ラベルから必要フィールドを抜く。"""
    m = re.search(r"\-(.*?)\+", lab)
    p = m.group(1) if m else "xx"  # p3=現在音素
    # A:a1+a2+a3 … a1=アクセント核までの相対位置(0で核), a2=アクセント句内の位置(前から1始まり)
    a = re.search(r"/A:([+\-]?\d+)\+(\d+)\+(\d+)", lab)
    a1 = int(a.group(1)) if a else None
    a2 = int(a.group(2)) if a else None
    # F:f1_f2#… f1=アクセント句のモーラ数, f2=アクセント型(核位置,0=平板)
    f = re.search(r"/F:(\d+)_(\d+)#", lab)
    f1 = int(f.group(1)) if f else None
    f2 = int(f.group(2)) if f else None
    return {"p": p, "a1": a1, "a2": a2, "f1": f1, "f2": f2}


def extract(text):
    labels = [parse_label(l) for l in pyopenjtalk.extract_fullcontext(text)]
    # 音素→モーラへ畳む。子音を溜め、母音/N/cl が来たらモーラ確定。
    moras = []  # {phones, a1, a2, f1, f2}
    buf = []
    for L in labels:
        p = L["p"]
        if p in ("sil", "pau", "xx"):
            buf = []  # 句/文境界＝溜めを捨てる
            continue
        buf.append(p)
        if p in MORA_NUCLEI:
            moras.append({"phones": buf[:], "a1": L["a1"], "a2": L["a2"], "f1": L["f1"], "f2": L["f2"]})
            buf = []

    # 各モーラの H/L を型(f2)と句内位置(a2)から東京式で決める。
    hl = []
    for m in moras:
        f2, a2 = m["f2"], m["a2"]
        if f2 == 0:              # 平板：1モーラ目 Low, 以降 High
            h = 0 if a2 == 1 else 1
        elif f2 == 1:            # 頭高：1モーラ目 High, 以降 Low
            h = 1 if a2 == 1 else 0
        else:                    # 中高/尾高：1 Low, 2..核 High, 核+1.. Low
            h = 1 if (2 <= a2 <= f2) else 0
        hl.append(h)

    # アクセント句境界＝句内位置(a2)が 1 に戻った所（I:フィールドは breath group 単位で不安定）。
    ap_id = []
    cur = 0
    for m in moras:
        if m["a2"] == 1:
            cur += 1
        ap_id.append(cur)

    # 隣接モーラ間の遷移（M3 §1.3: UP/DOWN/FLAT・句境界は "|"）＝デバッグ/可視化用。
    trans = []
    for i in range(len(moras)):
        if i + 1 < len(moras) and ap_id[i] == ap_id[i + 1]:
            d = hl[i + 1] - hl[i]
            trans.append("UP" if d > 0 else "DOWN" if d < 0 else "FLAT")
        else:
            trans.append("|")

    # アクセント句ごとの {moras, kernel}＝TS の accents 供給用。kernel=型(f2)は句内で一定。
    phrases = []
    if moras:
        start = 0
        for i in range(1, len(moras) + 1):
            if i == len(moras) or ap_id[i] != ap_id[start]:
                phrases.append({"moras": i - start, "kernel": moras[start]["f2"] or 0})
                start = i

    return {
        "moras": ["".join(m["phones"]) for m in moras],
        "hl": hl,
        "trans": trans,
        "phrases": phrases,
        "mora_total": len(moras),
    }


if __name__ == "__main__":
    if len(sys.argv) > 1:
        texts = [sys.argv[1]]
    else:
        texts = [l.strip() for l in sys.stdin if l.strip()]
    out = []
    for t in texts:
        try:
            out.append({"text": t, **extract(t)})
        except Exception as e:  # noqa: BLE001 一文の失敗で全滅させない（呼び側は fallback）
            out.append({"text": t, "error": str(e), "phrases": [], "mora_total": 0})
    print(json.dumps(out, ensure_ascii=False))
