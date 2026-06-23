"""音楽ドメインは TS 一本化（アーキ是正 S2）＝worker は api の /music に委譲する。
unit テストでは api を立てないので jobs._music をモックする（決定的な代表形を返す）。
生成/判定の **musical correctness は TS 側テスト**（generate.test.ts / fit / music-s2.test.ts）が担保し、
ここでは worker の **orchestration**（chain・fit meta 同梱・items/edges 構造）を検証する。"""

import pytest


def _fake_music(op: str, payload: dict):
    if op == "gen_chords":
        chords = [{"root": r, "quality": "", "start": i * 4, "dur": 4} for i, r in enumerate([0, 5, 7, 0])]
        return {"items": [{"kind": "chord_progression", "content": {"chords": chords}, "label": "コード"}], "edges": []}
    if op == "gen_melody":
        return {"items": [{"kind": "melody", "content": {"notes": [{"pitch": 60, "start": 0, "dur": 1}]}, "label": "メロ"}], "edges": []}
    if op == "gen_bass":
        return {"items": [{"kind": "bass", "content": {"notes": [{"pitch": 36, "start": 0, "dur": 1}]}, "label": "ベース"}], "edges": []}
    if op == "gen_drums":
        return {"items": [{"kind": "rhythm", "content": {"rhythm": {"steps": 16, "lanes": []}}, "label": "ドラム"}], "edges": []}
    if op == "gen_named_progression":
        return {"items": [{"kind": "chord_progression", "content": {"chords": [{"root": 0, "quality": "", "start": 0, "dur": 4}]}, "label": "進行"}], "edges": []}
    if op == "analyze_fit":
        return {"score": 0.9, "verdict": "good", "in_chord_rate": 1.0, "perChord": []}
    if op == "fit_to_chords":
        return {"items": [{"kind": "melody", "content": {"notes": payload.get("melody", [])}}], "edges": []}
    if op == "find_similar":
        cands = payload.get("candidates", [])
        scored = [{**{k: v for k, v in c.items() if k != "notes"}, "similarity": 0.9} for c in cands]
        return scored
    return {}


@pytest.fixture(autouse=True)
def _mock_music(monkeypatch):
    import cm_worker.jobs as jobs

    monkeypatch.setattr(jobs, "_music", _fake_music)
