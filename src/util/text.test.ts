import { describe, expect, it, vi } from "vitest";

vi.mock("openai", () => {
  return {
    default: class MockOpenAI {},
  };
});

vi.mock("@/util/db", () => ({
  getFromDb: vi.fn().mockResolvedValue(null),
  putIntoDb: vi.fn().mockResolvedValue(undefined),
}));

const { extractParagraphs } = await import("./text");

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
