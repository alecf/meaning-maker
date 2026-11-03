import { describe, expect, it, vi } from "vitest";
import type { Embedder } from "./embedding";
import { extractParagraphs, getAllSentences, iterateTextWindows } from "./text";
import { countTokens } from "./tokenizer";

async function collect<T>(gen: AsyncGenerator<T>): Promise<T[]> {
  const out: T[] = [];
  for await (const item of gen) {
    out.push(item);
  }
  return out;
}

/** A sentence of `n` single-token words plus a period, e.g. "word word." */
function sentenceOfWords(n: number): string {
  return `${Array.from({ length: n }, () => "word").join(" ")}.`;
}

describe("extractParagraphs", () => {
  it("splits text into paragraph groups of sentences", async () => {
    const text = "Hello world. This is a test.";
    const result = await extractParagraphs(text);
    expect(result.length).toBeGreaterThanOrEqual(1);
    const allSentences = result.flat().join(" ");
    expect(allSentences).toContain("Hello world.");
    expect(allSentences).toContain("This is a test.");
  });

  it("separates paragraphs on newlines", async () => {
    const text = "First paragraph.\n\nSecond paragraph.";
    const result = await extractParagraphs(text);
    expect(result.length).toBe(2);
  });

  it("returns a single group for empty string", async () => {
    const result = await extractParagraphs("");
    expect(result).toBeDefined();
    expect(Array.isArray(result)).toBe(true);
  });

  it("handles single sentence input", async () => {
    const result = await extractParagraphs("Just one sentence.");
    const flat = result.flat();
    expect(flat.length).toBe(1);
    expect(flat[0]).toContain("Just one sentence.");
  });
});

describe("iterateTextWindows", () => {
  it("emits a rolling window of at most maxWindowSize sentences", async () => {
    const sentences = ["One two three.", "Four five six.", "Seven eight nine."];
    const windows = await collect(iterateTextWindows(sentences, 2, 1));
    expect(windows.map((w) => w.accumulated)).toEqual([
      "One two three.",
      "One two three. Four five six.",
      "Four five six. Seven eight nine.",
    ]);
  });

  it("merges sentences at or below minTokenLength into the next one", async () => {
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
    const windows = await collect(
      iterateTextWindows(["Hi.", "This is a longer sentence."], 8, 3),
    );
    expect(windows).toEqual([
      {
        sentence: "Hi. This is a longer sentence.",
        accumulated: "Hi. This is a longer sentence.",
      },
    ]);
    warn.mockRestore();
  });

  it("drops the oldest sentences until the window fits the token limit", async () => {
    // Each sentence is 11 tokens; with [CLS]/[SEP], two sentences encode to
    // 24 tokens and three to 35.
    const s = sentenceOfWords(10);
    expect(countTokens(`${s} ${s}`)).toBe(24);
    const windows = await collect(iterateTextWindows([s, s, s], 8, 1, 30));
    expect(windows.map((w) => countTokens(w.accumulated))).toEqual([
      13, 24, 24,
    ]);
  });

  it("truncates a single sentence that alone exceeds the token limit", async () => {
    const long = sentenceOfWords(40);
    const [window] = await collect(iterateTextWindows([long], 8, 1, 20));
    expect(window.sentence).toBe(long);
    expect(countTokens(window.accumulated)).toBe(20);
  });

  it("leaves text under the limit unchanged", async () => {
    const [window] = await collect(
      iterateTextWindows(["Hello World, this is Mixed Case."], 8, 1),
    );
    expect(window.accumulated).toBe("Hello World, this is Mixed Case.");
  });
});

describe("getAllSentences", () => {
  it("uses the injected embedder and compares consecutive windows", async () => {
    const vectors: Record<string, number[]> = {
      "One two three.": [1, 0],
      "One two three. Four five six.": [1, 1],
    };
    const embedder: Embedder = {
      id: "test",
      embed: vi.fn(async (text: string) => vectors[text]),
    };
    const result = await getAllSentences(
      [["One two three.", "Four five six."]],
      embedder,
      8,
      1,
    );
    expect(result).toHaveLength(1);
    expect(result[0][0]).toEqual({ sentence: "One two three.", distance: 0 });
    expect(result[0][1].sentence).toBe("Four five six.");
    expect(result[0][1].distance).toBeCloseTo(Math.SQRT1_2);
    expect(embedder.embed).toHaveBeenCalledTimes(2);
  });
});
