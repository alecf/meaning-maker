import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { CATEGORIES, type Triplet } from "@/util/benchmark/types";
import {
  parseTriplets,
  validateContextSentences,
  validateTriplets,
} from "./validate";

describe("drafted data", () => {
  const triplets = parseTriplets(
    readFileSync("data/benchmark/triplets.jsonl", "utf8"),
  );
  const calibration = parseTriplets(
    readFileSync("data/benchmark/calibration-triplets.jsonl", "utf8"),
  );

  it("passes the validator", () => {
    expect(validateTriplets(triplets)).toEqual([]);
  });
  it("has about 22 triplets per category", () => {
    for (const category of CATEGORIES) {
      const count = triplets.filter((t) => t.category === category).length;
      expect(count).toBeGreaterThanOrEqual(20);
      expect(count).toBeLessThanOrEqual(24);
    }
  });
  it("shares no text with the calibration set", () => {
    const texts = (rows: Triplet[]): string[] =>
      rows.flatMap((t) => [t.anchor, t.paraphrase, t.edit]);
    const used = new Set(texts(calibration));
    expect(texts(triplets).filter((text) => used.has(text))).toEqual([]);
  });
  it("has usable context sentences", () => {
    const context = JSON.parse(
      readFileSync("data/benchmark/context-sentences.json", "utf8"),
    ) as string[];
    expect(validateContextSentences(context)).toEqual([]);
  });
});
