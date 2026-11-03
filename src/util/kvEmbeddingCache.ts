import type { EmbeddingCache } from "./embedding";

/** Embedding cache backed by a Workers KV namespace. Stores the bare vector as JSON. */
export function createKVEmbeddingCache(kv: KVNamespace): EmbeddingCache {
  return {
    async get(key: string): Promise<number[] | null> {
      return await kv.get<number[]>(key, "json");
    },
    async put(key: string, value: number[]): Promise<void> {
      await kv.put(key, JSON.stringify(value));
    },
  };
}
