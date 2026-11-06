import { describe, expect, it } from "vitest";
import type { Triplet } from "@/util/benchmark/types";
import {
  validateContextSentences,
  validateTriplet,
  validateTriplets,
} from "./validate";

const valid: Triplet = {
  id: "t1",
  baseId: "t1",
  category: "negation",
  anchor: "The ferry runs on public holidays.",
  paraphrase: "Public holidays still see the ferry in service.",
  edit: "The ferry does not run on public holidays.",
  contextSentences: 0,
  status: "draft",
};
const swapped: Triplet = {
  ...valid,
  category: "swapped-roles",
  anchor: "The dog bit the man.",
  paraphrase: "The man was bitten by the dog.",
  edit: "The man bit the dog.",
};

describe("validateTriplet", () => {
  it("accepts a sound triplet", () => {
    expect(validateTriplet(valid)).toEqual([]);
  });
  it("accepts a swapped-roles edit using the anchor's words", () => {
    expect(validateTriplet(swapped)).toEqual([]);
  });
  it("accepts a notes field", () => {
    expect(validateTriplet({ ...valid, notes: "Check this." })).toEqual([]);
  });

  it("flags a paraphrase and edit more than 30% apart in length", () => {
    const problems = validateTriplet({
      ...valid,
      paraphrase: "one two three four five six",
      edit: "one two three four five six seven eight nine",
    });
    expect(problems).toContainEqual(expect.stringMatching(/lengths differ/));
  });
  it("allows lengths exactly 30% apart", () => {
    const problems = validateTriplet({
      ...valid,
      paraphrase: "one two three four five six seven",
      edit: "one two three four five six seven eight nine ten",
    });
    expect(problems).not.toContainEqual(expect.stringMatching(/lengths differ/));
  });

  it("flags a swapped-roles edit with other words", () => {
    const problems = validateTriplet({ ...swapped, edit: "The man bit the cat." });
    expect(problems).toContainEqual(expect.stringMatching(/same words/));
  });
  it("only asks other categories for different words, not the same ones", () => {
    expect(validateTriplet({ ...valid, edit: "The ferry does not run." })).not.toContainEqual(
      expect.stringMatching(/same words/),
    );
  });

  it.each([
    ["one word replaced", "The ferry operates on public holidays."],
    ["one word added", "The ferry only runs on public holidays."],
    ["one word removed", "The ferry runs on holidays."],
    ["the same words reordered", "On public holidays the ferry runs."],
    ["one word replaced and the rest reordered", "On public holidays the ferry sails."],
  ])("flags a paraphrase with %s", (_name, paraphrase) => {
    expect(validateTriplet({ ...valid, paraphrase })).toContainEqual(
      expect.stringMatching(/copies the anchor/),
    );
  });
  it("accepts a paraphrase that changes two words", () => {
    expect(
      validateTriplet({ ...valid, paraphrase: "The ferry sails during public holidays." }),
    ).not.toContainEqual(expect.stringMatching(/copies the anchor/));
  });

  it.each(["id", "baseId", "anchor", "paraphrase", "edit"] as const)(
    "flags an empty %s",
    (field) => {
      expect(validateTriplet({ ...valid, [field]: " " })).toContainEqual(
        expect.stringMatching(new RegExp(`${field} is empty`)),
      );
    },
  );
  it("flags a field that's missing altogether", () => {
    const { baseId: _, ...rest } = valid;
    expect(validateTriplet(rest as Triplet)).toContainEqual(
      expect.stringMatching(/baseId is empty/),
    );
  });
  it("flags an unknown category", () => {
    expect(
      validateTriplet({ ...valid, category: "sarcasm" as Triplet["category"] }),
    ).toContainEqual(expect.stringMatching(/category/));
  });

  it.each(["anchor", "paraphrase", "edit"] as const)(
    "flags a %s with no bag-of-words tokens",
    (field) => {
      expect(validateTriplet({ ...valid, [field]: "?!" })).toContainEqual(
        expect.stringMatching(new RegExp(`${field} has no tokens`)),
      );
    },
  );

  it("flags identical texts", () => {
    expect(validateTriplet({ ...valid, edit: valid.anchor })).toContainEqual(
      expect.stringMatching(/identical/),
    );
  });
  it("compares texts by tokens for the identical rule", () => {
    expect(
      validateTriplet({ ...valid, edit: "THE FERRY runs on public holidays!" }),
    ).toContainEqual(expect.stringMatching(/identical/));
  });
  it("flags an unknown status", () => {
    expect(
      validateTriplet({ ...valid, status: "maybe" as Triplet["status"] }),
    ).toContainEqual(expect.stringMatching(/unknown status/));
  });
  it.each([0, 1, 3, 8] as const)("accepts contextSentences %i", (contextSentences) => {
    expect(validateTriplet({ ...valid, contextSentences })).toEqual([]);
  });
  it("flags any other contextSentences", () => {
    expect(
      validateTriplet({
        ...valid,
        contextSentences: 2 as Triplet["contextSentences"],
      }),
    ).toContainEqual(expect.stringMatching(/unknown contextSentences 2/));
  });
  it("flags a curly apostrophe, so one style is used throughout", () => {
    expect(
      validateTriplet({ ...valid, anchor: "The ferry’s route runs on holidays." }),
    ).toContainEqual(expect.stringMatching(/apostrophe/));
  });
});

describe("validateTriplets", () => {
  const at = (contextSentences: Triplet["contextSentences"], id: string): Triplet => ({
    ...valid,
    id,
    contextSentences,
  });

  it("accepts rows that share a baseId across context lengths", () => {
    expect(validateTriplets([at(0, "a"), at(3, "b")])).toEqual([]);
  });
  it("includes each row's own problems, with its id", () => {
    expect(validateTriplets([{ ...valid, anchor: "" }])).toContainEqual(
      expect.stringMatching(/^t1: anchor is empty/),
    );
  });
  it("flags a duplicated id", () => {
    expect(validateTriplets([at(0, "a"), { ...at(3, "a") }])).toContainEqual(
      expect.stringMatching(/a: duplicated id/),
    );
  });
  it("flags a shared baseId with another category", () => {
    const other: Triplet = { ...at(3, "b"), category: "antonyms" };
    expect(validateTriplets([at(0, "a"), other])).toContainEqual(
      expect.stringMatching(/differs in category or anchor/),
    );
  });
  it("flags a shared baseId with another anchor", () => {
    const other = { ...at(3, "b"), anchor: "The ferry stops running in winter." };
    expect(validateTriplets([at(0, "a"), other])).toContainEqual(
      expect.stringMatching(/differs in category or anchor/),
    );
  });
  it("flags an anchor repeated across baseIds", () => {
    const other = { ...at(0, "b"), baseId: "other", anchor: `${valid.anchor.toUpperCase()}` };
    expect(validateTriplets([at(0, "a"), other])).toContainEqual(
      expect.stringMatching(/b: anchor repeats a/),
    );
  });
  it("flags a repeated contextSentences value within a baseId", () => {
    expect(validateTriplets([at(3, "a"), at(3, "b")])).toContainEqual(
      expect.stringMatching(/repeats contextSentences 3/),
    );
  });
});

describe("validateContextSentences", () => {
  const sentences = Array.from({ length: 8 }, (_, i) => `Filler sentence ${i}.`);

  it("accepts eight sentences", () => {
    expect(validateContextSentences(sentences)).toEqual([]);
  });
  it("needs enough for 8 sentences of context", () => {
    expect(validateContextSentences(sentences.slice(1))).toContainEqual(
      expect.stringMatching(/at least 8/),
    );
  });
  it("flags a sentence with no tokens", () => {
    expect(validateContextSentences([...sentences, "..."])).toContainEqual(
      expect.stringMatching(/no tokens/),
    );
  });
  it("flags a repeated sentence", () => {
    expect(validateContextSentences([...sentences, sentences[0]])).toContainEqual(
      expect.stringMatching(/repeated/),
    );
  });
});
