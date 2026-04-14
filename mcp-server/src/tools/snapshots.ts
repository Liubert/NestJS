import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import { apiGet } from "../api-client.js";
import { errorResult, textResult } from "../utils.js";

interface SnapshotItem {
  id: string;
  label: string | null;
  createdAt: string;
  entryCount: number;
}

export function registerSnapshotTools(server: McpServer): void {
  server.tool(
    "list_snapshots",
    "List available production snapshots for a project. Snapshots are created automatically before each push to production and can be used to revert.",
    {
      projectSlug: z.string().describe("Project slug"),
    },
    async ({ projectSlug }) => {
      try {
        const snapshots = await apiGet<SnapshotItem[]>(
          `/translations/projects/${projectSlug}/sandbox/snapshots`,
        );

        if (snapshots.length === 0) {
          return textResult(
            `No snapshots available for project "${projectSlug}".\n\nSnapshots are created automatically when sandbox changes are pushed to production.`,
          );
        }

        const rows = snapshots.map((s, i) => {
          const date = new Date(s.createdAt).toLocaleString("en-GB", {
            dateStyle: "short",
            timeStyle: "short",
          });
          return `${i + 1}. ${s.label ?? "(no label)"}\n   ID: ${s.id}\n   Created: ${date}\n   Entries: ${s.entryCount}`;
        });

        return textResult(
          `Snapshots for "${projectSlug}" (${snapshots.length} available, max 5):\n\n${rows.join("\n\n")}`,
        );
      } catch (error) {
        return errorResult(error);
      }
    },
  );
}
