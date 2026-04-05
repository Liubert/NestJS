#!/usr/bin/env node

const args = process.argv.slice(2);

if (args[0] === "setup") {
  const { runSetup } = await import("./setup.js");
  await runSetup(args.slice(1));
  process.exit(0);
}

import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { createServer } from "./server.js";
import { apiGet } from "./api-client.js";

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
    "[localization-mcp] WARNING: BACKEND_URL is not set. Falling back to http://localhost:8080.\n" +
      "  Set BACKEND_URL explicitly to avoid accidentally targeting the wrong environment.\n",
  );
}

const server = createServer();

// Non-blocking startup token validation
(async () => {
  try {
    await apiGet("/translations/projects", { limit: 1 });
  } catch (err: unknown) {
    if (err && typeof err === "object" && "status" in err && (err as { status: number }).status === 401) {
      process.stderr.write(
        "[localization-mcp] ERROR: Token validation failed (401). The MCP_TOKEN is invalid or expired.\n" +
          "  Most likely cause: localization-mcp is registered per-project (.mcp.json), overriding the global config.\n" +
          "  Fix: claude mcp remove localization && claude mcp add -s user localization -e MCP_TOKEN=<token> -e BACKEND_URL=<url> -- npx -y localization-mcp-server\n",
      );
    } else {
      process.stderr.write(
        "[localization-mcp] WARNING: Startup health check failed. BACKEND_URL may be misconfigured or the server is unreachable.\n" +
          `  Error: ${err instanceof Error ? err.message : String(err)}\n`,
      );
    }
  }
})();

const transport = new StdioServerTransport();

await server.connect(transport);
