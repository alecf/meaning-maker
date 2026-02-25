import { describe, expect, it } from "vitest";
import type { EmbedResponse, RichSentenceInfo, SentenceInfo } from "./types";

describe("type definitions", () => {
  it("SentenceInfo has required fields", () => {
    const info: SentenceInfo = { sentence: "Hello.", distance: 0.5 };
    expect(info.sentence).toBe("Hello.");
    expect(info.distance).toBe(0.5);
  });

  it("RichSentenceInfo extends SentenceInfo", () => {
    const info: RichSentenceInfo = {
      sentence: "Hello.",
      distance: 0.5,
      content: "Hello.",
      embedding: [0.1, 0.2, 0.3],
    };
    expect(info.content).toBe("Hello.");
    expect(info.embedding).toHaveLength(3);
  });

  it("EmbedResponse wraps SentenceInfo arrays", () => {
    const response: EmbedResponse = {
      response: [[{ sentence: "Hi.", distance: 0 }]],
    };
    expect(response.response).toHaveLength(1);
    expect(response.response[0]).toHaveLength(1);
  });
});
