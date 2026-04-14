import { apiGet } from "./api-client.js";

interface PromptOverride {
  key: string;
  content: string;
  version: number;
  updatedAt: string;
}

const cache = new Map<string, { content: string; expiresAt: number }>();
const CACHE_TTL_MS = 60_000;
const FETCH_TIMEOUT_MS = 2_000;

/**
 * Fetches prompt content from the backend DB.
 * Returns DB override if available, otherwise returns the fallback (code default).
 * Results are cached for 60s. On any error (timeout, 404, network), falls back silently.
 */
export async function fetchPromptContent(key: string, fallback: string): Promise<string> {
  const now = Date.now();
  const cached = cache.get(key);
  if (cached && cached.expiresAt > now) {
    return cached.content;
  }

  try {
    const result = await Promise.race([
      apiGet<PromptOverride>(`/mcp-prompts/${key}`),
      new Promise<never>((_, reject) =>
        setTimeout(() => reject(new Error("prompt fetch timeout")), FETCH_TIMEOUT_MS),
      ),
    ]);
    cache.set(key, { content: result.content, expiresAt: now + CACHE_TTL_MS });
    return result.content;
  } catch {
    // 404 (no override), timeout, or network error → use code default
    return fallback;
  }
}
