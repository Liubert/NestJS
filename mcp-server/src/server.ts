import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { registerEnvironmentTools } from "./tools/environment.js";
import { registerTranslationTools } from "./tools/translations.js";
import { registerSandboxWriteTools } from "./tools/sandbox-writes.js";
import { registerProjectManagementTools } from "./tools/project-management.js";
import { registerDiffTools } from "./tools/diff.js";
import { registerSnapshotTools } from "./tools/snapshots.js";
import { registerProductionTools } from "./tools/production.js";
import { registerAiTools } from "./tools/ai.js";
import { registerPrompts } from "./prompts.js";

export function createServer(): McpServer {
  const server = new McpServer({
    name: "localization-mcp-server",
    version: "1.1.0",
  });

  registerEnvironmentTools(server);
  registerTranslationTools(server);
  registerSandboxWriteTools(server);
  registerProjectManagementTools(server);
  registerDiffTools(server);
  registerSnapshotTools(server);
  registerProductionTools(server);
  registerAiTools(server);
  registerPrompts(server);

  return server;
}
