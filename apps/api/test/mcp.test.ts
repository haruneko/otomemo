import { describe, it, expect } from "vitest";
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { InMemoryTransport } from "@modelcontextprotocol/sdk/inMemory.js";
import { openDb } from "../src/db";
import { Core } from "../src/core";
import { buildMcpServer } from "../src/mcp";

async function connect() {
  const core = new Core(openDb(":memory:"));
  const server = buildMcpServer(core);
  const [clientT, serverT] = InMemoryTransport.createLinkedPair();
  const client = new Client({ name: "test", version: "0" });
  await Promise.all([server.connect(serverT), client.connect(clientT)]);
  return { client, core };
}

const textOf = (res: unknown) =>
  ((res as { content: { text: string }[] }).content[0]!.text);

describe("mcp tool layer", () => {
  it("exposes the operation-core tools", async () => {
    const { client } = await connect();
    const names = (await client.listTools()).tools.map((t) => t.name);
    expect(names).toContain("create_neta");
    expect(names).toContain("list_neta");
    expect(names).toContain("place_child");
  });

  it("captures and searches via tool calls", async () => {
    const { client } = await connect();
    const created = await client.callTool({
      name: "create_neta",
      arguments: { kind: "melody", title: "サビ案", tags: ["サビ"] },
    });
    const neta = JSON.parse(textOf(created));
    expect(neta.id).toBeTruthy();

    const listed = await client.callTool({ name: "list_neta", arguments: { kind: "melody" } });
    expect(JSON.parse(textOf(listed)).length).toBe(1);

    const byTag = await client.callTool({ name: "list_neta", arguments: { tags: ["サビ"] } });
    expect(JSON.parse(textOf(byTag)).length).toBe(1);
  });

  it("throws a job via create_job", async () => {
    const { client } = await connect();
    const r = await client.callTool({
      name: "create_job",
      arguments: { intent: "mora_count", params: { text: "よる" } },
    });
    const job = JSON.parse(textOf(r));
    expect(job.status).toBe("queued");
    expect(job.intent).toBe("mora_count");
  });

  it("place_child x2 then remove_child by position (#44)", async () => {
    const { client, core } = await connect();
    const sec = JSON.parse(
      textOf(await client.callTool({ name: "create_neta", arguments: { kind: "section", title: "S" } })),
    );
    const mel = JSON.parse(
      textOf(await client.callTool({ name: "create_neta", arguments: { kind: "melody", title: "m" } })),
    );
    await client.callTool({ name: "place_child", arguments: { parent: sec.id, child: mel.id, position: 0 } });
    await client.callTool({ name: "place_child", arguments: { parent: sec.id, child: mel.id, position: 4 } });
    await client.callTool({ name: "remove_child", arguments: { parent: sec.id, child: mel.id, position: 0 } });
    expect(core.getComposition(sec.id)!.children.map((c) => c.position)).toEqual([4]);
  });

  it("rejects an invalid create_job intent via enum (#44)", async () => {
    const { client } = await connect();
    let errored = false;
    try {
      const res = await client.callTool({ name: "create_job", arguments: { intent: "nonsense" } });
      errored = Boolean((res as { isError?: boolean }).isError);
    } catch {
      errored = true;
    }
    expect(errored).toBe(true);
  });

  it("identify_progression / analyze_progression を read-only ツールとして公開（連想エンジン）", async () => {
    const { client } = await connect();
    const names = (await client.listTools()).tools.map((t) => t.name);
    expect(names).toContain("identify_progression");
    expect(names).toContain("analyze_progression");

    const canon = [
      { root: 0, quality: "" }, { root: 7, quality: "" }, { root: 9, quality: "m" }, { root: 4, quality: "m" },
      { root: 5, quality: "" }, { root: 0, quality: "" }, { root: 5, quality: "" }, { root: 7, quality: "" },
    ];
    const id = await client.callTool({ name: "identify_progression", arguments: { chords: canon, key: 0 } });
    expect(JSON.parse(textOf(id))[0].name).toBe("カノン");

    const an = await client.callTool({ name: "analyze_progression", arguments: { chords: canon, key: 0, mode: "major" } });
    expect(JSON.parse(textOf(an)).degrees[0].function).toBe("T");
  });

  it("explain / substitute_chord / emotion_shift も read-only 公開", async () => {
    const { client } = await connect();
    const names = (await client.listTools()).tools.map((t) => t.name);
    for (const t of ["explain_progression", "substitute_chord", "emotion_shift"]) expect(names).toContain(t);

    // 代替：V7(root7) の裏コード bII7(root1) が出る
    const sub = await client.callTool({
      name: "substitute_chord",
      arguments: { chord: { root: 7, quality: "7" }, key: 0 },
    });
    expect(JSON.parse(textOf(sub)).some((s: { root: number; kind: string }) => s.root === 1 && s.kind === "tritone_sub")).toBe(true);

    // 感情：C(root0) を darker→Cm(root0,m)
    const emo = await client.callTool({
      name: "emotion_shift",
      arguments: { chord: { root: 0, quality: "" }, dir: "darker" },
    });
    expect(JSON.parse(textOf(emo))[0]).toMatchObject({ root: 0, quality: "m" });
  });
});

// #101 目的ツール面（10 thin verbs）。機械動作名(39)を目的語へ畳む。既存39は残置(additive)、チャットは --tools で10だけ見る。
// 研究反映：transform は fat tool 回避で reshape(feel/range)＋convert(移調/拍子・確定) に2分割。generate↔fit は入力で排他。
describe("purpose tool surface (#101)", () => {
  // ③ song_state/plan_next・② read_neta/set_lyric・① analyze_audio・#S11 start_study を追加（10→17）。旧39は隠したまま。
  const VERBS = ["capture", "revise", "assemble", "generate", "fit", "reshape", "convert", "continue", "search", "analyze", "song_state", "plan_next", "read_neta", "set_lyric", "analyze_audio", "fetch_chords", "start_study"];

  it("目的ツール(17)を公開する", async () => {
    const { client } = await connect();
    const names = (await client.listTools()).tools.map((t) => t.name);
    for (const n of VERBS) expect(names, n).toContain(n);
  });

  it("surface:chat は 17 verbs だけ（旧39を隠す＝モデルが旧ツールを掴まない・#100 D）", async () => {
    const core = new Core(openDb(":memory:"));
    const server = buildMcpServer(core, { surface: "chat" });
    const [clientT, serverT] = InMemoryTransport.createLinkedPair();
    const client = new Client({ name: "t", version: "0" });
    await Promise.all([server.connect(serverT), client.connect(clientT)]);
    const names = (await client.listTools()).tools.map((t) => t.name).sort();
    expect(names).toEqual([...VERBS].sort());
    // 旧機械動作名は見えない
    expect(names).not.toContain("create_neta");
    expect(names).not.toContain("analyze_fit");
    expect(names).not.toContain("gen_chords");
  });

  it("capture→search→analyze→generate が既存エンジンへ dispatch する", async () => {
    const { client } = await connect();
    // capture = createNeta
    const cap = JSON.parse(textOf(await client.callTool({
      name: "capture",
      arguments: { kind: "chord_progression", title: "ラフ", content: { chords: [{ root: 0, quality: "", start: 0, dur: 4 }] } },
    })));
    expect(cap.id).toBeTruthy();
    // search = listNeta（scope project 既定）
    const found = JSON.parse(textOf(await client.callTool({ name: "search", arguments: { kind: "chord_progression" } })));
    expect(found.length).toBeGreaterThanOrEqual(1);
    // generate = genChords（候補返し・保存しない）
    const gen = JSON.parse(textOf(await client.callTool({ name: "generate", arguments: { kind: "chord_progression", frame: { bars: 4 } } })));
    expect(gen).toBeTruthy();
    // analyze(question:fit) = analyzeFit
    const ana = JSON.parse(textOf(await client.callTool({
      name: "analyze",
      arguments: { question: "fit", chords: [{ root: 0, quality: "", start: 0, dur: 4 }], notes: [{ pitch: 60, start: 0, dur: 1 }] },
    })));
    expect(ana).toBeTruthy();
  });

  it("analyze(question:melody) で E-rule 評価（項目別critique＋変なメロ検出）を返す", async () => {
    const { client } = await connect();
    const chords = [{ root: 0, quality: "", start: 0, dur: 4 }]; // C
    // 良メロ：順次中心・アーチ・主音(C=60)終止・強拍コードトーン。
    const good = [
      { pitch: 60, start: 0, dur: 1 }, { pitch: 62, start: 1, dur: 1 },
      { pitch: 64, start: 2, dur: 1 }, { pitch: 62, start: 3, dur: 0.5 },
      { pitch: 60, start: 3.5, dur: 0.5 },
    ];
    // 悪メロ：三全音/大跳躍だらけ・非和声音・主音で終わらない。
    const bad = [
      { pitch: 60, start: 0, dur: 1 }, { pitch: 66, start: 1, dur: 1 },
      { pitch: 61, start: 2, dur: 1 }, { pitch: 67, start: 3, dur: 1 },
    ];
    const rg = JSON.parse(textOf(await client.callTool({ name: "analyze", arguments: { question: "melody", notes: good, chords, key: 0, meter: "4/4" } })));
    const rb = JSON.parse(textOf(await client.callTool({ name: "analyze", arguments: { question: "melody", notes: bad, chords, key: 0, meter: "4/4" } })));
    // 契約：score / metrics / critique を返す。
    expect(typeof rg.score).toBe("number");
    expect(rg.metrics).toBeTruthy();
    expect(Array.isArray(rg.critique)).toBe(true);
    // 変なメロ検出：良メロ > 悪メロ、悪メロは禁則跳躍で減点。
    expect(rg.score).toBeGreaterThan(rb.score);
    expect(rb.metrics.noForbiddenLeaps).toBeLessThan(1);
    expect(rg.metrics.cadenceClose).toBe(1); // 主音終止を検出
  });

  it("analyze(question:melody) は notes 必須（無ければ誠実にエラー）", async () => {
    const { client } = await connect();
    const r = await client.callTool({ name: "analyze", arguments: { question: "melody" } });
    expect((r as { isError?: boolean }).isError).toBe(true);
    expect(textOf(r)).toContain("notes");
  });

  it("③ song_state で曲の状態を読み、plan_next で次の一手を残せる", async () => {
    const { client } = await connect();
    const song = JSON.parse(textOf(await client.callTool({ name: "capture", arguments: { kind: "song", title: "曲" } })));
    const sec = JSON.parse(textOf(await client.callTool({ name: "capture", arguments: { kind: "section", title: "A" } })));
    await client.callTool({ name: "assemble", arguments: { parent: song.id, child: sec.id } });
    const st = JSON.parse(textOf(await client.callTool({ name: "song_state", arguments: { id: song.id } })));
    expect(st.composition.children.length).toBe(1); // 構成が読める
    const pn = JSON.parse(textOf(await client.callTool({ name: "plan_next", arguments: { id: song.id, stage: "ラフ", next_action: "サビのメロを詰める" } })));
    expect(pn.next_action).toBe("サビのメロを詰める");
    const st2 = JSON.parse(textOf(await client.callTool({ name: "song_state", arguments: { id: song.id } })));
    expect(st2.song.next_action).toBe("サビのメロを詰める"); // 記録が反映される
  });

  it("② read_neta でメロを読み、set_lyric で歌詞を音符へ流し込む", async () => {
    const { client } = await connect();
    const mel = JSON.parse(textOf(await client.callTool({ name: "capture", arguments: { kind: "melody", title: "メロ", content: { notes: [{ pitch: 60, start: 0, dur: 1 }, { pitch: 62, start: 1, dur: 1 }, { pitch: 64, start: 2, dur: 1 }] } } })));
    const r = JSON.parse(textOf(await client.callTool({ name: "set_lyric", arguments: { id: mel.id, lyrics: "やまと" } })));
    expect((r.content.notes as { syllable?: string }[]).map((n) => n.syllable)).toEqual(["や", "ま", "と"]); // 1:1 割当
    const back = JSON.parse(textOf(await client.callTool({ name: "read_neta", arguments: { id: mel.id } })));
    expect((back.content.notes as unknown[]).length).toBe(3); // read_neta で読み戻せる
  });

  it("未実装のギャップは明示エラーを返す（黙って捏造しない）", async () => {
    const { client } = await connect();
    let errored = false;
    try {
      const res = await client.callTool({ name: "convert", arguments: { mode: "transpose", semitones: 2, content: { chords: [] } } });
      errored = Boolean((res as { isError?: boolean }).isError);
    } catch {
      errored = true;
    }
    expect(errored).toBe(true); // ③-4 まで確定変換(convert)は未対応＝明示エラー
  });
});
