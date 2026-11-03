import { describe, expect, it, vi } from "vitest";
import { embeddingCacheKey } from "./embedding";
import { createWorkersAIEmbedder, EMBEDDING_CONFIG } from "./workersAiEmbedder";

function fakeBinding(vector: number[] = [0.5, 0.5]) {
  const run = vi.fn(async () => ({ shape: [1, vector.length], data: [vector] }));
  return { binding: { run } as unknown as Ai, run };
}

describe("createWorkersAIEmbedder", () => {
  it("uses bge-large-en-v1.5 by default", () => {
    expect(EMBEDDING_CONFIG.model).toBe("@cf/baai/bge-large-en-v1.5");
  });

  it("embeds through the AI binding without network access", async () => {
    const { binding, run } = fakeBinding([1, 2, 3]);
    const embedder = createWorkersAIEmbedder(binding);
    await expect(embedder.embed("hello")).resolves.toEqual([1, 2, 3]);
    expect(run).toHaveBeenCalledWith(
      "@cf/baai/bge-large-en-v1.5",
      { text: ["hello"] },
      expect.anything(),
    );
  });

  it("has an id (and so cache keys) that changes with model and options", async () => {
    const { binding } = fakeBinding();
    const ids = [
      createWorkersAIEmbedder(binding).id,
      createWorkersAIEmbedder(binding, { model: "@cf/baai/bge-base-en-v1.5", options: {} }).id,
      createWorkersAIEmbedder(binding, { ...EMBEDDING_CONFIG, options: { pooling: "cls" } }).id,
      createWorkersAIEmbedder(binding, { ...EMBEDDING_CONFIG, options: { pooling: "mean" } }).id,
    ];
    expect(new Set(ids).size).toBe(ids.length);

    const keys = await Promise.all(ids.map((id) => embeddingCacheKey(id, "same text")));
    expect(new Set(keys).size).toBe(keys.length);
  });
});
