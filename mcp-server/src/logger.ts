import fs from "fs";
import path from "path";

const LOG_FILE =
  process.env.AUDIT_LOG_PATH ?? path.join(process.cwd(), "mcp-audit.log");

export interface AuditEntry {
  timestamp: string;
  operation: string;
  params: Record<string, unknown>;
  result: unknown;
}

export function logWrite(
  operation: string,
  params: Record<string, unknown>,
  result: unknown,
): void {
  const entry: AuditEntry = {
    timestamp: new Date().toISOString(),
    operation,
    params,
    result,
  };
  try {
    fs.appendFileSync(LOG_FILE, JSON.stringify(entry) + "\n");
  } catch {
    // Log to stderr if file write fails — do not crash the MCP server
    process.stderr.write(`[audit] Failed to write to ${LOG_FILE}: ${JSON.stringify(entry)}\n`);
  }
}
