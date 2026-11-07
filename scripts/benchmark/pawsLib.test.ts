import { appendFileSync, mkdtempSync, readdirSync, readFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it, vi } from "vitest";
import type { EmbeddingProvider } from "@/util/benchmark/types";
import { openSimilarityLog, type PawsPair, pairSimilarities, rocAuc } from "./pawsLib";

const tempDir = (): string => mkdtempSync(join(tmpdir(), "paws-"));

const pair = (id: string, label: 0 | 1 = 1): PawsPair => ({
  id,
  sentence1: `${id} one`,
  sentence2: `${id} two`,
  label,
});

function fakeProvider(vector: (text: string) => number[] = () => [1, 0]) {
  const embedBatch = vi.fn(async (texts: string[]) => texts.map(vector));
  return { id: "fake", embedBatch } satisfies EmbeddingProvider;
}

describe("rocAuc", () => {
  it("is 1 when every positive outranks every negative", () => {
    expect(rocAuc([0, 0, 1, 1], [0.1, 0.2, 0.8, 0.9])).toBe(1);
  });
  it("is 0 when the order is reversed", () => {
    expect(rocAuc([1, 1, 0, 0], [0.1, 0.2, 0.8, 0.9])).toBe(0);
  });
  it("gives ties half credit", () => {
    expect(rocAuc([0, 1, 0, 1], [0.5, 0.5, 0.5, 0.5])).toBe(0.5);
  });
  it("matches a worked example with a partial tie", () => {
    expect(rocAuc([0, 0, 1, 1], [0.1, 0.4, 0.4, 0.8])).toBeCloseTo(0.875);
  });
  it("throws without both classes", () => {
    expect(() => rocAuc([1, 1], [0.1, 0.2])).toThrow(/both/);
  });
  it("throws when lengths differ", () => {
    expect(() => rocAuc([0, 1], [0.1])).toThrow(/lengths/);
  });
});

describe("openSimilarityLog", () => {
  it("keeps similarities across reopening", () => {
    const dir = tempDir();
    openSimilarityLog(dir, "p").put("a", 0.25);
    expect(openSimilarityLog(dir, "p").get("a")).toBe(0.25);
  });
  it("keeps providers apart", () => {
    const dir = tempDir();
    openSimilarityLog(dir, "p").put("a", 0.25);
    expect(openSimilarityLog(dir, "q").get("a")).toBeUndefined();
  });
  it("drops a line left by a killed run, and appends cleanly after it", () => {
    const dir = tempDir();
    openSimilarityLog(dir, "p").put("a", 0.25);
    const file = join(dir, readdirSync(dir)[0]);
    appendFileSync(file, "b\t0.");
    const log = openSimilarityLog(dir, "p");
    expect(log.get("b")).toBeUndefined();
    log.put("c", 0.5);
    expect(openSimilarityLog(dir, "p").get("a")).toBe(0.25);
    expect(openSimilarityLog(dir, "p").get("c")).toBe(0.5);
  });
  it("won't store a similarity that isn't finite", () => {
    expect(() => openSimilarityLog(tempDir(), "p").put("a", Number.NaN)).toThrow(/a/);
  });
});

describe("pairSimilarities", () => {
  it("sends both sentences of a pair in one batch and logs the cosine", async () => {
    const provider = fakeProvider((text) => (text.endsWith("one") ? [1, 0] : [0, 1]));
    const log = openSimilarityLog(tempDir(), "p");
    await pairSimilarities(provider, [pair("a")], log);
    expect(provider.embedBatch).toHaveBeenCalledWith(["a one", "a two"]);
    expect(log.get("a")).toBe(0);
  });
  it("skips pairs already logged, so a run can resume", async () => {
    const provider = fakeProvider();
    const log = openSimilarityLog(tempDir(), "p");
    log.put("a", 0.5);
    await pairSimilarities(provider, [pair("a"), pair("b")], log);
    expect(provider.embedBatch).toHaveBeenCalledTimes(1);
    expect(provider.embedBatch).toHaveBeenCalledWith(["b one", "b two"]);
    expect(log.get("a")).toBe(0.5);
  });
  it("keeps earlier chunks when a later one fails", async () => {
    const provider = fakeProvider();
    provider.embedBatch.mockImplementationOnce(async (t) => t.map(() => [1, 0]));
    provider.embedBatch.mockRejectedValueOnce(new Error("gone"));
    const log = openSimilarityLog(tempDir(), "p");
    await expect(
      pairSimilarities(provider, [pair("a"), pair("b")], log, 1),
    ).rejects.toThrow("gone");
    expect(log.get("a")).toBe(1);
    expect(log.get("b")).toBeUndefined();
  });
  it("throws on a vector it can't score, rather than logging it", async () => {
    const log = openSimilarityLog(tempDir(), "p");
    await expect(
      pairSimilarities(fakeProvider(() => [0, 0]), [pair("a")], log),
    ).rejects.toThrow(/norm/);
    expect(log.get("a")).toBeUndefined();
  });
  it("writes similarities and never vectors", async () => {
    const dir = tempDir();
    const provider = fakeProvider(() => [0.123456, 0.654321, 0.111111]);
    await pairSimilarities(provider, [pair("a")], openSimilarityLog(dir, "p"));
    const content = readFileSync(join(dir, readdirSync(dir)[0]), "utf8");
    expect(content.trim().split("\t")).toHaveLength(2);
    expect(content).not.toContain("0.123456");
  });
});
