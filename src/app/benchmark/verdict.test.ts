import { describe, expect, it } from "vitest";
import { pickStrength, verdictFor } from "./verdict";

describe("verdictFor", () => {
  it.each([
    [1, "notices"],
    [0.75, "notices"],
    [0.74, "mixed"],
    [0.4, "mixed"],
    [0.39, "misses"],
    [0, "misses"],
  ])("puts %f in %s", (rate, verdict) => {
    expect(verdictFor(rate)).toBe(verdict);
  });
});

describe("pickStrength", () => {
  it("ignores the direction of the margin", () => {
    expect(pickStrength(-0.2)).toBe(pickStrength(0.2));
  });
  it("separates close calls from clear picks", () => {
    expect(pickStrength(0.005)).toMatch(/close call/);
    expect(pickStrength(0.03)).toMatch(/big gap/);
    expect(pickStrength(0.2)).toMatch(/wasn't close/);
  });
});
