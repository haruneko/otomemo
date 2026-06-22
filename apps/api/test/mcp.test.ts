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
});
