import { describe, expect, it } from "vitest";
import type { Category, Triplet, TripletScore } from "@/util/benchmark/types";
import { compareRuns, summarize } from "./report";

function triplet(
  baseId: string,
  category: Category = "negation",
  contextSentences: Triplet["contextSentences"] = 0,
): Triplet {
  return {
    id: contextSentences ? `${baseId}-context-${contextSentences}` : baseId,
    baseId,
    category,
    anchor: "a",
    paraphrase: "p",
    edit: "e",
    contextSentences,
    status: "approved",
  };
}

const score = (id: string, passed: boolean, margin = passed ? 0.1 : -0.1): TripletScore => ({
  id,
  paraphraseSimilarity: 0.5,
  editSimilarity: 0.5 - margin,
  margin,
  passed,
});

describe("summarize", () => {
  it("uses bare sentences for the headline and categories", () => {
    const triplets = [
      triplet("a", "negation"),
      triplet("b", "antonyms"),
      triplet("a", "negation", 8),
      triplet("b", "antonyms", 8),
    ];
    const summary = summarize(triplets, [
      score("a", true),
      score("b", false),
      score("a-context-8", false),
      score("b-context-8", false),
    ]);
    expect(summary.overall.rate).toBe(0.5);
    expect(summary.overall.count).toBe(2);
    expect(summary.categories.negation?.rate).toBe(1);
    expect(summary.categories.antonyms?.rate).toBe(0);
  });
  it("gives each other context length its own interval", () => {
    const summary = summarize(
      [triplet("a"), triplet("a", "negation", 3), triplet("a", "negation", 8)],
      [score("a", true), score("a-context-3", false), score("a-context-8", true)],
    );
    expect(Object.keys(summary.byContext)).toEqual(["3", "8"]);
    expect(summary.byContext["3"].rate).toBe(0);
    expect(summary.byContext["8"].rate).toBe(1);
  });
  it("keeps every triplet's margin and verdict", () => {
    const summary = summarize([triplet("a")], [score("a", true, 0.12345678)]);
    expect(summary.scores).toEqual([{ id: "a", margin: 0.123457, passed: true }]);
  });
  it("keeps a near tie's verdict when its margin rounds to zero", () => {
    const summary = summarize([triplet("a")], [score("a", true, 0.0000002)]);
    expect(summary.scores[0]).toMatchObject({ margin: 0, passed: true });
  });
  it("throws on a repeated baseId in one group", () => {
    const repeated = { ...triplet("a"), id: "a-copy" };
    expect(() =>
      summarize([triplet("a"), repeated], [score("a", true), score("a-copy", true)]),
    ).toThrow(/baseId a/);
  });
  it("throws when a triplet has no score", () => {
    expect(() => summarize([triplet("a"), triplet("b")], [score("a", true)])).toThrow(/b/);
  });
  it("throws when there are no bare sentences", () => {
    expect(() =>
      summarize([triplet("a", "negation", 8)], [score("a-context-8", true)]),
    ).toThrow(/bare/);
  });
});

describe("compareRuns", () => {
  it("counts flips and measures how far margins moved", () => {
    const result = compareRuns(
      [score("a", true, 0.01), score("b", true, 0.1), score("c", false, -0.2)],
      [score("a", false, -0.01), score("b", true, 0.1), score("c", false, -0.1)],
    );
    expect(result.triplets).toBe(3);
    expect(result.flips).toEqual(["a"]);
    expect(result.medianShift).toBeCloseTo(0.02);
    expect(result.maxShift).toBeCloseTo(0.1);
  });
  it("throws when the runs don't line up", () => {
    expect(() => compareRuns([score("a", true)], [score("b", true)])).toThrow(/a/);
  });
});
