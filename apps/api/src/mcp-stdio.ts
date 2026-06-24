import { mkdirSync } from "node:fs";
import { dirname } from "node:path";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { openDb } from "./db";
import { Core } from "./core";
import { buildMcpServer } from "./mcp";

// MCP stdio エントリ：Claude Code/Desktop から spawn される。
// stdout は MCP プロトコル専用なので console.log 禁止。
const dbPath = process.env.CM_DB ?? "./data/cm.sqlite";
if (dbPath !== ":memory:") mkdirSync(dirname(dbPath), { recursive: true });

const core = new Core(openDb(dbPath));
// CM_MCP_SURFACE=chat で 10 verbs だけ公開（ラッパー/チャット用）。既定 full（worker/旧互換）。
const surface = process.env.CM_MCP_SURFACE === "chat" ? "chat" : "full";
const server = buildMcpServer(core, { surface });
const transport = new StdioServerTransport();
await server.connect(transport);
