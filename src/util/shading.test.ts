import { describe, expect, it } from "vitest";
import { sentenceOpacities } from "./shading";

describe("sentenceOpacities", () => {
  it("fades repetition and keeps novelty solid", () => {
    const [first, novel, middle, repeated] = sentenceOpacities([
      0, 0.5, 0.7, 0.9,
    ]);
    expect(first).toBe(1);
    expect(novel).toBeCloseTo(1);
    expect(repeated).toBeCloseTo(0.16);
    expect(middle).toBeGreaterThan(repeated);
    expect(middle).toBeLessThan(novel);
  });

  it("keeps the first sentence out of the range", () => {
    expect(sentenceOpacities([0, 0.8, 0.9])[1]).toBeCloseTo(1);
  });

  it("leaves everything solid when no sentences differ", () => {
    expect(sentenceOpacities([0, 0.8, 0.8])).toEqual([1, 1, 1]);
    expect(sentenceOpacities([0])).toEqual([1]);
    expect(sentenceOpacities([])).toEqual([]);
  });
});
