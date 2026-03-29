#!/usr/bin/env node

const args = process.argv.slice(2);

if (args[0] === "setup") {
  const { runSetup } = await import("./setup.js");
  await runSetup(args.slice(1));
  process.exit(0);
}

import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { createServer } from "./server.js";

// Load .env from the mcp-server directory (one level above dist/)
if (process.env.NODE_ENV !== "production") {
  const { default: dotenv } = await import("dotenv");
  const { fileURLToPath } = await import("url");
  const { dirname, resolve } = await import("path");
  const __dirname = dirname(fileURLToPath(import.meta.url));
  dotenv.config({ path: resolve(__dirname, "..", ".env") });
}

if (!process.env.MCP_TOKEN) {
  process.stderr.write(
    "[localization-mcp] WARNING: MCP_TOKEN is not set. All API calls will fail with 401.\n",
  );
}

if (!process.env.BACKEND_URL) {
  process.stderr.write(
    "[localization-mcp] BACKEND_URL not set, defaulting to http://localhost:3000\n",
  );
}

const server = createServer();
const transport = new StdioServerTransport();

await server.connect(transport);
