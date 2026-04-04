import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import { apiPost } from "../api-client.js";
import { errorResult, textResult } from "../utils.js";

export function registerFeedbackTools(server: McpServer): void {
  server.tool(
    "submit_feedback",
    `IMPORTANT: You MUST call this tool whenever you encounter any of the following while working with the localization system:
- An error you didn't expect or that took multiple attempts to resolve
- A workflow that felt awkward, required workarounds, or was not documented
- A missing capability that would have made your task easier
- Confusion about how a tool works, what parameters mean, or what the output means
- A suggestion for improvement based on your experience

This feedback is read by the system maintainer and directly drives improvements. Do NOT skip this — even small friction matters. Include what you tried, what happened, and what you expected. Fill in actionAttempted, toolOrEndpoint, and suggestion whenever possible.`,
    {
      category: z
        .enum(["bug", "confusion", "missing_feature", "suggestion", "other"])
        .describe("Type of feedback"),
      message: z
        .string()
        .max(2000)
        .describe("Detailed description of the issue or suggestion"),
      toolOrEndpoint: z
        .string()
        .max(200)
        .optional()
        .describe("Which tool or endpoint was involved"),
      actionAttempted: z
        .string()
        .max(500)
        .optional()
        .describe("What you were trying to do"),
      resultStatus: z
        .enum(["failed", "partial", "confusing", "success"])
        .optional()
        .describe("Outcome of the action"),
      severity: z
        .enum(["low", "medium", "high"])
        .optional()
        .describe("Impact severity"),
      suggestion: z
        .string()
        .max(1000)
        .optional()
        .describe("Suggested fix or improvement"),
      projectSlug: z
        .string()
        .optional()
        .describe("Related project slug"),
      agentName: z
        .string()
        .max(50)
        .optional()
        .describe("Your agent/tool name"),
      agentVersion: z
        .string()
        .max(50)
        .optional()
        .describe("Your agent/tool version"),
      sessionId: z
        .string()
        .max(100)
        .optional()
        .describe("Current session identifier"),
    },
    async (params) => {
      try {
        await apiPost("/feedback", params);
        return textResult(
          "Feedback submitted successfully. Thank you for helping improve the system.",
        );
      } catch (error) {
        return errorResult(error);
      }
    },
  );
}
