import { existsSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
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
  /** What `/api/tags` lists. */
  tags?: { name: string; digest: string }[];
  promptEvalCount?: (input: string[]) => unknown;
  embeddingsPerRequest?: number;
  unloadStatus?: number;
}

const isUnload = (post: Post): boolean => post.path === "/api/generate";

function fakeOllama({
  ps = [[]],
  tags = [{ name: "m:latest", digest: "digest-1" }],
  promptEvalCount = () => 1,
  embeddingsPerRequest,
  unloadStatus = 200,
}: FakeOptions = {}) {
  const posts: Post[] = [];
  const events: string[] = [];
  let psCalls = 0;
  let inFlight = 0;
  let maxInFlight = 0;

  const json = (value: unknown, status = 200): Response =>
    new Response(JSON.stringify(value), { status });

  vi.stubGlobal(
    "fetch",
    vi.fn(async (url: string, init?: RequestInit) => {
      const path = new URL(url).pathname;
      if (path === "/api/tags") return json({ models: tags });
      if (path === "/api/ps") {
        const names = ps[Math.min(psCalls, ps.length - 1)];
        psCalls++;
        return json({ models: names.map((name) => ({ name })) });
      }
      const post: Post = { path, body: JSON.parse(String(init?.body)) };
      posts.push(post);
      if (isUnload(post)) {
        events.push("unload");
        return json({}, unloadStatus);
      }
      events.push("embed");
      inFlight++;
      maxInFlight = Math.max(maxInFlight, inFlight);
      await Promise.resolve();
      inFlight--;
      const count = embeddingsPerRequest ?? post.body.input?.length ?? 0;
      return json({
        embeddings: Array.from({ length: count }, () => [1, 0]),
        prompt_eval_count: promptEvalCount(post.body.input ?? []),
      });
    }),
  );

  return {
    posts,
    events,
    embeds: () => posts.filter((post) => !isUnload(post)),
    unloads: () => posts.filter(isUnload),
    maxInFlight: () => maxInFlight,
  };
}

const model: OllamaModel = { name: "m", prefix: "", maxTokens: 10 };

describe("ollama", () => {
  let dir: string;
  let lockFile: string;
  let quick: { pollMs: number; unloadTimeoutMs: number; lockFile: string };
  let warn: ReturnType<typeof vi.spyOn>;

  const inSession = <T>(run: () => Promise<T>, target = model): Promise<T> =>
    withExclusiveModel(target, run, quick);
  const embedOne = async (): Promise<void> => {
    const provider = await createOllamaProvider(model);
    await provider.embedBatch(["a"]);
  };

  beforeEach(() => {
    dir = mkdtempSync(join(tmpdir(), "ollama-lock-"));
    lockFile = join(dir, "nested", "ollama.lock");
    quick = { pollMs: 0, unloadTimeoutMs: 0, lockFile };
    warn = vi.spyOn(console, "warn").mockImplementation(() => undefined);
  });
  afterEach(() => {
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
    rmSync(dir, { recursive: true });
  });

  describe("withExclusiveModel", () => {
    it("runs the callback on an idle server, then unloads that model", async () => {
      const fake = fakeOllama();
      const result = await inSession(async () => {
        await embedOne();
        return "done";
      });
      expect(result).toBe("done");
      expect(fake.events).toEqual(["embed", "unload"]);
      expect(fake.unloads().map((post) => post.body)).toEqual([
        { model: "m", keep_alive: 0 },
      ]);
    });
    it("unloads nothing if the session sent no embed request", async () => {
      const fake = fakeOllama();
      await expect(inSession(async () => "cached")).resolves.toBe("cached");
      expect(fake.posts).toEqual([]);
    });
    it("waits for another model and never unloads it", async () => {
      const fake = fakeOllama({ ps: [["other:latest"], ["other:latest"], []] });
      await inSession(embedOne);
      expect(fake.unloads().map((post) => post.body.model)).toEqual(["m"]);
    });
    it("gives up if another model never leaves, without touching it", async () => {
      const fake = fakeOllama({ ps: [["other:latest"]] });
      const run = vi.fn(async () => undefined);
      await expect(
        withExclusiveModel(model, run, { ...quick, timeoutMs: 0 }),
      ).rejects.toThrow(/busy with other:latest/);
      expect(run).not.toHaveBeenCalled();
      expect(fake.posts).toEqual([]);
    });
    it("still unloads when the callback throws", async () => {
      const fake = fakeOllama();
      await expect(
        inSession(async () => {
          await embedOne();
          throw new Error("boom");
        }),
      ).rejects.toThrow("boom");
      expect(fake.unloads()).toHaveLength(1);
    });
    it("rethrows the run's error when the unload fails too", async () => {
      fakeOllama({ unloadStatus: 500 });
      await expect(
        inSession(async () => {
          await embedOne();
          throw new Error("boom");
        }),
      ).rejects.toThrow("boom");
      expect(warn).toHaveBeenCalledOnce();
    });
    it("returns the result and warns when the unload fails", async () => {
      fakeOllama({ unloadStatus: 500 });
      const result = await inSession(async () => {
        await embedOne();
        return "done";
      });
      expect(result).toBe("done");
      expect(warn.mock.calls[0][0]).toMatch(/Couldn't unload m/);
    });
    it("warns rather than throws if the model stays loaded", async () => {
      fakeOllama({ ps: [[], [], ["m:latest"]] });
      const result = await inSession(async () => {
        await embedOne();
        return "done";
      });
      expect(result).toBe("done");
      expect(warn.mock.calls[0][0]).toMatch(/still loaded/);
    });
    it("gives an unload time to finish", async () => {
      fakeOllama({ ps: [[], [], ["m:latest"], ["m:latest"], []] });
      await withExclusiveModel(model, embedOne, { ...quick, unloadTimeoutMs: 1000 });
      expect(warn).not.toHaveBeenCalled();
    });
    it("refuses a second model while one is in use", async () => {
      fakeOllama();
      await inSession(async () => {
        await expect(
          withExclusiveModel({ ...model, name: "n" }, async () => 1, quick),
        ).rejects.toThrow(/Already using m/);
      });
    });
    it("can be used again after a failure", async () => {
      fakeOllama({ ps: [["other:latest"], []] });
      await expect(
        withExclusiveModel(model, async () => 1, { ...quick, timeoutMs: 0 }),
      ).rejects.toThrow();
      await expect(inSession(async () => 1)).resolves.toBe(1);
    });
  });

  describe("lockfile", () => {
    const lockPath = (): string => join(dir, "ollama.lock");

    it("holds the pid during the run and removes it afterwards", async () => {
      fakeOllama();
      await inSession(async () => {
        expect(existsSync(lockFile)).toBe(true);
      });
      expect(existsSync(lockFile)).toBe(false);
    });
    it("removes the lock when the run fails", async () => {
      fakeOllama();
      await expect(
        inSession(async () => {
          throw new Error("boom");
        }),
      ).rejects.toThrow("boom");
      expect(existsSync(lockFile)).toBe(false);
    });
    it("refuses a lock held by a live process", async () => {
      fakeOllama();
      writeFileSync(lockPath(), String(process.pid));
      const run = vi.fn(async () => undefined);
      await expect(
        withExclusiveModel(model, run, { ...quick, lockFile: lockPath() }),
      ).rejects.toThrow(`held by pid ${process.pid}`);
      expect(run).not.toHaveBeenCalled();
      expect(existsSync(lockPath())).toBe(true);
    });
    it.each([
      ["a dead pid", "2147483646"],
      ["no pid", ""],
    ])("replaces a stale lock with %s", async (_name, contents) => {
      fakeOllama();
      writeFileSync(lockPath(), contents);
      await expect(
        withExclusiveModel(model, async () => 1, { ...quick, lockFile: lockPath() }),
      ).resolves.toBe(1);
      expect(existsSync(lockPath())).toBe(false);
    });
  });

  describe("swap protection", () => {
    it("stops before an embed if another model has been loaded", async () => {
      const fake = fakeOllama({ ps: [[], ["other:latest"]] });
      await expect(inSession(embedOne)).rejects.toThrow(
        /other:latest loaded while using m/,
      );
      expect(fake.embeds()).toEqual([]);
      expect(fake.unloads()).toEqual([]);
    });
    it("checks again before every request", async () => {
      const fake = fakeOllama({ ps: [[], [], ["m:latest", "other:latest"]] });
      const provider = await createOllamaProvider({ ...model, batchSize: 1 });
      await expect(
        inSession(() => provider.embedBatch(["a", "b"])),
      ).rejects.toThrow(/other:latest/);
      expect(fake.embeds()).toHaveLength(1);
      expect(fake.unloads().map((post) => post.body.model)).toEqual(["m"]);
    });
    it("accepts its own model being loaded", async () => {
      fakeOllama({ ps: [[], ["m:latest"], []] });
      await expect(inSession(embedOne)).resolves.toBeUndefined();
    });
  });

  describe("createOllamaProvider", () => {
    it("refuses to embed outside withExclusiveModel", async () => {
      const fake = fakeOllama();
      const provider = await createOllamaProvider(model);
      await expect(provider.embedBatch(["a"])).rejects.toThrow(/withExclusiveModel/);
      await expect(assertNotTruncated(model, ["a"])).rejects.toThrow(
        /withExclusiveModel/,
      );
      expect(fake.posts).toEqual([]);
    });
    it("refuses a session held with other options", async () => {
      const fake = fakeOllama();
      const provider = await createOllamaProvider({
        ...model,
        options: { num_ctx: 2048 },
      });
      await expect(
        inSession(() => provider.embedBatch(["a"]), {
          ...model,
          options: { num_ctx: 512 },
        }),
      ).rejects.toThrow(/withExclusiveModel/);
      expect(fake.embeds()).toEqual([]);
    });
    it("ignores option order in the session check", async () => {
      fakeOllama();
      const provider = await createOllamaProvider({
        ...model,
        options: { a: 1, b: 2 },
      });
      await expect(
        inSession(() => provider.embedBatch(["a"]), {
          ...model,
          options: { b: 2, a: 1 },
        }),
      ).resolves.toHaveLength(1);
    });
    it("throws on overlapping embedBatch calls", async () => {
      const fake = fakeOllama();
      const provider = await createOllamaProvider(model);
      await inSession(async () => {
        const first = provider.embedBatch(["a"]);
        await expect(provider.embedBatch(["b"])).rejects.toThrow(/in flight/);
        await first;
      });
      expect(fake.embeds()).toHaveLength(1);
    });
    it("takes a new call once the last one has finished", async () => {
      fakeOllama();
      const provider = await createOllamaProvider(model);
      await inSession(async () => {
        await provider.embedBatch(["a"]);
        await expect(provider.embedBatch(["b"])).resolves.toHaveLength(1);
      });
    });
    it("adds the task prefix to each text", async () => {
      const fake = fakeOllama();
      const provider = await createOllamaProvider({ ...model, prefix: "task: " });
      await inSession(() => provider.embedBatch(["a", "b"]));
      expect(fake.embeds()[0].body.input).toEqual(["task: a", "task: b"]);
    });
    it("sends one request at a time, in batches of batchSize", async () => {
      const fake = fakeOllama();
      const provider = await createOllamaProvider({ ...model, batchSize: 2 });
      const vectors = await inSession(() => provider.embedBatch(["a", "b", "c"]));
      expect(fake.embeds().map((post) => post.body.input)).toEqual([
        ["a", "b"],
        ["c"],
      ]);
      expect(fake.maxInFlight()).toBe(1);
      expect(vectors).toHaveLength(3);
    });
    it("asks Ollama to fail rather than truncate", async () => {
      const fake = fakeOllama();
      await inSession(embedOne);
      expect(fake.embeds()[0].body.truncate).toBe(false);
    });
    it("throws if a response has the wrong number of vectors", async () => {
      fakeOllama({ embeddingsPerRequest: 1 });
      const provider = await createOllamaProvider(model);
      await expect(
        inSession(() => provider.embedBatch(["a", "b"])),
      ).rejects.toThrow(/1 vectors for 2 texts/);
    });
  });

  describe("provider id", () => {
    const idFor = async (
      target: OllamaModel,
      digest = "digest-1",
    ): Promise<string> => {
      fakeOllama({ tags: [{ name: "m:latest", digest }] });
      return (await createOllamaProvider(target)).id;
    };

    it("changes with the digest, so a re-pull misses the cache", async () => {
      expect(await idFor(model, "digest-1")).not.toBe(await idFor(model, "digest-2"));
    });
    it("matches a tagged name as well", async () => {
      fakeOllama({ tags: [{ name: "q:0.6b", digest: "d" }] });
      const provider = await createOllamaProvider({ ...model, name: "q:0.6b" });
      expect(provider.id).toContain('"digest":"d"');
    });
    it("throws if the model isn't installed", async () => {
      fakeOllama({ tags: [{ name: "other:latest", digest: "d" }] });
      await expect(createOllamaProvider(model)).rejects.toThrow(/m isn't installed/);
    });
    it("changes with the prefix and options", async () => {
      const base = await idFor(model);
      expect(await idFor({ ...model, prefix: "x" })).not.toBe(base);
      expect(await idFor({ ...model, options: { num_ctx: 1 } })).not.toBe(base);
    });
    it("ignores batchSize and maxTokens, which don't affect vectors", async () => {
      expect(await idFor({ ...model, batchSize: 1, maxTokens: 99 })).toBe(
        await idFor(model),
      );
    });
  });

  describe("assertNotTruncated", () => {
    it("throws when a text reaches maxTokens", async () => {
      fakeOllama({ promptEvalCount: () => model.maxTokens });
      await expect(
        inSession(() => assertNotTruncated(model, ["a"])),
      ).rejects.toThrow(/reached 10 tokens/);
    });
    it("passes below maxTokens", async () => {
      fakeOllama({ promptEvalCount: () => model.maxTokens - 1 });
      await expect(
        inSession(() => assertNotTruncated(model, ["a"])),
      ).resolves.toBeUndefined();
    });
    it.each([
      ["zero", 0],
      ["missing", undefined],
      ["a string", "5"],
      ["negative", -1],
    ])("throws when prompt_eval_count is %s", async (_name, count) => {
      fakeOllama({ promptEvalCount: () => count });
      await expect(
        inSession(() => assertNotTruncated(model, ["a"])),
      ).rejects.toThrow(/prompt_eval_count/);
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
});
