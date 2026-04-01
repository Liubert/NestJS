import { ApiError } from "./api-client.js";

export type ToolResult = { content: { type: "text"; text: string }[] };

export function errorResult(error: unknown): ToolResult {
  if (error instanceof ApiError) {
    return { content: [{ type: "text" as const, text: `Error ${error.status}: ${error.message}` }] };
  }
  return { content: [{ type: "text" as const, text: `Unexpected error: ${String(error)}` }] };
}

export function textResult(text: string): ToolResult {
  return { content: [{ type: "text" as const, text }] };
}
