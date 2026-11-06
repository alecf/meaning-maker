import { afterEach, describe, expect, it, vi } from "vitest";
import {
  assertNotTruncated,
  createOllamaProvider,
  type OllamaModel,
  withExclusiveModel,
} from "./ollama";

interface Post {
  path: string;
  body: {
    model: string;
    input?: string[];
    keep_alive?: number | string;
    truncate?: boolean;
  };
}

interface FakeOptions {
  /** Models per `/api/ps` call. The last entry repeats. */
  ps?: string[][];
  promptEvalCount?: (input: string[]) => number;
  embeddingsPerRequest?: number;
}

function fakeOllama({
  ps = [[]],
  promptEvalCount = () => 1,
  embeddingsPerRequest,
}: FakeOptions = {}) {
  const posts: Post[] = [];
  const events: string[] = [];
  let psCalls = 0;
  let inFlight = 0;
  let maxInFlight = 0;

  const json = (value: unknown): Response => new Response(JSON.stringify(value));

  vi.stubGlobal(
    "fetch",
    vi.fn(async (url: string, init?: RequestInit) => {
      const path = new URL(url).pathname;
      if (path === "/api/ps") {
        const names = ps[Math.min(psCalls, ps.length - 1)];
        psCalls++;
        return json({ models: names.map((name) => ({ name })) });
      }
      const body = JSON.parse(String(init?.body)) as Post["body"];
      posts.push({ path, body });
      events.push(body.keep_alive === 0 ? "unload" : "embed");
      inFlight++;
      maxInFlight = Math.max(maxInFlight, inFlight);
      await Promise.resolve();
      inFlight--;
      const count = embeddingsPerRequest ?? body.input?.length ?? 0;
      return json({
        embeddings: Array.from({ length: count }, () => [1, 0]),
        prompt_eval_count: promptEvalCount(body.input ?? []),
      });
    }),
  );

  return {
    posts,
    events,
    embeds: () => posts.filter((post) => post.body.keep_alive !== 0),
    unloads: () => posts.filter((post) => post.body.keep_alive === 0),
    maxInFlight: () => maxInFlight,
  };
}

const quick = { pollMs: 0, unloadTimeoutMs: 0 };
const model: OllamaModel = { name: "m", prefix: "", maxTokens: 10 };
const inSession = <T>(run: () => Promise<T>): Promise<T> =>
  withExclusiveModel(model.name, run, quick);

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("withExclusiveModel", () => {
  it("runs the callback on an idle server, then unloads that model", async () => {
    const fake = fakeOllama();
    const result = await withExclusiveModel(
      "m",
      async () => {
        fake.events.push("run");
        return "done";
      },
      quick,
    );
    expect(result).toBe("done");
    expect(fake.events).toEqual(["run", "unload"]);
    expect(fake.unloads().map((post) => post.body.model)).toEqual(["m"]);
  });
  it("waits for another model and never unloads it", async () => {
    const fake = fakeOllama({ ps: [["other:latest"], ["other:latest"], []] });
    const run = vi.fn(async () => undefined);
    await withExclusiveModel("m", run, quick);
    expect(run).toHaveBeenCalledOnce();
    expect(fake.unloads().map((post) => post.body.model)).toEqual(["m"]);
  });
  it("gives up if another model never leaves, without touching it", async () => {
    const fake = fakeOllama({ ps: [["other:latest"]] });
    const run = vi.fn(async () => undefined);
    await expect(
      withExclusiveModel("m", run, { ...quick, timeoutMs: 0 }),
    ).rejects.toThrow(/busy with other:latest/);
    expect(run).not.toHaveBeenCalled();
    expect(fake.posts).toEqual([]);
  });
  it("still unloads when the callback throws", async () => {
    const fake = fakeOllama();
    await expect(
      withExclusiveModel(
        "m",
        async () => {
          throw new Error("boom");
        },
        quick,
      ),
    ).rejects.toThrow("boom");
    expect(fake.unloads()).toHaveLength(1);
  });
  it("throws if the model stays loaded after the unload", async () => {
    fakeOllama({ ps: [[], ["m:latest"]] });
    await expect(withExclusiveModel("m", async () => 1, quick)).rejects.toThrow(
      /Still loaded: m/,
    );
  });
  it("gives an unload time to finish", async () => {
    fakeOllama({ ps: [[], ["m:latest"], ["m:latest"], []] });
    await expect(
      withExclusiveModel("m", async () => 1, { pollMs: 0, unloadTimeoutMs: 1000 }),
    ).resolves.toBe(1);
  });
  it("doesn't blame or unload a model that arrived during the run", async () => {
    const fake = fakeOllama({ ps: [[], ["other:latest"]] });
    await expect(withExclusiveModel("m", async () => 1, quick)).resolves.toBe(1);
    expect(fake.unloads().map((post) => post.body.model)).toEqual(["m"]);
  });
  it("refuses a second model while one is in use", async () => {
    fakeOllama();
    await withExclusiveModel(
      "m",
      async () => {
        await expect(
          withExclusiveModel("n", async () => 1, quick),
        ).rejects.toThrow(/Already using m/);
      },
      quick,
    );
  });
  it("can be used again after a failure", async () => {
    fakeOllama({ ps: [["other:latest"], []] });
    await expect(
      withExclusiveModel("m", async () => 1, { ...quick, timeoutMs: 0 }),
    ).rejects.toThrow();
    await expect(withExclusiveModel("m", async () => 1, quick)).resolves.toBe(1);
  });
});

describe("createOllamaProvider", () => {
  it("refuses to embed outside withExclusiveModel", async () => {
    const fake = fakeOllama();
    await expect(createOllamaProvider(model).embedBatch(["a"])).rejects.toThrow(
      /withExclusiveModel/,
    );
    await expect(assertNotTruncated(model, ["a"])).rejects.toThrow(
      /withExclusiveModel/,
    );
    expect(fake.posts).toEqual([]);
  });
  it("adds the task prefix to each text", async () => {
    const fake = fakeOllama();
    const provider = createOllamaProvider({ ...model, prefix: "task: " });
    await inSession(() => provider.embedBatch(["a", "b"]));
    expect(fake.embeds()[0].body.input).toEqual(["task: a", "task: b"]);
  });
  it("sends one request at a time, in batches of batchSize", async () => {
    const fake = fakeOllama();
    const provider = createOllamaProvider({ ...model, batchSize: 2 });
    const vectors = await inSession(() => provider.embedBatch(["a", "b", "c"]));
    expect(fake.embeds().map((post) => post.body.input)).toEqual([["a", "b"], ["c"]]);
    expect(fake.maxInFlight()).toBe(1);
    expect(vectors).toHaveLength(3);
  });
  it("asks Ollama to fail rather than truncate", async () => {
    const fake = fakeOllama();
    await inSession(() => createOllamaProvider(model).embedBatch(["a"]));
    expect(fake.embeds()[0].body.truncate).toBe(false);
  });
  it("throws if a response has the wrong number of vectors", async () => {
    fakeOllama({ embeddingsPerRequest: 1 });
    await expect(
      inSession(() => createOllamaProvider(model).embedBatch(["a", "b"])),
    ).rejects.toThrow(/1 vectors for 2 texts/);
  });
});

describe("assertNotTruncated", () => {
  it("throws when a text reaches maxTokens", async () => {
    fakeOllama({ promptEvalCount: () => model.maxTokens });
    await expect(inSession(() => assertNotTruncated(model, ["a"]))).rejects.toThrow(
      /reached 10 tokens/,
    );
  });
  it("passes below maxTokens", async () => {
    fakeOllama({ promptEvalCount: () => model.maxTokens - 1 });
    await expect(
      inSession(() => assertNotTruncated(model, ["a"])),
    ).resolves.toBeUndefined();
  });
  it("checks the longest texts one at a time", async () => {
    const fake = fakeOllama();
    const texts = ["a", "bbbbbbb", "cc", "ddd", "eeee", "fffff", "gggggg"];
    await inSession(() => assertNotTruncated(model, texts));
    expect(fake.embeds().map((post) => post.body.input)).toEqual([
      ["bbbbbbb"],
      ["gggggg"],
      ["fffff"],
      ["eeee"],
      ["ddd"],
    ]);
  });
});
