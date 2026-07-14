import { describe, it, expect, afterAll } from "vitest";
import { createServer } from "node:http";
import { openDb } from "../src/db";
import { Core } from "../src/core";
import { searchNetaMerged } from "../src/semantic-search";

// 意味＋キーワード合流（HTTP /search と MCP search の共通実装）の契約。
// 経緯(2026-07-14)：MCP search が LIKE のみで「ドラム音源」等の自然な言い方が
// library の機材インベントリ(kind:knowledge)に届かなかったバグの根治。

function makeCore() {
  const core = new Core(openDb(":memory:"));
  const inv = core.createNeta({ kind: "knowledge", title: "機材インベントリ: 音源テスト", text: "ドラム/打楽器: Addictive Drums 2" });
  core.setScope(inv.id, "library");
  const mel = core.createNeta({ kind: "melody", title: "ドラム音源メモの断片", content: { notes: [] } });
  return { core, inv, mel };
}

// cm-search スタブ：どんな q でも inv を強い rel で返す。
const stubHits: { neta_id: string; score: number; rel: number }[] = [];
const stub = createServer((req, res) => {
  res.setHeader("content-type", "application/json");
  res.end(JSON.stringify(stubHits));
});
await new Promise<void>((r) => stub.listen(0, "127.0.0.1", () => r()));
const stubUrl = `http://127.0.0.1:${(stub.address() as { port: number }).port}`;
afterAll(() => stub.close());

describe("searchNetaMerged", () => {
  it("semanticUrl null＝キーワードのみ（LIKE一致・scope all横断）", async () => {
    const { core, inv } = makeCore();
    const r = await searchNetaMerged(core, { q: "機材", semanticUrl: null });
    expect(r.semanticOk).toBe(false);
    expect(r.items.map((n) => n.id)).toContain(inv.id);
    expect(r.items.find((n) => n.id === inv.id)?.matchType).toBe("exact");
  });

  it("LIKE不一致の言い方でも意味hitが合流する（機材チャット不達の回帰）", async () => {
    const { core, inv } = makeCore();
    stubHits.length = 0;
    stubHits.push({ neta_id: inv.id, score: 0.85, rel: 0.11 });
    // 「シンセ音源」は title/text に部分一致しない＝LIKEは0件、意味だけが当てる
    const r = await searchNetaMerged(core, { q: "シンセ音源", semanticUrl: stubUrl });
    expect(r.semanticOk).toBe(true);
    const hit = r.items.find((n) => n.id === inv.id);
    expect(hit?.matchType).toBe("semantic");
  });

  it("意味hitにも kind/scope フィルタが効く＋rel閾値未満は落ちる", async () => {
    const { core, inv, mel } = makeCore();
    stubHits.length = 0;
    stubHits.push({ neta_id: inv.id, score: 0.85, rel: 0.11 }, { neta_id: mel.id, score: 0.8, rel: 0.1 });
    const r = await searchNetaMerged(core, { q: "シンセ音源", kind: "knowledge", semanticUrl: stubUrl });
    expect(r.items.map((n) => n.id)).toContain(inv.id);
    expect(r.items.map((n) => n.id)).not.toContain(mel.id); // kind=knowledge で melody は落ちる
    stubHits.length = 0;
    stubHits.push({ neta_id: inv.id, score: 0.5, rel: 0.01 }); // rel < 0.07
    const weak = await searchNetaMerged(core, { q: "シンセ音源", semanticUrl: stubUrl });
    expect(weak.items.map((n) => n.id)).not.toContain(inv.id);
  });
});
