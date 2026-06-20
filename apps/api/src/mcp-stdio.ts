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
const server = buildMcpServer(core);
const transport = new StdioServerTransport();
await server.connect(transport);
