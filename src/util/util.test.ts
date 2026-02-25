import { describe, expect, it } from "vitest";
import { cosine_similarity, trimToFitWindow } from "./util";

describe("cosine_similarity", () => {
  it("returns 1 for identical vectors", () => {
    const v = [1, 2, 3];
    expect(cosine_similarity(v, v)).toBeCloseTo(1);
  });

  it("returns 0 for orthogonal vectors", () => {
    expect(cosine_similarity([1, 0], [0, 1])).toBeCloseTo(0);
  });

  it("returns -1 for opposite vectors", () => {
    expect(cosine_similarity([1, 0], [-1, 0])).toBeCloseTo(-1);
  });

  it("returns 0 when a vector is all zeros", () => {
    expect(cosine_similarity([0, 0], [1, 2])).toBe(0);
  });

  it("applies scale factor", () => {
    const v = [1, 2, 3];
    expect(cosine_similarity(v, v, 2)).toBeCloseTo(2);
  });

  it("handles vectors of different lengths by using the shorter", () => {
    const a = [1, 0, 0];
    const b = [1, 0];
    // Should only compare first 2 dimensions
    expect(cosine_similarity(a, b)).toBeCloseTo(1);
  });
});

describe("trimToFitWindow", () => {
  it("removes leading non-empty items to fit window size", () => {
    const window = ["a", "b", "c", "d"];
    trimToFitWindow(window, 2);
    expect(window).toEqual(["c", "d"]);
  });

  it("does nothing when window is already within size", () => {
    const window = ["a", "b"];
    trimToFitWindow(window, 3);
    expect(window).toEqual(["a", "b"]);
  });

  it("skips whitespace-only entries when counting", () => {
    const window = ["a", "  ", "b", "c"];
    trimToFitWindow(window, 2);
    // "a" removed as first non-whitespace, leaves [" ", "b", "c"] which has 2 non-empty
    expect(window).toEqual(["  ", "b", "c"]);
  });

  it("handles empty array", () => {
    const window: string[] = [];
    trimToFitWindow(window, 2);
    expect(window).toEqual([]);
  });

  it("handles window size of 0", () => {
    const window = ["a", "b"];
    trimToFitWindow(window, 0);
    expect(window).toEqual([]);
  });
});
