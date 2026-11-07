import type { EmbeddingProvider } from "@/util/benchmark/types";
import type { VectorCache } from "./vectorCache";

/**
 * Embeds what the cache is missing, saving after each chunk so progress
 * survives a failure. Vectors always come back through the cache, so a first
 * run and a rerun see the same Float32 values.
 */
export async function embedCached(
  provider: EmbeddingProvider,
  cache: VectorCache,
  texts: string[],
  chunkSize = 32,
): Promise<Map<string, number[]>> {
  if (provider.batchScoped) {
    throw new Error(`${provider.id} is batch-scoped, so it can't be cached`);
  }
  const unique = [...new Set(texts)];
  const pending = unique.filter((text) => !cache.get(text));
  for (let i = 0; i < pending.length; i += chunkSize) {
    const chunk = pending.slice(i, i + chunkSize);
    const vectors = await provider.embedBatch(chunk);
    chunk.forEach((text, j) => {
      cache.put(text, vectors[j]);
    });
  }
  return new Map(unique.map((text) => [text, cache.get(text) as number[]]));
}
