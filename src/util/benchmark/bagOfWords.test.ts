import { describe, expect, it } from "vitest";
import { createBagOfWordsProvider } from "./bagOfWords";
import { scoreTriplet } from "./scoring";

describe("bag of words", () => {
  it("can't separate a swapped-role edit", async () => {
    const provider = createBagOfWordsProvider();
    const [a, p, e] = await provider.embedBatch([
      "The dog bit the man.",
      "The man was bitten by the dog.",
      "The man bit the dog.",
    ]);
    const score = scoreTriplet("t", a, p, e);
    expect(score.editSimilarity).toBeCloseTo(1);
    expect(score.passed).toBe(false);
  });
  it("fails an exact tie between the paraphrase and the edit", async () => {
    const [a, p, e] = await createBagOfWordsProvider().embedBatch([
      "Every tall nurse quietly helped young patients yesterday.",
      "One nurse helped those patients during her morning shift.",
      "The tall nurse ignored the young patients at the door.",
    ]);
    expect(scoreTriplet("t", a, p, e).passed).toBe(false);
  });
  it("gives vectors of the same length within a batch", async () => {
    const [a, b] = await createBagOfWordsProvider().embedBatch(["one two", "three"]);
    expect(a.length).toBe(b.length);
  });
});
