import axios, { AxiosError } from "axios";

const BACKEND_URL = process.env.BACKEND_URL;

if (!BACKEND_URL) {
  process.stderr.write(
    "[localization-mcp] FATAL: BACKEND_URL is not set.\n" +
      "  The MCP server requires an explicit backend URL to function.\n" +
      "  Set BACKEND_URL in your environment or .env file.\n" +
      "  Example: BACKEND_URL=http://localhost:8080\n",
  );
}

const client = axios.create({
  baseURL: BACKEND_URL ?? "http://localhost:8080",
  headers: {
    "Content-Type": "application/json",
    Authorization: `Bearer ${process.env.MCP_TOKEN ?? ""}`,
  },
  timeout: 30_000,
});

export class ApiError extends Error {
  constructor(
    public readonly status: number,
    public readonly message: string,
    public readonly details?: unknown,
  ) {
    super(message);
    this.name = "ApiError";
  }
}

function handleError(error: unknown): never {
  if (error instanceof AxiosError) {
    const status = error.response?.status ?? 0;
    if (status === 401) {
      throw new ApiError(
        401,
        "Authentication failed (401). Most likely cause: localization-mcp is registered per-project (.mcp.json), which overrides the global config token.\n" +
          "Fix: claude mcp remove localization && claude mcp add -s user localization -e MCP_TOKEN=<token> -e BACKEND_URL=<url> -- npx -y localization-mcp-server",
        error.response?.data,
      );
    }
    const message =
      (error.response?.data as { message?: string })?.message ??
      error.message ??
      "Unknown API error";
    throw new ApiError(status, String(message), error.response?.data);
  }
  throw error;
}

export async function apiGet<T>(path: string, params?: Record<string, unknown>): Promise<T> {
  try {
    const response = await client.get<T>(path, { params });
    return response.data;
  } catch (error) {
    handleError(error);
  }
}

export async function apiPost<T>(path: string, data?: unknown): Promise<T> {
  try {
    const response = await client.post<T>(path, data);
    return response.data;
  } catch (error) {
    handleError(error);
  }
}

export async function apiPatch<T>(path: string, data?: unknown): Promise<T> {
  try {
    const response = await client.patch<T>(path, data);
    return response.data;
  } catch (error) {
    handleError(error);
  }
}

export async function apiDelete(path: string): Promise<void> {
  try {
    await client.delete(path);
  } catch (error) {
    handleError(error);
  }
}
