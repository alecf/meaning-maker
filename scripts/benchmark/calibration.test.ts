import { describe, expect, it } from "vitest";
import type { Triplet } from "@/util/benchmark/types";
import { compareHosts, HOST_NOISE_MARGIN } from "./calibration";

const triplet = (id: string): Triplet => ({
  id,
  baseId: id,
  category: "negation",
  anchor: `${id} anchor`,
  paraphrase: `${id} paraphrase`,
  edit: `${id} edit`,
  contextSentences: 0,
  status: "draft",
});

const vectors = (
  id: string,
  anchor: number[],
  paraphrase: number[],
  edit: number[],
): [string, number[]][] => [
  [`${id} anchor`, anchor],
  [`${id} paraphrase`, paraphrase],
  [`${id} edit`, edit],
];

const pass = [1, 0];
const near = [1, 0.1];
const far = [0, 1];

/** A unit vector with this cosine similarity to `pass`. */
const withSimilarity = (cosine: number): number[] => [
  cosine,
  Math.sqrt(1 - cosine * cosine),
];

describe("compareHosts", () => {
  it("reports identical hosts as interchangeable", () => {
    const host = new Map(vectors("a", pass, near, far));
    const row = compareHosts([triplet("a")], host, host);
    expect(row.meanHostCosine).toBeCloseTo(1);
    expect(row.verdictMatchRate).toBe(1);
    expect(row.worstMarginDifference).toBe(0);
    expect(row.forgivenMismatches).toEqual([]);
    expect(row.unforgivenMismatches).toEqual([]);
    expect(row.interchangeable).toBe(true);
  });
  it("counts a verdict that differs between hosts", () => {
    const workers = new Map([
      ...vectors("a", pass, near, far),
      ...vectors("b", pass, near, far),
    ]);
    const ollama = new Map([
      ...vectors("a", pass, near, far),
      ...vectors("b", pass, far, near),
    ]);
    const row = compareHosts([triplet("a"), triplet("b")], workers, ollama);
    expect(row.verdictMatchRate).toBe(0.5);
    expect(row.unforgivenMismatches).toEqual(["b"]);
    expect(row.interchangeable).toBe(false);
    expect(row.worstMarginTriplet).toBe("b");
    expect(row.worstMarginDifference).toBeGreaterThan(1);
    expect(row.workersAi.rate).toBe(1);
    expect(row.ollama.rate).toBe(0.5);
  });
  it("averages cosine across distinct texts", () => {
    const workers = new Map(vectors("a", [1, 0], [1, 0], [1, 0]));
    const ollama = new Map(vectors("a", [1, 0], [1, 0], [0, 1]));
    const row = compareHosts([triplet("a")], workers, ollama);
    expect(row.meanHostCosine).toBeCloseTo(2 / 3);
  });
  it("keeps a noise-level flip from blocking interchangeability", () => {
    const ids = Array.from({ length: 40 }, (_, i) => `t${i}`);
    const workers = new Map(
      ids.flatMap((id) => vectors(id, pass, withSimilarity(1), withSimilarity(0.998))),
    );
    const ollama = new Map(
      ids.flatMap((id, i) =>
        i === 0
          ? vectors(id, pass, withSimilarity(0.998), withSimilarity(1))
          : vectors(id, pass, withSimilarity(1), withSimilarity(0.998)),
      ),
    );
    const row = compareHosts(ids.map((id) => triplet(id)), workers, ollama);
    expect(row.forgivenMismatches).toEqual(["t0"]);
    expect(row.unforgivenMismatches).toEqual([]);
    expect(row.interchangeable).toBe(true);
  });
  it("rejects a one-sided shift of small flips", () => {
    const ids = Array.from({ length: 100 }, (_, i) => `t${i}`);
    const workers = new Map(
      ids.flatMap((id) => vectors(id, pass, withSimilarity(1), withSimilarity(0.995))),
    );
    const ollama = new Map(
      ids.flatMap((id) => vectors(id, pass, withSimilarity(0.995), withSimilarity(1))),
    );
    const row = compareHosts(ids.map((id) => triplet(id)), workers, ollama);
    expect(row.unforgivenMismatches).toEqual([]);
    expect(row.forgivenMismatches).toHaveLength(100);
    expect(row.passRateGap).toBe(1);
    expect(row.interchangeable).toBe(false);
  });
  it("allows an overall gap at the limit but not beyond it", () => {
    const row = (flips: number) => {
      const ids = Array.from({ length: 100 }, (_, i) => `t${i}`);
      const small = (id: string, flip: boolean) =>
        flip
          ? vectors(id, pass, withSimilarity(0.995), withSimilarity(1))
          : vectors(id, pass, withSimilarity(1), withSimilarity(0.995));
      return compareHosts(
        ids.map((id, i) => ({
          ...triplet(id),
          category: i % 2 === 0 ? "negation" : "antonyms",
        })),
        new Map(ids.flatMap((id) => small(id, false))),
        new Map(ids.flatMap((id, i) => small(id, i < flips))),
      );
    };
    expect(row(4).interchangeable).toBe(true);
    expect(row(6).interchangeable).toBe(false);
  });
  it("rejects a large gap in one category that the overall rate hides", () => {
    const ids = Array.from({ length: 100 }, (_, i) => `t${i}`);
    const small = (id: string, flip: boolean) =>
      flip
        ? vectors(id, pass, withSimilarity(0.995), withSimilarity(1))
        : vectors(id, pass, withSimilarity(1), withSimilarity(0.995));
    const row = compareHosts(
      ids.map((id, i) => ({
        ...triplet(id),
        category: i < 20 ? "numbers" : "negation",
      })),
      new Map(ids.flatMap((id) => small(id, false))),
      new Map(ids.flatMap((id, i) => small(id, i < 4))),
    );
    expect(row.passRateGap).toBeCloseTo(0.04);
    expect(row.worstCategoryGap.category).toBe("numbers");
    expect(row.worstCategoryGap.gap).toBeCloseTo(0.2);
    expect(row.unforgivenMismatches).toEqual([]);
    expect(row.interchangeable).toBe(false);
  });
  it("rejects a flip that's large on one host only", () => {
    const workers = new Map(vectors("a", pass, withSimilarity(1), withSimilarity(0.9)));
    const ollama = new Map(vectors("a", pass, withSimilarity(0.998), withSimilarity(1)));
    const row = compareHosts([triplet("a")], workers, ollama);
    expect(row.forgivenMismatches).toEqual([]);
    expect(row.unforgivenMismatches).toEqual(["a"]);
    expect(row.interchangeable).toBe(false);
  });
  it("rejects a flip just past the noise limit", () => {
    const margin = HOST_NOISE_MARGIN * 1.01;
    const workers = new Map(vectors("a", pass, withSimilarity(1), withSimilarity(1 - margin / 2)));
    const ollama = new Map(vectors("a", pass, withSimilarity(1 - margin), withSimilarity(1)));
    const row = compareHosts([triplet("a")], workers, ollama);
    expect(row.unforgivenMismatches).toEqual(["a"]);
  });
  it("isn't rescued by a high match rate: 5 large flips out of 100", () => {
    const ids = Array.from({ length: 100 }, (_, i) => `t${i}`);
    const workers = new Map(ids.flatMap((id) => vectors(id, pass, near, far)));
    const ollama = new Map(
      ids.flatMap((id, i) =>
        i < 5 ? vectors(id, pass, far, near) : vectors(id, pass, near, far),
      ),
    );
    const row = compareHosts(
      ids.map((id) => ({ ...triplet(id), category: "swapped-roles" })),
      workers,
      ollama,
    );
    expect(row.verdictMatchRate).toBe(0.95);
    expect(row.unforgivenMismatches).toHaveLength(5);
    expect(row.interchangeable).toBe(false);
  });
  it("throws if the hosts give different vector lengths", () => {
    const workers = new Map(vectors("a", [1, 0], [1, 0.1], [0, 1]));
    const ollama = new Map(vectors("a", [1, 0, 0], [1, 0.1, 0], [0, 1, 0]));
    expect(() => compareHosts([triplet("a")], workers, ollama)).toThrow(
      /2 dimensions on Workers AI, 3 on Ollama/,
    );
  });
  it("throws if a text has no vector", () => {
    expect(() =>
      compareHosts([triplet("a")], new Map(), new Map()),
    ).toThrow(/No vector for a anchor/);
  });
});
