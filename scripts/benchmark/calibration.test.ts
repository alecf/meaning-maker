import { describe, expect, it } from "vitest";
import type { Triplet } from "@/util/benchmark/types";
import { compareHosts } from "./calibration";

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

describe("compareHosts", () => {
  it("reports identical hosts as interchangeable", () => {
    const host = new Map(vectors("a", pass, near, far));
    const row = compareHosts([triplet("a")], host, host);
    expect(row.meanHostCosine).toBeCloseTo(1);
    expect(row.verdictMatchRate).toBe(1);
    expect(row.worstMarginDifference).toBe(0);
    expect(row.mismatches).toEqual([]);
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
    expect(row.mismatches).toEqual(["b"]);
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
  it("is interchangeable at exactly 95% matching verdicts", () => {
    const ids = Array.from({ length: 20 }, (_, i) => `t${i}`);
    const workers = new Map(ids.flatMap((id) => vectors(id, pass, near, far)));
    const ollama = new Map(
      ids.flatMap((id, i) =>
        i === 0 ? vectors(id, pass, far, near) : vectors(id, pass, near, far),
      ),
    );
    const row = compareHosts(ids.map(triplet), workers, ollama);
    expect(row.verdictMatchRate).toBe(0.95);
    expect(row.interchangeable).toBe(true);
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
