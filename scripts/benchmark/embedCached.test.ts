import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { EmbeddingProvider } from "@/util/benchmark/types";
import { embedCached } from "./embedCached";
import { openVectorCache, type VectorCache } from "./vectorCache";

function fakeProvider(fails?: (texts: string[]) => boolean) {
  const embedBatch = vi.fn(async (texts: string[]) => {
    if (fails?.(texts)) throw new Error("provider failed");
    return texts.map((text) => [text.length, 1]);
  });
  return { id: "fake", embedBatch } satisfies EmbeddingProvider;
}

describe("embedCached", () => {
  let dir: string;
  let cache: VectorCache;

  beforeEach(() => {
    dir = mkdtempSync(join(tmpdir(), "embed-cached-"));
    cache = openVectorCache(dir, "p");
  });
  afterEach(() => {
    rmSync(dir, { recursive: true });
  });

  it("returns a vector per distinct text", async () => {
    const vectors = await embedCached(fakeProvider(), cache, ["a", "bb", "a"]);
    expect([...vectors.entries()]).toEqual([
      ["a", [1, 1]],
      ["bb", [2, 1]],
    ]);
  });
  it("only embeds what the cache is missing", async () => {
    cache.put("a", [9, 9]);
    const provider = fakeProvider();
    const vectors = await embedCached(provider, cache, ["a", "bb"]);
    expect(provider.embedBatch.mock.calls).toEqual([[["bb"]]]);
    expect(vectors.get("a")).toEqual([9, 9]);
  });
  it("calls nothing on a fully cached run", async () => {
    cache.put("a", [9, 9]);
    const provider = fakeProvider();
    await embedCached(provider, cache, ["a"]);
    expect(provider.embedBatch).not.toHaveBeenCalled();
  });
  it("keeps finished chunks when a later chunk fails", async () => {
    const provider = fakeProvider((texts) => texts.includes("c"));
    await expect(
      embedCached(provider, cache, ["a", "b", "c"], 2),
    ).rejects.toThrow("provider failed");
    expect(openVectorCache(dir, "p").get("b")).toEqual([1, 1]);
    expect(openVectorCache(dir, "p").get("c")).toBeUndefined();
  });
  it("gives the same Float32 values on the first run and a rerun", async () => {
    const provider: EmbeddingProvider = {
      id: "fake",
      embedBatch: async (texts) => texts.map(() => [0.1, 0.2]),
    };
    const first = await embedCached(provider, cache, ["a"]);
    const second = await embedCached(provider, openVectorCache(dir, "p"), ["a"]);
    expect(first.get("a")).toEqual(second.get("a"));
  });
  it("refuses a batch-scoped provider", async () => {
    await expect(
      embedCached({ ...fakeProvider(), batchScoped: true }, cache, ["a"]),
    ).rejects.toThrow(/batch-scoped/);
  });
});
