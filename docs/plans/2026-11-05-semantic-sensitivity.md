# Semantic Sensitivity Benchmark Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Measure which embedding models notice small edits that change meaning, then publish the results with a live box backed by Workers AI.

**Architecture:** Shared scoring lives in `src/util/benchmark/`, so the batch job and the live route can't drift apart. Batch-only code lives in `scripts/benchmark/`. Local vectors are cached in a gitignored folder, and only results JSON is committed.

**Tech Stack:** TypeScript, Vitest, Ollama HTTP API, Workers AI through `getPlatformProxy`, OpenRouter, Next.js App Router.

**Design:** [2026-11-05-semantic-sensitivity-design.md](2026-11-05-semantic-sensitivity-design.md)

---

## Ground rules

- Run `npm test`, `npm run typecheck` and `npm run lint` before each commit.
- Never run two Ollama models at once. All Ollama access goes through `withExclusiveModel` (Task 6).
- PAWS results keep similarities only, never vectors. All-model vector storage would be about 5 GB in binary and over 30 GB as JSON, with 23 GB free.
- Stop at Task 12. The page tasks depend on what the results show, so they're only outlined here.

## Phase 1: scoring and baseline

### Task 1: Shared types

**Files:**
- Create: `src/util/benchmark/types.ts`

**Step 1: Write the types**

```ts
export const CATEGORIES = [
  "negation",
  "swapped-roles",
  "quantifiers",
  "numbers",
  "antonyms",
  "negation-scope",
] as const;

export type Category = (typeof CATEGORIES)[number];

export interface Triplet {
  id: string;
  category: Category;
  anchor: string;
  paraphrase: string;
  edit: string;
  /** Sentences of neutral context added around all three; 0 for bare sentences. */
  contextSentences: 0 | 1 | 3 | 8;
  status: "draft" | "approved" | "rejected";
}

export interface TripletScore {
  id: string;
  paraphraseSimilarity: number;
  editSimilarity: number;
  /** paraphraseSimilarity - editSimilarity. Positive means a pass. */
  margin: number;
  passed: boolean;
}

export interface Interval {
  rate: number;
  low: number;
  high: number;
}

export interface EmbeddingProvider {
  /** Stable identity, including pooling and task prefix. Used in cache keys. */
  readonly id: string;
  embedBatch(texts: string[]): Promise<number[][]>;
}
```

**Step 2: Commit**

```bash
git add src/util/benchmark/types.ts
git commit -m "Add benchmark types"
```

### Task 2: Triplet scoring

**Files:**
- Create: `src/util/benchmark/scoring.ts`
- Test: `src/util/benchmark/scoring.test.ts`

**Step 1: Write the failing test**

```ts
import { describe, expect, it } from "vitest";
import { cosine, scoreTriplet } from "./scoring";

describe("cosine", () => {
  it("is 1 for parallel vectors", () => {
    expect(cosine([1, 2], [2, 4])).toBeCloseTo(1);
  });
  it("is 0 for orthogonal vectors", () => {
    expect(cosine([1, 0], [0, 1])).toBeCloseTo(0);
  });
  it("is 0 rather than NaN for a zero vector", () => {
    expect(cosine([0, 0], [1, 1])).toBe(0);
  });
});

describe("scoreTriplet", () => {
  it("passes when the paraphrase is closer", () => {
    const score = scoreTriplet("t", [1, 0], [1, 0.1], [0, 1]);
    expect(score.passed).toBe(true);
    expect(score.margin).toBeGreaterThan(0);
  });
  it("fails when the edit is closer", () => {
    expect(scoreTriplet("t", [1, 0], [0, 1], [1, 0.1]).passed).toBe(false);
  });
  it("counts a tie as a fail", () => {
    expect(scoreTriplet("t", [1, 0], [1, 1], [1, 1]).passed).toBe(false);
  });
});
```

**Step 2: Run it to confirm it fails**

Run: `npx vitest run src/util/benchmark/scoring.test.ts`
Expected: FAIL, cannot find `./scoring`.

**Step 3: Implement**

```ts
import type { TripletScore } from "./types";

export function cosine(a: number[], b: number[]): number {
  let ab = 0;
  let aa = 0;
  let bb = 0;
  for (let i = 0; i < a.length; i++) {
    ab += a[i] * b[i];
    aa += a[i] * a[i];
    bb += b[i] * b[i];
  }
  return aa === 0 || bb === 0 ? 0 : ab / Math.sqrt(aa * bb);
}

export function scoreTriplet(
  id: string,
  anchor: number[],
  paraphrase: number[],
  edit: number[],
): TripletScore {
  const paraphraseSimilarity = cosine(anchor, paraphrase);
  const editSimilarity = cosine(anchor, edit);
  const margin = paraphraseSimilarity - editSimilarity;
  return { id, paraphraseSimilarity, editSimilarity, margin, passed: margin > 0 };
}
```

**Step 4: Run it to confirm it passes**

Run: `npx vitest run src/util/benchmark/scoring.test.ts`
Expected: PASS.

**Step 5: Commit**

```bash
git add src/util/benchmark/scoring.ts src/util/benchmark/scoring.test.ts
git commit -m "Add triplet scoring"
```

### Task 3: Pass rates with confidence intervals

**Files:**
- Modify: `src/util/benchmark/scoring.ts`
- Test: `src/util/benchmark/scoring.test.ts`

**Step 1: Add the failing test**

```ts
import { passRate } from "./scoring";

describe("passRate", () => {
  const scores = (passes: number, total: number): boolean[] =>
    Array.from({ length: total }, (_, i) => i < passes);

  it("reports the observed rate", () => {
    expect(passRate(scores(3, 4)).rate).toBe(0.75);
  });
  it("brackets the rate", () => {
    const { low, rate, high } = passRate(scores(60, 100));
    expect(low).toBeLessThan(rate);
    expect(high).toBeGreaterThan(rate);
  });
  it("is deterministic", () => {
    expect(passRate(scores(7, 15))).toEqual(passRate(scores(7, 15)));
  });
  it("collapses when every triplet ties at zero", () => {
    expect(passRate(scores(0, 15))).toEqual({ rate: 0, low: 0, high: 0 });
  });
  it("rejects an empty list", () => {
    expect(() => passRate([])).toThrow();
  });
});
```

**Step 2: Run it to confirm it fails**

Run: `npx vitest run src/util/benchmark/scoring.test.ts`
Expected: FAIL, `passRate` is not exported.

**Step 3: Implement**

```ts
import type { Interval, TripletScore } from "./types";

/** Small seeded generator, so results files don't change between runs. */
function mulberry32(seed: number): () => number {
  let a = seed;
  return () => {
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** Pass rate with a 95% percentile bootstrap interval across triplets. */
export function passRate(passed: boolean[], resamples = 2000): Interval {
  if (passed.length === 0) throw new Error("passRate needs at least one result");
  const random = mulberry32(1);
  const rate = passed.filter(Boolean).length / passed.length;
  const rates = Array.from({ length: resamples }, () => {
    let hits = 0;
    for (let i = 0; i < passed.length; i++) {
      if (passed[Math.floor(random() * passed.length)]) hits++;
    }
    return hits / passed.length;
  }).sort((a, b) => a - b);
  return {
    rate,
    low: rates[Math.floor(resamples * 0.025)],
    high: rates[Math.floor(resamples * 0.975)],
  };
}
```

Merge the `import type` line with the existing one from Task 2.

**Step 4: Run it to confirm it passes**

Run: `npx vitest run src/util/benchmark/scoring.test.ts`
Expected: PASS.

**Step 5: Commit**

```bash
git add src/util/benchmark/scoring.ts src/util/benchmark/scoring.test.ts
git commit -m "Add bootstrap pass rates"
```

### Task 4: Bag-of-words baseline

**Files:**
- Create: `src/util/benchmark/bagOfWords.ts`
- Test: `src/util/benchmark/bagOfWords.test.ts`

**Step 1: Write the failing test**

```ts
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
  it("gives vectors of the same length within a batch", async () => {
    const [a, b] = await createBagOfWordsProvider().embedBatch(["one two", "three"]);
    expect(a.length).toBe(b.length);
  });
});
```

**Step 2: Run it to confirm it fails**

Run: `npx vitest run src/util/benchmark/bagOfWords.test.ts`
Expected: FAIL, cannot find `./bagOfWords`.

**Step 3: Implement**

```ts
import type { EmbeddingProvider } from "./types";

const words = (text: string): string[] =>
  text.toLowerCase().match(/[\p{L}\p{N}']+/gu) ?? [];

/** Word counts over the batch's vocabulary, so triplets must share a batch. */
export function createBagOfWordsProvider(): EmbeddingProvider {
  return {
    id: "bag-of-words",
    async embedBatch(texts: string[]): Promise<number[][]> {
      const vocabulary = [...new Set(texts.flatMap(words))];
      const index = new Map(vocabulary.map((word, i) => [word, i]));
      return texts.map((text) => {
        const vector = new Array<number>(vocabulary.length).fill(0);
        for (const word of words(text)) vector[index.get(word) as number]++;
        return vector;
      });
    },
  };
}
```

The runner must skip the on-disk cache for this provider, since vectors depend on the batch.

**Step 4: Run it to confirm it passes**

Run: `npx vitest run src/util/benchmark/bagOfWords.test.ts`
Expected: PASS.

**Step 5: Commit**

```bash
git add src/util/benchmark/bagOfWords.ts src/util/benchmark/bagOfWords.test.ts
git commit -m "Add bag-of-words baseline"
```

## Phase 2: local runner

### Task 5: Vector cache

**Files:**
- Create: `scripts/benchmark/vectorCache.ts`
- Test: `scripts/benchmark/vectorCache.test.ts`
- Modify: `.gitignore`

**Step 1: Ignore the cache**

Add these lines to `.gitignore`:

```
# benchmark
/.benchmark-cache/
```

**Step 2: Write the failing test**

Use `mkdtempSync` from `node:fs` and `tmpdir` from `node:os` for a throwaway folder. Test that:

- A vector written by one `openVectorCache(dir, providerId)` call is read back by a second call, within Float32 precision.
- Different provider ids don't see each other's entries.
- A truncated last line, as left by a killed run, is ignored and earlier entries still load.

**Step 3: Run it to confirm it fails**

Run: `npx vitest run scripts/benchmark/vectorCache.test.ts`
Expected: FAIL, cannot find `./vectorCache`.

**Step 4: Implement**

```ts
import { createHash } from "node:crypto";
import { appendFileSync, existsSync, mkdirSync, readFileSync } from "node:fs";
import { join } from "node:path";

export interface VectorCache {
  get(text: string): number[] | undefined;
  put(text: string, vector: number[]): void;
}

const hash = (value: string): string =>
  createHash("sha256").update(value).digest("hex");

/** One append-only file per provider: `<text hash> <base64 Float32 vector>`. */
export function openVectorCache(dir: string, providerId: string): VectorCache {
  mkdirSync(dir, { recursive: true });
  const file = join(dir, `${hash(providerId).slice(0, 16)}.tsv`);
  const entries = new Map<string, string>();
  if (existsSync(file)) {
    for (const line of readFileSync(file, "utf8").split("\n")) {
      const [key, value] = line.split("\t");
      if (key?.length === 64 && value && Buffer.from(value, "base64").length % 4 === 0) {
        entries.set(key, value);
      }
    }
  }
  return {
    get(text) {
      const value = entries.get(hash(text));
      if (!value) return undefined;
      const bytes = Buffer.from(value, "base64");
      const floats = new Float32Array(
        bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.length),
      );
      return Array.from(floats);
    },
    put(text, vector) {
      const key = hash(text);
      const value = Buffer.from(new Float32Array(vector).buffer).toString("base64");
      entries.set(key, value);
      appendFileSync(file, `${key}\t${value}\n`);
    },
  };
}
```

A half-written line can pass the length check, so also skip any entry whose vector length differs from the first entry's. Add that once the truncation test shows it's needed.

**Step 5: Run it to confirm it passes**

Run: `npx vitest run scripts/benchmark/vectorCache.test.ts`
Expected: PASS.

**Step 6: Commit**

```bash
git add .gitignore scripts/benchmark/vectorCache.ts scripts/benchmark/vectorCache.test.ts
git commit -m "Add resumable vector cache"
```

### Task 6: Ollama provider and exclusive model access

**Files:**
- Create: `scripts/benchmark/ollama.ts`
- Test: `scripts/benchmark/ollama.test.ts`

**Step 1: Write the failing test**

Stub `globalThis.fetch` with `vi.fn()` and a small fake of `/api/ps` and `/api/embed`. Test that `withExclusiveModel`:

- Runs the callback when `/api/ps` is empty, then posts `keep_alive: 0` for that model.
- Waits while another model is loaded and never posts an unload for that other model.
- Throws after its timeout if the other model never leaves.
- Still unloads when the callback throws.
- Throws if the model is still loaded after the unload.

Test that `createOllamaProvider`:

- Adds the task prefix to each text.
- Sends one request at a time, in batches of `batchSize`.

Test that `assertNotTruncated` throws when a text's `prompt_eval_count` reaches `maxTokens`, and passes below it.

**Step 2: Run it to confirm it fails**

Run: `npx vitest run scripts/benchmark/ollama.test.ts`
Expected: FAIL, cannot find `./ollama`.

**Step 3: Implement**

```ts
import type { EmbeddingProvider } from "@/util/benchmark/types";

const BASE = "http://localhost:11434";
const POLL_MS = 5_000;

async function post<T>(path: string, body: unknown): Promise<T> {
  const response = await fetch(`${BASE}${path}`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  if (!response.ok) {
    throw new Error(`Ollama ${path}: ${response.status} ${await response.text()}`);
  }
  return response.json() as Promise<T>;
}

async function loadedModels(): Promise<string[]> {
  const response = await fetch(`${BASE}/api/ps`);
  const { models } = (await response.json()) as { models: { name: string }[] };
  return models.map((m) => m.name);
}

/**
 * The only way to use a model. Waits for Ollama to be idle, so it never forces
 * a swap, and unloads its own model afterwards. Never unloads anything else.
 */
export async function withExclusiveModel<T>(
  model: string,
  run: () => Promise<T>,
  { timeoutMs = 600_000, pollMs = POLL_MS } = {},
): Promise<T> {
  const deadline = Date.now() + timeoutMs;
  for (;;) {
    const loaded = await loadedModels();
    if (loaded.length === 0) break;
    if (Date.now() > deadline) {
      throw new Error(`Ollama still busy with ${loaded.join(", ")}`);
    }
    await new Promise((resolve) => setTimeout(resolve, pollMs));
  }
  try {
    return await run();
  } finally {
    await post("/api/embed", { model, input: [], keep_alive: 0 });
    const left = await loadedModels();
    if (left.length > 0) throw new Error(`Still loaded: ${left.join(", ")}`);
  }
}

export interface OllamaModel {
  name: string;
  prefix: string;
  maxTokens: number;
  batchSize?: number;
  options?: Record<string, unknown>;
}

interface EmbedResponse {
  embeddings: number[][];
  prompt_eval_count: number;
}

const embedOnce = (model: OllamaModel, input: string[]): Promise<EmbedResponse> =>
  post("/api/embed", {
    model: model.name,
    input: input.map((text) => model.prefix + text),
    keep_alive: "5m",
    options: model.options,
  });

export function createOllamaProvider(model: OllamaModel): EmbeddingProvider {
  const batchSize = model.batchSize ?? 64;
  return {
    id: JSON.stringify({ host: "ollama", ...model }),
    async embedBatch(texts) {
      const vectors: number[][] = [];
      for (let i = 0; i < texts.length; i += batchSize) {
        const { embeddings } = await embedOnce(model, texts.slice(i, i + batchSize));
        vectors.push(...embeddings);
      }
      return vectors;
    },
  };
}

/**
 * `prompt_eval_count` is a batch total, so per-text checks need their own
 * requests. Checks the longest few texts, which is where truncation would hit.
 */
export async function assertNotTruncated(
  model: OllamaModel,
  texts: string[],
): Promise<void> {
  const longest = [...texts].sort((a, b) => b.length - a.length).slice(0, 5);
  for (const text of longest) {
    const { prompt_eval_count: tokens } = await embedOnce(model, [text]);
    if (tokens >= model.maxTokens) {
      throw new Error(`${model.name} reached ${tokens} tokens on: ${text.slice(0, 80)}`);
    }
  }
}
```

The design says to check every response. This replaces that with a check of the longest texts, because Ollama only reports a batch total.

**Step 4: Run it to confirm it passes**

Run: `npx vitest run scripts/benchmark/ollama.test.ts`
Expected: PASS.

**Step 5: Commit**

```bash
git add scripts/benchmark/ollama.ts scripts/benchmark/ollama.test.ts
git commit -m "Add Ollama provider with exclusive model access"
```

### Task 7: Workers AI provider with pooling

**Files:**
- Create: `scripts/benchmark/workersAi.ts`
- Test: `scripts/benchmark/workersAi.test.ts`

`workers-ai-provider` can't set pooling (see the note in `src/util/workersAiEmbedder.ts`), so call the binding directly.

**Step 1: Write the failing test**

With a fake `Ai` whose `run` is `vi.fn()`, test that:

- `pooling: "cls"` is included in the input when set, and left out otherwise.
- Texts go out in batches of at most `batchSize`, in order.
- A response without `data` throws.

**Step 2: Run it to confirm it fails**

Run: `npx vitest run scripts/benchmark/workersAi.test.ts`
Expected: FAIL, cannot find `./workersAi`.

**Step 3: Implement**

```ts
import type { EmbeddingProvider } from "@/util/benchmark/types";

export interface WorkersAiModel {
  name: string;
  pooling?: "mean" | "cls";
  prefix?: string;
  batchSize?: number;
}

export function createWorkersAiProvider(
  ai: Ai,
  model: WorkersAiModel,
): EmbeddingProvider {
  const batchSize = model.batchSize ?? 32;
  const prefix = model.prefix ?? "";
  return {
    id: JSON.stringify({ host: "workers-ai", ...model }),
    async embedBatch(texts) {
      const vectors: number[][] = [];
      for (let i = 0; i < texts.length; i += batchSize) {
        const text = texts.slice(i, i + batchSize).map((t) => prefix + t);
        const input = model.pooling ? { text, pooling: model.pooling } : { text };
        const result = (await ai.run(model.name as never, input as never)) as {
          data?: number[][];
        };
        if (!result.data) throw new Error(`${model.name}: no data in response`);
        vectors.push(...result.data);
      }
      return vectors;
    },
  };
}
```

Check each model's input shape with `npx wrangler ai models schema <model>`. bge-m3 and qwen3 may differ from bge-large; add per-model handling only if the schema requires it.

**Step 4: Run it to confirm it passes**

Run: `npx vitest run scripts/benchmark/workersAi.test.ts`
Expected: PASS.

**Step 5: Commit**

```bash
git add scripts/benchmark/workersAi.ts scripts/benchmark/workersAi.test.ts
git commit -m "Add Workers AI benchmark provider with pooling"
```

### Task 8: Model registry

**Files:**
- Create: `scripts/benchmark/models.ts`

**Step 1: Confirm the task prefixes**

Check each model card and record the source in a comment. Starting points to confirm, not facts:

| Model | Starting point |
|---|---|
| nomic-embed-text | `search_document: ` |
| embeddinggemma | `task: sentence similarity \| query: ` |
| EmbeddingGemma 2 | Check the model card |
| qwen3-embedding:0.6b | Check whether the instruction format applies to symmetric comparison |
| bge, mxbai, all-minilm | No prefix for sentence comparison, but confirm |

Use the same prefix on all three texts of a triplet, and use the same prefix on both hosts for calibration.

**Step 2: Write the registry**

List all Ollama models as `OllamaModel` entries, using these limits from the vetting run:

| Model | `maxTokens` |
|---|---|
| all-minilm | 256 |
| bge-large, mxbai-embed-large | 512 |
| all others | 8192 |

Set `options: { num_ctx: 2048 }` on qwen3 to cut its 4.8 GB memory use, then confirm that with `ollama ps`.

**Step 3: Commit**

```bash
git add scripts/benchmark/models.ts
git commit -m "Add benchmark model registry"
```

### Task 9: Calibrate Ollama against Workers AI

**Files:**
- Create: `scripts/benchmark/calibrate.ts`
- Create: `data/benchmark/calibration-triplets.jsonl`
- Create: `data/benchmark/calibration.json`
- Modify: `package.json`

**Step 1: Write about 100 calibration triplets**

These don't need the full review, because they compare hosts, not models. Keep them out of the published test set.

**Step 2: Write the script**

For each of bge-large (`cls`), bge-m3, qwen3 and embeddinggemma:

1. Embed everything on Workers AI first, using `getPlatformProxy` from `wrangler`.
2. Embed everything on Ollama inside `withExclusiveModel`, after `assertNotTruncated`.
3. Record the mean cosine between the hosts' vectors, the share of triplets with matching verdicts, and the worst margin difference.

Add `"benchmark:calibrate": "node scripts/run.mjs scripts/benchmark/calibrate.ts"` to `package.json`.

**Step 3: Run it**

Run: `npm run benchmark:calibrate`
Expected: `data/benchmark/calibration.json` has one row per model and `ollama ps` is empty afterwards.

**Step 4: Review and commit**

If verdicts match on at least 95% of triplets, treat the model as interchangeable. Otherwise, it gets separate rows. Stop and report to Alec if bge-large doesn't match, since it's the app's model.

```bash
git add scripts/benchmark/calibrate.ts data/benchmark package.json
git commit -m "Calibrate Ollama against Workers AI"
```

## Phase 3: test set and results

### Task 10: Draft the triplets

**Files:**
- Create: `data/benchmark/triplets.jsonl`
- Create: `data/benchmark/context-sentences.json`
- Create: `scripts/benchmark/validate.ts`
- Test: `scripts/benchmark/validate.test.ts`

**Step 1: Write the validator with tests**

`validateTriplet` returns a list of problems:

- Paraphrase and edit lengths differ by more than 30%.
- A `swapped-roles` edit doesn't use the same words as the anchor.
- The paraphrase has the same words as the anchor with one word changed.
- Any field is empty, or the id is duplicated.

**Step 2: Draft about 130 triplets across the six categories**

Keep `status: "draft"`. Write an independent critique of each one, and record the reason for any flag.

**Step 3: Publish the shortlist for review**

Give Alec the shortlist with flags shown, and record each decision as `approved` or `rejected`. **Stop here until Alec has approved it.**

**Step 4: Commit**

```bash
git add data/benchmark scripts/benchmark/validate.ts scripts/benchmark/validate.test.ts
git commit -m "Add reviewed benchmark triplets"
```

### Task 11: OpenRouter provider

**Files:**
- Create: `scripts/benchmark/openRouter.ts`
- Test: `scripts/benchmark/openRouter.test.ts`
- Modify: `.gitignore` if the key file isn't already covered

**Step 1: Check the unknowns**

Using a key Alec supplies in `.env.benchmark.local`:

- Does OpenRouter accept Cohere's `input_type`?
- For one model with a direct API available, do vectors match? If no direct key exists, record this as unverified on the page.

**Step 2: Write tests and the provider**

Use `fetch` against `https://openrouter.ai/api/v1/embeddings` with batching, and retry on 429 and 5xx with backoff. Test both with a stubbed `fetch`. Read the key from the environment, and fail with a clear message if it's missing.

**Step 3: Commit**

```bash
git add scripts/benchmark/openRouter.ts scripts/benchmark/openRouter.test.ts
git commit -m "Add OpenRouter benchmark provider"
```

### Task 12: Run the benchmark and PAWS

**Files:**
- Create: `scripts/benchmark/run.ts`
- Create: `scripts/benchmark/paws.ts`
- Test: `scripts/benchmark/report.test.ts`
- Create: `data/benchmark/results.json`
- Modify: `package.json`

**Step 1: Write `run.ts`**

Load approved triplets, expand them with context, and run each model in turn. Check the cache first, and only embed what's missing. Ollama models run inside `withExclusiveModel`. A failed model goes into `missing` with its error and the run continues. Skip the cache for bag-of-words, and score each triplet in its own batch.

**Step 2: Test the report**

Move the aggregation into a tested function. `results.json` holds, per model, the pass rate and interval per category, per context length and overall, plus every triplet's margin. A failed model appears under `missing`, never as zero.

**Step 3: Run it**

Add `"benchmark": "node scripts/run.mjs scripts/benchmark/run.ts"` to `package.json`, then run `npm run benchmark`.

Expected: `data/benchmark/results.json` is written and `ollama ps` is empty.

**Step 4: Write `paws.ts`**

Download the PAWS Wiki labelled set to `.benchmark-cache/paws/` and check its row count. For each Ollama model, embed in `withExclusiveModel`, keep only each pair's similarity, and compute ROC AUC. Save each pair's progress so a run can resume. Never write PAWS vectors to disk.

**Step 5: Run PAWS overnight**

This needs about 6 hours. Run it only when Alec says the laptop is free. Check free disk space first.

**Step 6: Commit**

```bash
git add scripts/benchmark data/benchmark package.json
git commit -m "Run semantic sensitivity benchmark"
```

**Step 7: Check the kill criteria and stop**

Confirmed means models differ clearly and consistently by category, and bag-of-words scores far below semantic models. Killed means all semantic models score about the same, or results change randomly between sets. Compare intervals, not just point rates.

**Stop and review the results with Alec before starting Phase 4.**

## Phase 4: page (outline, to detail after Task 12)

The findings should shape this page, so write these tasks after the review.

- **Task 13: Heatmap.** `/benchmark` renders models by category from `results.json`, sized for 390 px and 1280 px, in light and dark.
- **Task 14: Drill-down.** Clicking a cell shows the triplets passed and failed, with margins.
- **Task 15: Live route.** `src/app/api/benchmark/route.ts` scores three short texts on the `live` models. Use `scoreTriplet` from `src/util/benchmark/scoring.ts` and test limits, per-IP rate limiting and per-model failure.
- **Task 16: Quota.** Add a daily neuron cap if the account is on Workers Paid, and show a clear message when out of quota. Confirm the plan first.
- **Task 17: Live box.** Add the form, and say that live scores come from Workers AI.
- **Task 18: Docs.** Update `CLAUDE.md`, `README.md` and the idea status.
