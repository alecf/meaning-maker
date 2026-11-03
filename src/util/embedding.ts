/**
 * Provider-agnostic embedding abstractions. Nothing in here may depend on
 * Cloudflare bindings or the AI SDK; concrete implementations live in
 * `workersAiEmbedder.ts` and `kvEmbeddingCache.ts`.
 */

export interface Embedder {
  /**
   * Stable identity of everything that affects the produced vector (model id
   * plus options such as pooling). Used as part of the cache key.
   */
  readonly id: string;
  embed(text: string): Promise<number[]>;
}

export interface EmbeddingCache {
  get(key: string): Promise<number[] | null>;
  put(key: string, value: number[]): Promise<void>;
}

/** Bump when the cache key format or stored value format changes. */
export const CACHE_SCHEMA_VERSION = 1;

/** JSON serialization with object keys sorted, so equal values serialize equally. */
export function stableStringify(value: unknown): string {
  return JSON.stringify(value, (_key, v: unknown) =>
    v && typeof v === "object" && !Array.isArray(v)
      ? Object.fromEntries(
          Object.entries(v as Record<string, unknown>).sort(([a], [b]) =>
            a < b ? -1 : a > b ? 1 : 0,
          ),
        )
      : v,
  );
}

/** sha256 hex of {schema version, embedder id, text} via Web Crypto. */
export async function embeddingCacheKey(
  embedderId: string,
  text: string,
): Promise<string> {
  const payload = stableStringify({
    v: CACHE_SCHEMA_VERSION,
    embedder: embedderId,
    text,
  });
  const digest = await crypto.subtle.digest(
    "SHA-256",
    new TextEncoder().encode(payload),
  );
  return Array.from(new Uint8Array(digest), (b) =>
    b.toString(16).padStart(2, "0"),
  ).join("");
}

/**
 * Wrap an embedder with a read-through cache. Cache failures are logged and
 * swallowed: a failed read falls through to the embedder, and a failed write
 * (e.g. KV's daily write quota) never fails the request.
 */
export function withEmbeddingCache(
  embedder: Embedder,
  cache: EmbeddingCache,
): Embedder {
  return {
    id: embedder.id,
    async embed(text: string): Promise<number[]> {
      const key = await embeddingCacheKey(embedder.id, text);

      try {
        const cached = await cache.get(key);
        if (cached) {
          return cached;
        }
      } catch (error) {
        console.warn("embedding cache read failed", error);
      }

      const embedding = await embedder.embed(text);

      try {
        await cache.put(key, embedding);
      } catch (error) {
        console.warn("embedding cache write failed", error);
      }
      return embedding;
    },
  };
}
