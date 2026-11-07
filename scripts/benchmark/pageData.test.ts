import { describe, expect, it } from "vitest";
import type { Triplet } from "@/util/benchmark/types";
import { buildPageData, type PawsResults, type Results } from "./pageData";

const interval = (rate: number, count = 1) => ({ rate, low: 0, high: 1, count });

const triplet = (id: string): Triplet => ({
  id,
  baseId: id,
  category: "negation",
  anchor: `${id} anchor`,
  paraphrase: `${id} paraphrase`,
  edit: `${id} edit`,
  contextSentences: 0,
  status: "approved",
});

function model(name: string, rate: number, passed = true) {
  return {
    model: name,
    host: "ollama",
    availability: "batch-only" as const,
    providerId: name,
    overall: interval(rate),
    categories: { negation: interval(rate) },
    byContext: { "8": interval(0) },
    scores: [
      { id: "a", margin: 0.5, passed },
      { id: "a-context-8", margin: -0.25, passed: false },
    ],
  };
}

const results = (...models: ReturnType<typeof model>[]): Results => ({ models, missing: [] });

describe("buildPageData", () => {
  it("orders models by bare pass rate", () => {
    const { summary } = buildPageData(results(model("low", 0.1), model("high", 0.9)), [
      triplet("a"),
    ]);
    expect(summary.models.map((m) => m.key)).toEqual(["high", "low"]);
  });
  it("gives bare sentences a place among the context lengths", () => {
    const { summary } = buildPageData(results(model("m", 0.5)), [triplet("a")]);
    expect(summary.contexts).toEqual([0, 8]);
    expect(summary.models[0].contexts["0"].rate).toBe(0.5);
    expect(summary.models[0].contexts["8"].rate).toBe(0);
  });
  it("uses a readable name and marks the app's model", () => {
    const { summary } = buildPageData(results(model("bge-large (mean)", 0.5)), [triplet("a")]);
    expect(summary.models[0]).toMatchObject({
      name: "bge-large, mean pooling",
      usedByApp: true,
    });
  });
  it("names an unknown model after itself rather than failing", () => {
    const { summary } = buildPageData(results(model("new-model", 0.5)), [triplet("a")]);
    expect(summary.models[0]).toMatchObject({ name: "new-model", usedByApp: false });
  });
  it("lines scores up with the triplets at each context length", () => {
    const { details } = buildPageData(results(model("m", 0.5)), [triplet("a")]);
    expect(details.triplets[0].anchor).toBe("a anchor");
    expect(details.scores.m["0"]).toEqual({ margins: [0.5], passed: "1" });
    expect(details.scores.m["8"]).toEqual({ margins: [-0.25], passed: "0" });
  });
  it("keeps a verdict that its rounded margin wouldn't show", () => {
    const { details } = buildPageData(results(model("m", 0.5, false)), [triplet("a")]);
    expect(details.scores.m["0"].passed).toBe("0");
  });
  it("throws when a triplet has no score", () => {
    expect(() =>
      buildPageData(results(model("m", 0.5)), [triplet("a"), triplet("b")]),
    ).toThrow(/b/);
  });
  it("adds PAWS only to the models it ran on", () => {
    const paws: PawsResults = { models: [{ model: "m", auc: 0.75 }] };
    const { summary } = buildPageData(
      results(model("m", 0.5), model("other", 0.4)),
      [triplet("a")],
      paws,
    );
    expect(summary.models[0].pawsAuc).toBe(0.75);
    expect(summary.models[1]).not.toHaveProperty("pawsAuc");
  });
  it("includes hand-picked examples with each model's score", () => {
    const row = model("m", 0.5);
    row.scores[0].id = "ant-02";
    row.scores[1].id = "ant-02-context-8";
    const { summary } = buildPageData(results(row), [triplet("ant-02")]);
    expect(summary.examples).toHaveLength(1);
    expect(summary.examples[0].scores).toEqual([{ key: "m", margin: 0.5, passed: true }]);
  });
  it("scores each kind of change at each context length", () => {
    const { summary } = buildPageData(results(model("m", 0.5)), [triplet("a")]);
    expect(summary.models[0].grid["0"].negation?.rate).toBe(1);
    expect(summary.models[0].grid["8"].negation?.rate).toBe(0);
    expect(summary.models[0].grid["8"].negation?.count).toBe(1);
  });
  it("carries no PAWS without results", () => {
    const { summary } = buildPageData(results(model("m", 0.5)), [triplet("a")]);
    expect(summary.models[0]).not.toHaveProperty("pawsAuc");
  });
});
