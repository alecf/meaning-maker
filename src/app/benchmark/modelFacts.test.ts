import { describe, expect, it } from "vitest";
import { MODEL_FACTS } from "./modelFacts";
import summary from "./summary.json";

describe("MODEL_FACTS", () => {
  it("covers every model on the page", () => {
    const missing = summary.models.filter((model) => !MODEL_FACTS[model.key]);
    expect(missing.map((model) => model.key)).toEqual([]);
  });
  it("links every real model to a source", () => {
    const unlinked = Object.entries(MODEL_FACTS).filter(
      ([key, facts]) => key !== "bag-of-words" && !facts.link?.startsWith("https://"),
    );
    expect(unlinked.map(([key]) => key)).toEqual([]);
  });
  it("never names Cloudflare's product without explaining it", () => {
    expect(JSON.stringify(MODEL_FACTS)).not.toContain("Workers AI");
  });
});
