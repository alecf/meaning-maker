import { describe, expect, it, vi } from "vitest";
import { createWorkersAiProvider } from "./workersAi";

interface FakeInput {
  text: string[];
  pooling?: string;
}

function fakeAi(respond?: (input: FakeInput) => unknown) {
  const run = vi.fn(
    async (_model: string, input: FakeInput) =>
      respond?.(input) ?? { data: input.text.map(() => [1, 0]) },
  );
  return { ai: { run } as unknown as Ai, run };
}

describe("createWorkersAiProvider", () => {
  it("includes pooling when it's set", async () => {
    const { ai, run } = fakeAi();
    await createWorkersAiProvider(ai, { name: "m", pooling: "cls" }).embedBatch(["a"]);
    expect(run).toHaveBeenCalledWith("m", { text: ["a"], pooling: "cls" });
  });
  it("leaves pooling out otherwise", async () => {
    const { ai, run } = fakeAi();
    await createWorkersAiProvider(ai, { name: "m" }).embedBatch(["a"]);
    expect(run).toHaveBeenCalledWith("m", { text: ["a"] });
  });
  it("adds the task prefix to each text", async () => {
    const { ai, run } = fakeAi();
    await createWorkersAiProvider(ai, { name: "m", prefix: "task: " }).embedBatch(["a"]);
    expect(run.mock.calls[0][1].text).toEqual(["task: a"]);
  });
  it("sends batches of at most batchSize, in order", async () => {
    const { ai, run } = fakeAi((input) => ({
      data: input.text.map((text) => [text.charCodeAt(0)]),
    }));
    const vectors = await createWorkersAiProvider(ai, {
      name: "m",
      batchSize: 2,
    }).embedBatch(["a", "b", "c"]);
    expect(run.mock.calls.map(([, input]) => input.text)).toEqual([["a", "b"], ["c"]]);
    expect(vectors).toEqual([[97], [98], [99]]);
  });
  it("stays within the smallest batch limit by default", async () => {
    const { ai, run } = fakeAi();
    const texts = Array.from({ length: 33 }, (_, i) => `t${i}`);
    await createWorkersAiProvider(ai, { name: "m" }).embedBatch(texts);
    expect(run.mock.calls.map(([, input]) => input.text.length)).toEqual([32, 1]);
  });
  it("keeps batchSize out of the id, since it doesn't affect vectors", () => {
    const { ai } = fakeAi();
    expect(createWorkersAiProvider(ai, { name: "m", batchSize: 1 }).id).toBe(
      createWorkersAiProvider(ai, { name: "m" }).id,
    );
  });
  it("changes the id with pooling and prefix", () => {
    const { ai } = fakeAi();
    const base = createWorkersAiProvider(ai, { name: "m" }).id;
    expect(createWorkersAiProvider(ai, { name: "m", pooling: "cls" }).id).not.toBe(base);
    expect(createWorkersAiProvider(ai, { name: "m", prefix: "x" }).id).not.toBe(base);
  });
  it("gives no prefix and an empty prefix the same id", () => {
    const { ai } = fakeAi();
    expect(createWorkersAiProvider(ai, { name: "m", prefix: "" }).id).toBe(
      createWorkersAiProvider(ai, { name: "m" }).id,
    );
  });
  it("throws on a response without data", async () => {
    const { ai } = fakeAi(() => ({ response: [] }));
    await expect(
      createWorkersAiProvider(ai, { name: "m" }).embedBatch(["a"]),
    ).rejects.toThrow(/no data/);
  });
  it("throws if a response has the wrong number of vectors", async () => {
    const { ai } = fakeAi(() => ({ data: [[1, 0]] }));
    await expect(
      createWorkersAiProvider(ai, { name: "m" }).embedBatch(["a", "b"]),
    ).rejects.toThrow(/1 vectors for 2 texts/);
  });
});
