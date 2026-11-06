import { describe, expect, it } from "vitest";
import { passRate, scoreTriplet, TIE_TOLERANCE } from "./scoring";

describe("scoreTriplet", () => {
  it("passes when the paraphrase is closer", () => {
    const score = scoreTriplet("t", [1, 0], [1, 0.1], [0, 1]);
    expect(score.passed).toBe(true);
    expect(score.margin).toBeGreaterThan(0);
  });
  it("fails when the edit is closer", () => {
    expect(scoreTriplet("t", [1, 0], [0, 1], [1, 0.1]).passed).toBe(false);
  });
  it("counts a tie as a fail", () => {
    expect(scoreTriplet("t", [1, 0], [1, 1], [1, 1]).passed).toBe(false);
  });
  it("reports cosine similarity to the anchor", () => {
    const score = scoreTriplet("t", [1, 2], [2, 4], [-2, 1]);
    expect(score.paraphraseSimilarity).toBeCloseTo(1);
    expect(score.editSimilarity).toBeCloseTo(0);
  });
  it("counts a margin within the tolerance as a tie", () => {
    const score = scoreTriplet("t", [1, 0], [1, 0], [1, 0.0005]);
    expect(score.margin).toBeGreaterThan(0);
    expect(score.margin).toBeLessThan(TIE_TOLERANCE);
    expect(score.passed).toBe(false);
  });
  it("passes a margin just beyond the tolerance", () => {
    const score = scoreTriplet("t", [1, 0], [1, 0], [1, 0.002]);
    expect(score.margin).toBeGreaterThan(TIE_TOLERANCE);
    expect(score.passed).toBe(true);
  });

  it.each<[string, number[], number[], number[]]>([
    ["a zero edit vector", [1, 0], [1, 0], [0, 0]],
    ["a zero anchor vector", [0, 0], [1, 0], [0, 1]],
    ["a vector whose norm underflows to zero", [1, 0], [1e-200, 0], [0, 1]],
    ["a longer paraphrase", [1, 0], [1, 0, 9, 9, 9], [0.9, 0.1]],
    ["a shorter edit", [1, 0, 1], [1, 0, 1], [1, 0]],
    ["empty vectors", [], [], []],
    ["NaN", [1, 0], [Number.NaN, 0], [0, 1]],
    ["Infinity", [1, 0], [1, 0], [Number.POSITIVE_INFINITY, 1]],
    ["a similarity that overflows", [1e200, 1e200], [1e200, 1e200], [0, 1]],
  ])("rejects %s", (_name, anchor, paraphrase, edit) => {
    expect(() => scoreTriplet("t", anchor, paraphrase, edit)).toThrow(/Triplet t/);
  });
});

describe("passRate", () => {
  const scores = (passes: number, total: number): boolean[] =>
    Array.from({ length: total }, (_, i) => i < passes);

  it("reports the observed rate", () => {
    expect(passRate(scores(3, 4)).rate).toBe(0.75);
  });
  it("brackets the rate", () => {
    const { low, rate, high } = passRate(scores(60, 100));
    expect(low).toBeLessThan(rate);
    expect(high).toBeGreaterThan(rate);
  });
  it("is deterministic", () => {
    expect(passRate(scores(7, 15))).toEqual(passRate(scores(7, 15)));
  });
  it("collapses when every triplet ties at zero", () => {
    expect(passRate(scores(0, 15))).toEqual({ rate: 0, low: 0, high: 0 });
  });
  it("rejects an empty list", () => {
    expect(() => passRate([])).toThrow();
  });
});
