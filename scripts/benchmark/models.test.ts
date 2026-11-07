import { describe, expect, it } from "vitest";
import { OLLAMA_MODELS, WORKERS_AI_MODELS } from "./models";

const workers = (name: string, pooling?: string) =>
  WORKERS_AI_MODELS.find(
    (model) => model.name === name && model.pooling === pooling,
  );
const ollama = (name: string) =>
  OLLAMA_MODELS.find((model) => model.name === name);

describe("model registry", () => {
  it("never lists an Ollama model as live", () => {
    expect(OLLAMA_MODELS.every((m) => m.availability === "batch-only")).toBe(true);
  });
  it("lists every Workers AI entry except embeddinggemma as live", () => {
    expect(
      WORKERS_AI_MODELS.filter((m) => m.availability === "batch-only").map(
        (m) => m.name,
      ),
    ).toEqual(["@cf/google/embeddinggemma-300m"]);
  });
  it("has both bge-large pooling modes on Workers AI", () => {
    expect(workers("@cf/baai/bge-large-en-v1.5", "mean")).toBeDefined();
    expect(workers("@cf/baai/bge-large-en-v1.5", "cls")).toBeDefined();
  });
  it.each([
    ["bge-large", "@cf/baai/bge-large-en-v1.5", "cls"],
    ["bge-m3", "@cf/baai/bge-m3", undefined],
    ["qwen3-embedding:0.6b", "@cf/qwen/qwen3-embedding-0.6b", undefined],
    ["embeddinggemma", "@cf/google/embeddinggemma-300m", undefined],
  ])("uses one prefix for %s on both hosts", (local, remote, pooling) => {
    expect(workers(remote, pooling)?.prefix).toBe(ollama(local)?.prefix);
  });
  it("uses the clustering prefix for nomic-embed-text", () => {
    expect(ollama("nomic-embed-text")?.prefix).toBe("clustering: ");
  });
});
