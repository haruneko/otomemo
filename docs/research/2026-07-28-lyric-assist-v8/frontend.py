#!/usr/bin/env python
"""pyopenjtalk.run_frontend を1行1文で叩き、形態素ごとの
{string(表層), read(カナ読み), pron(発音), mora_size} を JSON で返す。

- bake.mjs が spans（語区間↔モーラ区間の対応）を焼くための唯一の供給源。
- verify.mjs（検証8-2）も同じスクリプトを再実行して焼き込み値と突き合わせる。
- 実行: apps/audio/.venv/bin/python frontend.py  （stdin に1行1文）
"""
import sys
import json
import pyopenjtalk

out = []
for line in sys.stdin:
    t = line.rstrip("\n")
    if not t:
        continue
    try:
        fr = pyopenjtalk.run_frontend(t)
        out.append({
            "text": t,
            "morphs": [
                {
                    "string": m["string"],
                    "read": m["read"],
                    "pron": m["pron"],
                    "mora_size": m["mora_size"],
                }
                for m in fr
            ],
        })
    except Exception as e:  # noqa: BLE001 一文の失敗で全滅させない
        out.append({"text": t, "error": str(e)})
print(json.dumps(out, ensure_ascii=False))
