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
  it("is marked as batch-scoped", () => {
    expect(createBagOfWordsProvider().batchScoped).toBe(true);
  });
  it("gives vectors of the same length within a batch", async () => {
    const [a, b] = await createBagOfWordsProvider().embedBatch(["one two", "three"]);
    expect(a.length).toBe(b.length);
  });

  const vectorsOf = (...texts: string[]): Promise<number[][]> =>
    createBagOfWordsProvider().embedBatch(texts);

  it("treats curly and straight apostrophes the same", async () => {
    const [curly, straight] = await vectorsOf(
      "Tom\u2019s dog bit Sam\u2019s cat.",
      "Tom's dog bit Sam's cat.",
    );
    expect(curly).toEqual(straight);
  });
  it("normalizes composed and decomposed letters", async () => {
    const [composed, decomposed] = await vectorsOf("caf\u00e9", "cafe\u0301");
    expect(composed).toEqual(decomposed);
  });
  it("ignores quoting apostrophes around a word", async () => {
    const [quoted, bare] = await vectorsOf("'dog'", "dog");
    expect(quoted).toEqual(bare);
  });
  it("drops a stray apostrophe", async () => {
    const [stray, bare] = await vectorsOf("dog ' cat", "dog cat");
    expect(stray).toEqual(bare);
  });
  it.each([
    ["decimals", "3.5", "5.3"],
    ["signs", "-5", "5"],
    ["currencies", "$5", "\u20ac5"],
  ])("keeps %s in numbers apart", async (_name, first, second) => {
    const [a, b] = await vectorsOf(first, second);
    expect(a).not.toEqual(b);
  });
  it("reads a hyphen between numbers as a range, not a sign", async () => {
    const [a, p, e] = await vectorsOf(
      "Prices rose 10-20 percent.",
      "Prices rose 10 to 20 percent.",
      "Prices rose 10-30 percent.",
    );
    expect(scoreTriplet("t", a, p, e).passed).toBe(true);
  });
  it.each([
    ["an en dash", "10-20", "10\u201320"],
    ["a minus sign in a range", "10-20", "10\u221220"],
    ["separate numbers", "10-20", "10 20"],
    ["a hyphen after a word", "COVID-19", "covid 19"],
    ["a true minus sign", "-5", "\u22125"],
  ])("tokenizes %s the same way", async (_name, first, second) => {
    const [a, b] = await vectorsOf(first, second);
    expect(a).toEqual(b);
  });
  it("keeps a leading decimal", async () => {
    const [a, b] = await vectorsOf(".5", "5");
    expect(a).not.toEqual(b);
  });
  it("doesn't read a sentence break as a leading decimal", async () => {
    const [a, b] = await vectorsOf("Room.5", "Room 5");
    expect(a).toEqual(b);
  });
  it("leaves sentence punctuation off a number", async () => {
    const [ending, bare] = await vectorsOf("It cost 5.", "It cost 5");
    expect(ending).toEqual(bare);
  });
});
