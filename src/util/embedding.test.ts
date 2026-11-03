import { describe, expect, it, vi } from "vitest";
import {
  type Embedder,
  type EmbeddingCache,
  embeddingCacheKey,
  stableStringify,
  withEmbeddingCache,
} from "./embedding";

function fakeEmbedder(id = "model"): Embedder {
  return { id, embed: vi.fn(async () => [0.1, 0.2, 0.3]) };
}

function memoryCache(): EmbeddingCache & { store: Map<string, number[]> } {
  const store = new Map<string, number[]>();
  return {
    store,
    get: vi.fn(async (key: string) => store.get(key) ?? null),
    put: vi.fn(async (key: string, value: number[]) => {
      store.set(key, value);
    }),
  };
}

describe("stableStringify", () => {
  it("is independent of object key order", () => {
    expect(stableStringify({ a: 1, b: { c: 2, d: 3 } })).toBe(
      stableStringify({ b: { d: 3, c: 2 }, a: 1 }),
    );
  });
});

describe("embeddingCacheKey", () => {
  const id = (model: string, options: object = {}) =>
    stableStringify({ model, options });

  it("is a deterministic sha256 hex digest", async () => {
    const key = await embeddingCacheKey(id("m"), "text");
    expect(key).toMatch(/^[0-9a-f]{64}$/);
    expect(await embeddingCacheKey(id("m"), "text")).toBe(key);
  });

  it("changes when the text changes", async () => {
    expect(await embeddingCacheKey(id("m"), "a")).not.toBe(
      await embeddingCacheKey(id("m"), "b"),
    );
  });

  it("changes when the model changes", async () => {
    expect(await embeddingCacheKey(id("m1"), "a")).not.toBe(
      await embeddingCacheKey(id("m2"), "a"),
    );
  });

  it("changes when embedding options change", async () => {
    const none = await embeddingCacheKey(id("m"), "a");
    const cls = await embeddingCacheKey(id("m", { pooling: "cls" }), "a");
    const mean = await embeddingCacheKey(id("m", { pooling: "mean" }), "a");
    expect(new Set([none, cls, mean]).size).toBe(3);
  });
});

describe("withEmbeddingCache", () => {
  it("returns a cached vector without calling the embedder", async () => {
    const embedder = fakeEmbedder();
    const cache = memoryCache();
    cache.store.set(await embeddingCacheKey("model", "hello"), [9, 9]);

    const result = await withEmbeddingCache(embedder, cache).embed("hello");
    expect(result).toEqual([9, 9]);
    expect(embedder.embed).not.toHaveBeenCalled();
  });

  it("embeds and stores just the vector on a miss", async () => {
    const cache = memoryCache();
    const result = await withEmbeddingCache(fakeEmbedder(), cache).embed(
      "hello",
    );
    expect(result).toEqual([0.1, 0.2, 0.3]);
    expect(cache.put).toHaveBeenCalledWith(
      await embeddingCacheKey("model", "hello"),
      [0.1, 0.2, 0.3],
    );
  });

  it("does not throw when the cache write fails", async () => {
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
    const cache: EmbeddingCache = {
      get: async () => null,
      put: async () => {
        throw new Error("KV write limit exceeded");
      },
    };
    await expect(
      withEmbeddingCache(fakeEmbedder(), cache).embed("hello"),
    ).resolves.toEqual([0.1, 0.2, 0.3]);
    expect(warn).toHaveBeenCalled();
    warn.mockRestore();
  });

  it("falls through to the embedder when the cache read fails", async () => {
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
    const embedder = fakeEmbedder();
    const cache: EmbeddingCache = {
      get: async () => {
        throw new Error("KV unavailable");
      },
      put: async () => {},
    };
    await expect(
      withEmbeddingCache(embedder, cache).embed("x"),
    ).resolves.toEqual([0.1, 0.2, 0.3]);
    expect(embedder.embed).toHaveBeenCalledOnce();
    warn.mockRestore();
  });
});
