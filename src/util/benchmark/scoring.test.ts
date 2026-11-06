import { describe, expect, it } from "vitest";
import { cosine, scoreTriplet } from "./scoring";

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
