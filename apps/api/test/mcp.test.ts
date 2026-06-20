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
});
