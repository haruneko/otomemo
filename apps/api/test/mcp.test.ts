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
    const idBody = JSON.parse(textOf(id)) as { results: { name: string; similarity: number }[]; note?: string };
    expect(idBody.results[0]!.name).toBe("カノン"); // I2(2026-07-08): 形を {results, note?} に＝確度低を明示できる
    expect(idBody.note).toBeUndefined(); // 完全一致＝確度低noteなし

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
// 研究反映：transform は fat tool 回避で reshape(feel/range)＋convert(移調/拍子・確定) に2分割。generate↔weave は入力で排他。
describe("purpose tool surface (#101)", () => {
  // ③ song_state/plan_next・② read_neta/set_lyric・① analyze_audio・#S11 start_study・WP-M5 ②プロソディ2本・WP-C3 suggest_cliche・WP-C2 suggest_key_plan を追加（10→21）。旧39は隠したまま。
  const VERBS = ["capture", "revise", "assemble", "generate", "weave", "reshape", "convert", "continue", "search", "analyze", "song_state", "plan_next", "read_neta", "set_lyric", "analyze_audio", "fetch_chords", "start_study", "suggest_lyric_rhythm", "analyze_lyric_fit", "sing_neta", "suggest_cliche", "suggest_key_plan", "suggest_form", "suggest_energy_plan", "suggest_emotion_params", "check_loop", "check_originality"];

  it("目的ツール(20)を公開する", async () => {
    const { client } = await connect();
    const names = (await client.listTools()).tools.map((t) => t.name);
    for (const n of VERBS) expect(names, n).toContain(n);
  });

  it("surface:chat は 20 verbs だけ（旧39を隠す＝モデルが旧ツールを掴まない・#100 D）", async () => {
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

  it("search: qあり検索はscope未指定でlibraryの知識ネタにも届く（機材チャット不達バグの回帰・2026-07-14）", async () => {
    const { client, core } = await connect();
    // 機材インベントリはlibrary scopeで保存されている実態を再現
    const made = core.createNeta({ kind: "knowledge", title: "機材インベントリ: 音源テスト", text: "ギター音源とドラム音源のリスト" });
    core.setScope(made.id, "library");
    // qあり＝検索：scope未指定でもlibraryが見える（ツール説明「project＋libraryから引く」に一致）
    const found = JSON.parse(textOf(await client.callTool({ name: "search", arguments: { q: "機材" } })));
    expect(found.map((n: { id: string }) => n.id)).toContain(made.id);
    // qなし＝素の一覧：従来どおりproject既定（コーパスがネタ帳一覧へ混ざらない）
    const listed = JSON.parse(textOf(await client.callTool({ name: "search", arguments: { kind: "knowledge" } })));
    expect(listed.map((n: { id: string }) => n.id)).not.toContain(made.id);
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

  it("P1：weave(target:melody) は1本に潰さず複数の候補を返す（自己進化ループ）", async () => {
    const { client } = await connect();
    const chords = [
      { root: 0, quality: "", start: 0, dur: 4 }, { root: 9, quality: "m", start: 4, dur: 4 },
      { root: 5, quality: "", start: 8, dur: 4 }, { root: 7, quality: "", start: 12, dur: 4 },
    ];
    const r = JSON.parse(textOf(await client.callTool({ name: "weave", arguments: { target: "melody", frame: { bars: 4, meter: "4/4", key: 0 }, chords } })));
    expect(Array.isArray(r.items)).toBe(true);
    expect(r.items.length).toBeGreaterThanOrEqual(2); // 候補（1本に潰さない）
    for (const it of r.items) {
      expect(it.kind).toBe("melody");
      expect((it.content.notes as unknown[]).length).toBeGreaterThan(0);
      expect(it.score).toBeUndefined(); // 総合スコアは出さない（哲学：候補まで）
    }
    // seed 明示は決定的な単一（従来の1本）。
    const one = JSON.parse(textOf(await client.callTool({ name: "weave", arguments: { target: "melody", frame: { bars: 4, meter: "4/4", key: 0 }, chords, seed: 3 } })));
    expect(one.items.length).toBe(1);
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

  it("WP-X2 check_loop は chat面に登録され所見を返す（許可漏れ/未登録の回帰ガード）", async () => {
    const core = new Core(openDb(":memory:"));
    const server = buildMcpServer(core, { surface: "chat" });
    const [ct, st] = InMemoryTransport.createLinkedPair();
    const client = new Client({ name: "t", version: "0" });
    await Promise.all([server.connect(st), client.connect(ct)]);
    const names = (await client.listTools()).tools.map((t) => t.name);
    expect(names).toContain("check_loop"); // chat面 verb と allowlist の不一致を防ぐ
    const r = JSON.parse(
      textOf(await client.callTool({ name: "check_loop", arguments: { loop: { startBar: 0, endBar: 8 }, meter: "4/4", key: 0, mode: "major", chords: [{ root: 5 }, { root: 7 }, { root: 0 }] } })),
    );
    expect(r.findings.find((f: { code: string }) => f.code === "boundary-cadence").severity).toBe("warn"); // …V→I＝閉じている
  });

  it("WP-X2 update_song が loop を受けて song_state に載る", async () => {
    const { client } = await connect();
    const song = JSON.parse(textOf(await client.callTool({ name: "capture", arguments: { kind: "song", title: "BGM" } })));
    await client.callTool({ name: "update_song", arguments: { id: song.id, loop: { startBar: 0, endBar: 16, tailBars: 1 } } });
    const st = JSON.parse(textOf(await client.callTool({ name: "song_state", arguments: { id: song.id } })));
    expect(st.song.loop).toEqual({ startBar: 0, endBar: 16, tailBars: 1 });
  });

  it("② read_neta でメロを読み、set_lyric で歌詞を音符へ流し込む", async () => {
    const { client } = await connect();
    const mel = JSON.parse(textOf(await client.callTool({ name: "capture", arguments: { kind: "melody", title: "メロ", content: { notes: [{ pitch: 60, start: 0, dur: 1 }, { pitch: 62, start: 1, dur: 1 }, { pitch: 64, start: 2, dur: 1 }] } } })));
    const r = JSON.parse(textOf(await client.callTool({ name: "set_lyric", arguments: { id: mel.id, lyrics: "やまと" } })));
    expect((r.content.notes as { syllable?: string }[]).map((n) => n.syllable)).toEqual(["や", "ま", "と"]); // 1:1 割当
    const back = JSON.parse(textOf(await client.callTool({ name: "read_neta", arguments: { id: mel.id } })));
    expect((back.content.notes as unknown[]).length).toBe(3); // read_neta で読み戻せる
  });

  it("② suggest_lyric_rhythm が歌詞→リズム型候補を返す（特殊拍を正しく扱う・WP-M5）", async () => {
    const { client } = await connect();
    const r = JSON.parse(textOf(await client.callTool({ name: "suggest_lyric_rhythm", arguments: { lyrics: "せーの" } })));
    expect(r.moraCount).toBe(3); // 長音ーも1モーラ
    const basic = (r.candidates as { id: string; slots: { role: string }[] }[]).find((c) => c.id === "basic")!;
    expect(basic.slots.map((s) => s.role)).toEqual(["onset", "tie", "onset"]); // ー=tie（直前へ延長）
    expect((r.candidates as { id: string }[]).map((c) => c.id)).toEqual(["basic", "subdivide", "tail"]);
  });

  it("② analyze_lyric_fit が set_lyric 済メロのアクセント衝突を検出（A-01赤・WP-M5）", async () => {
    const { client } = await connect();
    // 「はし」を 60→64（上昇）で歌う＝箸(頭高)なら A-01（語義誤解＝赤）
    const mel = JSON.parse(textOf(await client.callTool({ name: "capture", arguments: { kind: "melody", title: "m", content: { notes: [{ pitch: 60, start: 0, dur: 1 }, { pitch: 64, start: 1, dur: 1 }] } } })));
    await client.callTool({ name: "set_lyric", arguments: { id: mel.id, lyrics: "はし" } });
    const rep = JSON.parse(textOf(await client.callTool({ name: "analyze_lyric_fit", arguments: { id: mel.id, accents: [{ kana: "はし", kernel: 1 }] } })));
    expect(rep.contour).toEqual(["DOWN"]);
    expect((rep.hits as { ruleId: string; severity: string }[]).some((h) => h.ruleId === "A-01" && h.severity === "red")).toBe(true);
    // syllable 未設定なら誠実にエラー（捏造しない）
    const bare = JSON.parse(textOf(await client.callTool({ name: "capture", arguments: { kind: "melody", title: "b", content: { notes: [{ pitch: 60 }, { pitch: 62 }] } } })));
    const e = await client.callTool({ name: "analyze_lyric_fit", arguments: { id: bare.id } });
    expect((e as { isError?: boolean }).isError).toBe(true);
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

// A2（design #6）：MCP面の facts 射影＝チャットのコンテキスト爆発の是正。
import { serializeCompact } from "../src/mcp";
import { CHAT_VERB_NAMES } from "../src/chat-session";

async function connectChat() {
  const core = new Core(openDb(":memory:"));
  const server = buildMcpServer(core, { surface: "chat" });
  const [ct, st] = InMemoryTransport.createLinkedPair();
  const client = new Client({ name: "t", version: "0" });
  await Promise.all([server.connect(st), client.connect(ct)]);
  return { client, core };
}

// 巨大 analysis ネタの雛形（melody_f0=数千点の [t,hz|null]・他の時系列も）。
function makeAnalysis(core: Core) {
  const f0: [number, number | null][] = [];
  for (let i = 0; i < 500; i++) f0.push([i * 0.02, i % 2 === 0 ? 220 + i : null]);
  return core.createNeta({
    kind: "analysis",
    title: "アナリーゼ: テスト曲",
    text: "所見プロローグ",
    content: {
      meta: { bpm: 120, meter: 4 },
      raw: {
        beat_times: [0, 0.5, 1, 1.5, 2],
        melody_notes: [[0, 0.5, 60], [0.5, 1, 62], [1, 2, 64]],
        melody_f0: f0,
        chords_timeline: [[0, 2, "C:maj"], [2, 4, "A:min"]],
        drum_onsets: [[0, "kick", 1], [0.5, "snare", 0.8], [1, "kick", 0.9]],
      },
      overlay: { anchors: [{ t_sec: 0, meter: 4, bar_no: 1 }] },
      prose: "この曲は…",
      digest: { overview: "A1 が付ける想定の疎結合フィールド" },
    },
  });
}

describe("A2 (a) read_neta の analysis 射影（chat面）", () => {
  it("chat面＝raw の巨大時系列を統計要約に置換し、meta/prose/digest/chords_timeline は素通し", async () => {
    const { client, core } = await connectChat();
    const a = makeAnalysis(core);
    const back = JSON.parse(textOf(await client.callTool({ name: "read_neta", arguments: { id: a.id } })));
    const raw = back.content.raw;
    // melody_f0 はフル配列でなく要約（_summary/count/voiced 等）。
    expect(Array.isArray(raw.melody_f0)).toBe(false);
    expect(raw.melody_f0._summary).toBe(true);
    expect(raw.melody_f0.count).toBe(500);
    expect(raw.melody_f0.voiced_count).toBe(250);
    expect(raw.beat_times._summary).toBe(true);
    expect(raw.melody_notes._summary).toBe(true);
    expect(raw.drum_onsets.kinds.kick).toBe(2);
    // 軽量で有用なものは素通し。
    expect(raw.chords_timeline).toEqual([[0, 2, "C:maj"], [2, 4, "A:min"]]);
    expect(back.content.prose).toBe("この曲は…");
    expect(back.content.meta.bpm).toBe(120);
    expect(back.content.digest.overview).toContain("疎結合"); // A1 の digest はあれば素通し
  });

  it("fields:['melody_f0'] は指定フィールドだけフル配列を素通し（ワークベンチ用途温存）", async () => {
    const { client, core } = await connectChat();
    const a = makeAnalysis(core);
    const back = JSON.parse(textOf(await client.callTool({ name: "read_neta", arguments: { id: a.id, fields: ["melody_f0"] } })));
    expect(Array.isArray(back.content.raw.melody_f0)).toBe(true);
    expect(back.content.raw.melody_f0.length).toBe(500);
    // 指定していない beat_times は依然として要約。
    expect(back.content.raw.beat_times._summary).toBe(true);
  });

  it("full面（既定）＝analysis も丸ごと返す（bit一致・ワークベンチ/既存クライアント保護）", async () => {
    const { client, core } = await connect();
    const a = makeAnalysis(core);
    const back = JSON.parse(textOf(await client.callTool({ name: "read_neta", arguments: { id: a.id } })));
    expect(Array.isArray(back.content.raw.melody_f0)).toBe(true);
    expect(back.content.raw.melody_f0.length).toBe(500);
  });

  it("chat面でも analysis 以外の kind は不変（melody は content 素通し）", async () => {
    const { client, core } = await connectChat();
    const mel = core.createNeta({ kind: "melody", title: "m", content: { notes: [{ pitch: 60, start: 0, dur: 1 }] } });
    const back = JSON.parse(textOf(await client.callTool({ name: "read_neta", arguments: { id: mel.id } })));
    expect(back.content.notes.length).toBe(1);
  });
});

describe("A2 (b) search の要約射影", () => {
  it("chat面＝ヒットは要約（preview/_hint あり・content 丸ごとは返さない）", async () => {
    const { client, core } = await connectChat();
    makeAnalysis(core);
    core.createNeta({ kind: "chord_progression", title: "進行A", content: { chords: [{ root: 0 }, { root: 5 }] } });
    const items = JSON.parse(textOf(await client.callTool({ name: "search", arguments: { kind: "analysis" } })));
    expect(items.length).toBe(1);
    expect(items[0].id).toBeTruthy();
    expect(items[0].kind).toBe("analysis");
    expect(items[0]._hint).toBeTruthy();
    expect("content" in items[0]).toBe(false); // 巨大 content は載せない
    expect(items[0].preview).toContain("所見"); // text 冒頭
    const chs = JSON.parse(textOf(await client.callTool({ name: "search", arguments: { kind: "chord_progression" } })));
    expect(chs[0].preview).toContain("和音"); // 音楽系のサマリ
  });

  it("full面＝従来どおり content 丸ごと（既存クライアント bit一致）", async () => {
    const { client, core } = await connect();
    core.createNeta({ kind: "chord_progression", title: "進行B", content: { chords: [{ root: 7 }] } });
    const items = JSON.parse(textOf(await client.callTool({ name: "search", arguments: { kind: "chord_progression" } })));
    expect(items[0].content.chords.length).toBe(1); // content が丸ごと来る
  });
});

describe("A2 (c) ok() の数値配列インライン化（serializeCompact）", () => {
  it("数値/null だけの配列は改行なしインライン、他構造は pretty のまま", () => {
    const s = serializeCompact({ a: [1, 2, null, 3], b: { c: [[0.5, 220], [1, null]] }, d: "x" });
    expect(s).toContain("[1, 2, null, 3]"); // インライン
    expect(s).not.toContain("[\n      1"); // 数値配列は要素ごと改行しない
    expect(s).toContain("[0.5, 220]"); // 内側ペアもインライン
    expect(s).toContain('\n  "d": "x"'); // オブジェクトは pretty（改行＋インデント）
    expect(JSON.parse(s)).toEqual({ a: [1, 2, null, 3], b: { c: [[0.5, 220], [1, null]] }, d: "x" });
  });
  it("pretty より短い（膨張抑制の実効）", () => {
    const data = { melody_f0: Array.from({ length: 1000 }, (_, i) => [i * 0.02, i % 2 ? 220 : null]) };
    expect(serializeCompact(data).length).toBeLessThan(JSON.stringify(data, null, 2).length);
  });
});

describe("A2 (d) chat面 verb と CHAT_VERBS 許可リストの一致（BUG#1型の再発防止）", () => {
  it("chat面に登録された全 verb が CHAT_VERB_NAMES に含まれ、余剰も無い（機械照合）", async () => {
    const { client } = await connectChat();
    const registered = (await client.listTools()).tools.map((t) => t.name).sort();
    const allowed = [...CHAT_VERB_NAMES].sort();
    // 双方向一致＝登録漏れ(見えて使えない)も 死んだ許可(実体なし)も出さない。
    // 意図的な除外があればここに列挙する（現状ゼロ）。
    const INTENTIONAL_EXCLUSIONS: string[] = [];
    const registeredEffective = registered.filter((n) => !INTENTIONAL_EXCLUSIONS.includes(n));
    expect(registeredEffective).toEqual(allowed);
  });
  it("suggest_emotion_params が許可リストに載っている（F4 で発見した休眠バグの是正）", () => {
    expect(CHAT_VERB_NAMES).toContain("suggest_emotion_params");
  });
});
