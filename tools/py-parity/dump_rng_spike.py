"""RNG spike（計画 v3 §5-2 M5「並行＝RNG spike」／M6c 判断①）の参照値を焼く。

CPython random.Random の random() / choices / getstate・setstate を seed 10本 × 10,000 ドローで記録し、
TS の PyRandom（packages/music-core/src/humanizeFill.ts）と完全一致するかを
packages/music-core/test/py-random-parity.test.ts が突き合わせる。
乱数の実装はバージョンで変わりうるので python_version を同梱する。
実行＝tools/py-parity/run_dump_rng_spike.sh
"""
import json
import random
import sys
from pathlib import Path

SEEDS = [0, 1, 2, 42, 1234, 65535, 99991, 2**31 - 1, 2**32 - 1, 3735928559]
N = 10_000

# 重みの型を変えて累積の丸め（float は左から加算・int は正確）を踏む。
W_FLOAT = [0.1, 0.25, 0.05, 0.3, 0.2, 0.1, 0.7, 0.01]
W_INT = [3, 1, 4, 1, 5]
W_MIXED = [1, 0.1, 2, 0.2, 0.3]
CUM = [1.5, 2.0, 4.75, 5.0, 5.0, 9.125]
POP_N = 7  # 重み無しの母集団サイズ
K = 10


def per_seed(seed: int) -> dict:
    out: dict = {"seed": seed}
    r = random.Random(seed)
    out["random"] = [r.random() for _ in range(N)]

    r = random.Random(seed)
    out["choices_unweighted"] = [r.choices(range(POP_N))[0] for _ in range(N)]
    r = random.Random(seed)
    out["choices_w_float"] = [r.choices(range(len(W_FLOAT)), W_FLOAT)[0] for _ in range(N)]
    r = random.Random(seed)
    out["choices_w_int"] = [r.choices(range(len(W_INT)), weights=W_INT)[0] for _ in range(N)]
    r = random.Random(seed)
    out["choices_w_mixed"] = [r.choices(range(len(W_MIXED)), W_MIXED)[0] for _ in range(N)]
    r = random.Random(seed)
    out["choices_cum"] = [r.choices(range(len(CUM)), cum_weights=CUM)[0] for _ in range(N)]
    r = random.Random(seed)
    ks: list = []
    for _ in range(N // K):
        ks.extend(r.choices(range(len(W_FLOAT)), W_FLOAT, k=K))
    out["choices_k_weighted"] = ks
    r = random.Random(seed)
    ku: list = []
    for _ in range(N // K):
        ku.extend(r.choices(range(POP_N), k=K))
    out["choices_k_unweighted"] = ku

    # getstate → 数回引く → setstate → 同じ列。途中状態（625 int）も記録＝TS の状態表現と照合。
    r = random.Random(seed)
    for _ in range(37):
        r.random()
    st = r.getstate()
    out["state_at_37"] = list(st[1])  # 624 語 + index
    first = [r.random() for _ in range(N)]
    r.setstate(st)
    second = [r.random() for _ in range(N)]
    assert first == second
    out["after_restore"] = second
    return out


def main() -> None:
    dest = Path(__file__).resolve().parent / "cases-rng-spike"
    dest.mkdir(exist_ok=True)
    meta = {
        "python_version": sys.version,
        "implementation": sys.implementation.name,
        "seeds": SEEDS, "n": N, "k": K, "pop_n": POP_N,
        "w_float": W_FLOAT, "w_int": W_INT, "w_mixed": W_MIXED, "cum": CUM,
    }
    (dest / "meta.json").write_text(json.dumps(meta, indent=1) + "\n")
    for s in SEEDS:
        (dest / f"seed-{s}.json").write_text(json.dumps(per_seed(s), separators=(",", ":")) + "\n")
    print(f"wrote {len(SEEDS)} seeds to {dest} ({sys.version.split()[0]})")


if __name__ == "__main__":
    main()
