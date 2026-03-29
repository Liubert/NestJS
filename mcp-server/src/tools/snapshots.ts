import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import { apiGet, ApiError } from "../api-client.js";

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
          return {
            content: [
              {
                type: "text" as const,
                text: `No snapshots available for project "${projectSlug}".\n\nSnapshots are created automatically when sandbox changes are pushed to production.`,
              },
            ],
          };
        }

        const rows = snapshots.map((s, i) => {
          const date = new Date(s.createdAt).toLocaleString("en-GB", {
            dateStyle: "short",
            timeStyle: "short",
          });
          return `${i + 1}. ${s.label ?? "(no label)"}\n   ID: ${s.id}\n   Created: ${date}\n   Entries: ${s.entryCount}`;
        });

        return {
          content: [
            {
              type: "text" as const,
              text: `Snapshots for "${projectSlug}" (${snapshots.length} available, max 5):\n\n${rows.join("\n\n")}`,
            },
          ],
        };
      } catch (error) {
        return errorContent(error);
      }
    },
  );
}

function errorContent(error: unknown): { content: { type: "text"; text: string }[] } {
  if (error instanceof ApiError) {
    return {
      content: [{ type: "text" as const, text: `Error ${error.status}: ${error.message}` }],
    };
  }
  return {
    content: [{ type: "text" as const, text: `Unexpected error: ${String(error)}` }],
  };
}
