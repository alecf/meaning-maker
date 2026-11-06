import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { CATEGORIES, type Triplet } from "@/util/benchmark/types";
import {
  parseTriplets,
  validateContextSentences,
  validateTriplets,
} from "./validate";

describe("reviewed data", () => {
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
      expect(count).toBeGreaterThanOrEqual(19);
      expect(count).toBeLessThanOrEqual(24);
    }
  });
  it("has a review decision on every row", () => {
    expect(triplets.filter((t) => t.status === "draft")).toEqual([]);
  });
  it("has a critique or an origin on every row", () => {
    const unexplained = triplets.filter((t) => !t.critique && !t.origin);
    expect(unexplained).toEqual([]);
  });
  it("keeps rejected rows out, with their reasons", () => {
    const rejected = parseTriplets(
      readFileSync("data/benchmark/triplets-rejected.jsonl", "utf8"),
    );
    const kept = new Set(triplets.map((t) => t.id));
    expect(rejected.filter((t) => kept.has(t.id))).toEqual([]);
    for (const row of rejected) {
      expect(row.critique?.verdict).toBe("reject");
      expect(row.critique?.reason).toBeTruthy();
    }
  });
  it("gives the critic's kept rows only keep or fix", () => {
    const verdicts = new Set(
      triplets.flatMap((t) => (t.critique ? [t.critique.verdict] : [])),
    );
    expect([...verdicts].sort()).toEqual(["fix", "keep"]);
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
