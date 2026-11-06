import { describe, expect, it } from "vitest";
import { cosine, passRate, scoreTriplet } from "./scoring";

describe("cosine", () => {
  it("is 1 for parallel vectors", () => {
    expect(cosine([1, 2], [2, 4])).toBeCloseTo(1);
  });
  it("is 0 for orthogonal vectors", () => {
    expect(cosine([1, 0], [0, 1])).toBeCloseTo(0);
  });
  it("is 0 rather than NaN for a zero vector", () => {
    expect(cosine([0, 0], [1, 1])).toBe(0);
  });
});

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
