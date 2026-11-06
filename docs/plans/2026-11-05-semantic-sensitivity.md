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
- Won't fix, by decision on 2026-11-05: cache checksums (only matter with real file corruption), choosing the longest texts by characters rather than tokens, and the remaining rare currency forms in bag-of-words.

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
  /** Shared by every context length of one base triplet. Never pool it in one interval. */
  baseId: string;
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
  /** paraphraseSimilarity - editSimilarity. A pass must beat TIE_TOLERANCE. */
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
  /**
   * Vectors are only comparable within one embedBatch call, so callers must
   * not cache them or split a triplet across batches.
   */
  readonly batchScoped?: boolean;
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
import { scoreTriplet, TIE_TOLERANCE } from "./scoring";

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
  it("reports cosine similarity to the anchor", () => {
    const score = scoreTriplet("t", [1, 2], [2, 4], [-2, 1]);
    expect(score.paraphraseSimilarity).toBeCloseTo(1);
    expect(score.editSimilarity).toBeCloseTo(0);
  });
  it("counts a margin within the tolerance as a tie", () => {
    const score = scoreTriplet("t", [1, 0], [1, 0], [1, 0.0005]);
    expect(score.margin).toBeGreaterThan(0);
    expect(score.margin).toBeLessThan(TIE_TOLERANCE);
    expect(score.passed).toBe(false);
  });
  it("passes a margin just beyond the tolerance", () => {
    const score = scoreTriplet("t", [1, 0], [1, 0], [1, 0.002]);
    expect(score.margin).toBeGreaterThan(TIE_TOLERANCE);
    expect(score.passed).toBe(true);
  });

  it.each<[string, number[], number[], number[]]>([
    ["a zero edit vector", [1, 0], [1, 0], [0, 0]],
    ["a zero anchor vector", [0, 0], [1, 0], [0, 1]],
    ["a vector whose norm underflows to zero", [1, 0], [1e-200, 0], [0, 1]],
    ["a norm too small to multiply", [1e-85, 0], [1, 0], [1e-85, 0]],
    ["a longer paraphrase", [1, 0], [1, 0, 9, 9, 9], [0.9, 0.1]],
    ["a shorter edit", [1, 0, 1], [1, 0, 1], [1, 0]],
    ["empty vectors", [], [], []],
    ["NaN", [1, 0], [Number.NaN, 0], [0, 1]],
    ["Infinity", [1, 0], [1, 0], [Number.POSITIVE_INFINITY, 1]],
    ["a similarity that overflows", [1e200, 1e200], [1e200, 1e200], [0, 1]],
  ])("rejects %s", (_name, anchor, paraphrase, edit) => {
    expect(() => scoreTriplet("t", anchor, paraphrase, edit)).toThrow(/Triplet t/);
  });
});
```

**Step 2: Run it to confirm it fails**

Run: `npx vitest run src/util/benchmark/scoring.test.ts`
Expected: FAIL, cannot find `./scoring`.

**Step 3: Implement**

Reuse `cosine_similarity` from `src/util/util.ts`, which has no imports of its own. It uses the shorter vector's length and returns 0 for a zero vector, so `scoreTriplet` validates first.

```ts
import { cosine_similarity } from "../util";
import type { TripletScore } from "./types";

/** Vectors are cached as Float32, so smaller margins are rounding, not signal. */
export const TIE_TOLERANCE = 1e-6;

/** Below this, multiplying two squared norms can underflow to zero. */
const MIN_SQUARED_NORM = 1e-150;

function assertScorable(id: string, vectors: number[][]): void {
  const length = vectors[0].length;
  for (const vector of vectors) {
    if (vector.length === 0 || vector.length !== length) {
      throw new Error(`Triplet ${id}: vectors must share a non-zero length`);
    }
    if (!vector.every(Number.isFinite)) {
      throw new Error(`Triplet ${id}: vector has a non-finite element`);
    }
    if (vector.reduce((sum, x) => sum + x * x, 0) < MIN_SQUARED_NORM) {
      throw new Error(`Triplet ${id}: vector norm is too small`);
    }
  }
}

function similarity(id: string, a: number[], b: number[]): number {
  const value = cosine_similarity(a, b);
  if (!Number.isFinite(value)) {
    throw new Error(`Triplet ${id}: similarity is not finite`);
  }
  return value;
}

/** Throws on vectors it can't score, so a bad model is missing, not failed. */
export function scoreTriplet(
  id: string,
  anchor: number[],
  paraphrase: number[],
  edit: number[],
): TripletScore {
  assertScorable(id, [anchor, paraphrase, edit]);
  const paraphraseSimilarity = similarity(id, anchor, paraphrase);
  const editSimilarity = similarity(id, anchor, edit);
  const margin = paraphraseSimilarity - editSimilarity;
  return {
    id,
    paraphraseSimilarity,
    editSimilarity,
    margin,
    passed: margin > TIE_TOLERANCE,
  };
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
  it("gives the Wilson interval for a mixed result", () => {
    const { low, high } = passRate(scores(60, 100));
    expect(low).toBeCloseTo(0.502, 3);
    expect(high).toBeCloseTo(0.691, 3);
  });
  it("keeps a real interval when every triplet passes", () => {
    const { rate, low, high } = passRate(scores(15, 15));
    expect(rate).toBe(1);
    expect(low).toBeCloseTo(0.796, 3);
    expect(high).toBe(1);
  });
  it("keeps a real interval when every triplet fails", () => {
    const { rate, low, high } = passRate(scores(0, 15));
    expect(rate).toBe(0);
    expect(low).toBe(0);
    expect(high).toBeCloseTo(0.204, 3);
  });
  it("rejects an empty list", () => {
    expect(() => passRate([])).toThrow(/at least one/);
  });
});
```

**Step 2: Run it to confirm it fails**

Run: `npx vitest run src/util/benchmark/scoring.test.ts`
Expected: FAIL, `passRate` is not exported.

**Step 3: Implement**

```ts
const Z_95 = 1.959964;

/**
 * Pass rate with a 95% Wilson score interval. Results that repeat a base
 * triplet aren't independent, so never pool the same baseId in one call.
 */
export function passRate(passed: boolean[]): Interval {
  if (passed.length === 0) throw new Error("passRate needs at least one result");
  const n = passed.length;
  const hits = passed.filter(Boolean).length;
  const rate = hits / n;
  const z2 = Z_95 * Z_95;
  const denominator = 1 + z2 / n;
  const center = (rate + z2 / (2 * n)) / denominator;
  const halfWidth =
    (Z_95 * Math.sqrt((rate * (1 - rate)) / n + z2 / (4 * n * n))) / denominator;
  return {
    rate,
    low: hits === 0 ? 0 : center - halfWidth,
    high: hits === n ? 1 : center + halfWidth,
  };
}
```

Merge both imports with the existing ones from Task 2. Use a Wilson score interval, not a bootstrap: a bootstrap collapses to zero width at 0/15 and 15/15.

**Step 4: Run it to confirm it passes**

Run: `npx vitest run src/util/benchmark/scoring.test.ts`
Expected: PASS.

**Step 5: Commit**

```bash
git add src/util/benchmark/scoring.ts src/util/benchmark/scoring.test.ts
git commit -m "Add Wilson pass rates"
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
  it("fails an exact tie between the paraphrase and the edit", async () => {
    const [a, p, e] = await createBagOfWordsProvider().embedBatch([
      "Every tall nurse quietly helped young patients yesterday.",
      "One nurse helped those patients during her morning shift.",
      "The tall nurse ignored the young patients at the door.",
    ]);
    expect(scoreTriplet("t", a, p, e).passed).toBe(false);
  });
  it("is marked as batch-scoped", () => {
    expect(createBagOfWordsProvider().batchScoped).toBe(true);
  });
  it("gives vectors of the same length within a batch", async () => {
    const [a, b] = await createBagOfWordsProvider().embedBatch(["one two", "three"]);
    expect(a.length).toBe(b.length);
  });

  const vectorsOf = (...texts: string[]): Promise<number[][]> =>
    createBagOfWordsProvider().embedBatch(texts);

  it("treats curly and straight apostrophes the same", async () => {
    const [curly, straight] = await vectorsOf(
      "Tom\u2019s dog bit Sam\u2019s cat.",
      "Tom's dog bit Sam's cat.",
    );
    expect(curly).toEqual(straight);
  });
  it("normalizes composed and decomposed letters", async () => {
    const [composed, decomposed] = await vectorsOf("caf\u00e9", "cafe\u0301");
    expect(composed).toEqual(decomposed);
  });
  it("ignores quoting apostrophes around a word", async () => {
    const [quoted, bare] = await vectorsOf("'dog'", "dog");
    expect(quoted).toEqual(bare);
  });
  it("drops a stray apostrophe", async () => {
    const [stray, bare] = await vectorsOf("dog ' cat", "dog cat");
    expect(stray).toEqual(bare);
  });
  it.each([
    ["decimals", "3.5", "5.3"],
    ["signs", "-5", "5"],
    ["currencies", "$5", "\u20ac5"],
  ])("keeps %s in numbers apart", async (_name, first, second) => {
    const [a, b] = await vectorsOf(first, second);
    expect(a).not.toEqual(b);
  });
  it("reads a hyphen between numbers as a range, not a sign", async () => {
    const [a, p, e] = await vectorsOf(
      "Prices rose 10-20 percent.",
      "Prices rose 10 to 20 percent.",
      "Prices rose 10-30 percent.",
    );
    expect(scoreTriplet("t", a, p, e).passed).toBe(true);
  });
  it.each([
    ["an en dash", "10-20", "10\u201320"],
    ["a minus sign in a range", "10-20", "10\u221220"],
    ["separate numbers", "10-20", "10 20"],
    ["a hyphen after a word", "COVID-19", "covid 19"],
    ["a true minus sign", "-5", "\u22125"],
  ])("tokenizes %s the same way", async (_name, first, second) => {
    const [a, b] = await vectorsOf(first, second);
    expect(a).toEqual(b);
  });
  it("keeps a leading decimal", async () => {
    const [a, b] = await vectorsOf(".5", "5");
    expect(a).not.toEqual(b);
  });
  it("doesn't read a sentence break as a leading decimal", async () => {
    const [a, b] = await vectorsOf("Room.5", "Room 5");
    expect(a).toEqual(b);
  });
  it("leaves sentence punctuation off a number", async () => {
    const [ending, bare] = await vectorsOf("It cost 5.", "It cost 5");
    expect(ending).toEqual(bare);
  });
});
```

**Step 2: Run it to confirm it fails**

Run: `npx vitest run src/util/benchmark/bagOfWords.test.ts`
Expected: FAIL, cannot find `./bagOfWords`.

**Step 3: Implement**

```ts
import type { EmbeddingProvider } from "./types";

/**
 * Keeps numbers whole, with sign, currency and decimals, so edits to them show.
 * A hyphen or dot after a letter or digit is punctuation, not part of the number.
 */
const TOKEN =
  /(?:[$€£]|(?<![\p{L}\p{N}])-)?(?:\d+(?:[.,]\d+)*|(?<![\p{L}\p{N}])\.\d+)|[\p{L}\p{N}']+/gu;

const normalize = (text: string): string =>
  text
    .normalize("NFC")
    .replaceAll("’", "'")
    .replaceAll("−", "-")
    .toLowerCase();

const words = (text: string): string[] =>
  (normalize(text).match(TOKEN) ?? [])
    .map((token) => token.replace(/^'+|'+$/g, ""))
    .filter((token) => token !== "");

/** Word counts over the batch's vocabulary, so triplets must share a batch. */
export function createBagOfWordsProvider(): EmbeddingProvider {
  return {
    id: "bag-of-words",
    batchScoped: true,
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

The runner must skip the on-disk cache for any `batchScoped` provider, since vectors depend on the batch.

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
- An entry whose vector length differs from the first entry's is skipped, even if its base64 decodes to a multiple of 4 bytes.
- A line cut exactly 64 characters short, followed by a `put`, doesn't produce a garbage vector, and the later entry survives. This reproduces a real bug: the next key used to land on the partial line and complete it.
- A partial first line can't set the expected vector length.
- A partial line is dropped on open, even if nothing is written.
- `put` throws on a non-finite, all-zero or empty vector, checked after converting to Float32, and stores nothing.
- Lines are skipped unless they have exactly 2 tab-separated parts, a 64-character hex key, a base64 length divisible by 4 and a byte count divisible by 4.

**Step 3: Run it to confirm it fails**

Run: `npx vitest run scripts/benchmark/vectorCache.test.ts`
Expected: FAIL, cannot find `./vectorCache`.

**Step 4: Implement**

```ts
import { createHash } from "node:crypto";
import {
  appendFileSync,
  existsSync,
  mkdirSync,
  readFileSync,
  truncateSync,
} from "node:fs";
import { join } from "node:path";

export interface VectorCache {
  get(text: string): number[] | undefined;
  put(text: string, vector: number[]): void;
}

interface Entry {
  key: string;
  value: string;
  bytes: number;
}

const HEX_KEY = /^[0-9a-f]{64}$/;

const hash = (value: string): string =>
  createHash("sha256").update(value).digest("hex");

function parseLine(line: string): Entry | undefined {
  const parts = line.split("\t");
  if (parts.length !== 2) return undefined;
  const [key, value] = parts;
  if (!HEX_KEY.test(key) || !value || value.length % 4 !== 0) return undefined;
  const bytes = Buffer.from(value, "base64").length;
  return bytes > 0 && bytes % 4 === 0 ? { key, value, bytes } : undefined;
}

/** Cuts a line left by a killed run, so the next append starts a fresh one. */
function completeLines(file: string): string[] {
  const content = readFileSync(file, "utf8");
  const end = content.lastIndexOf("\n") + 1;
  if (end < content.length) truncateSync(file, end);
  return content.slice(0, end).split("\n");
}

function loadEntries(file: string): Map<string, string> {
  const entries = new Map<string, string>();
  let vectorBytes: number | undefined;
  for (const line of completeLines(file)) {
    const entry = parseLine(line);
    if (!entry) continue;
    vectorBytes ??= entry.bytes;
    if (entry.bytes === vectorBytes) entries.set(entry.key, entry.value);
  }
  return entries;
}

/** One append-only file per provider: `<text hash> <base64 Float32 vector>`. */
export function openVectorCache(dir: string, providerId: string): VectorCache {
  mkdirSync(dir, { recursive: true });
  const file = join(dir, `${hash(providerId).slice(0, 16)}.tsv`);
  const entries = existsSync(file) ? loadEntries(file) : new Map<string, string>();
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
      const floats = new Float32Array(vector);
      if (!floats.every(Number.isFinite) || floats.every((x) => x === 0)) {
        throw new Error(`Won't cache a bad vector for: ${text.slice(0, 80)}`);
      }
      const key = hash(text);
      const value = Buffer.from(floats.buffer).toString("base64");
      entries.set(key, value);
      appendFileSync(file, `${key}\t${value}\n`);
    },
  };
}
```

A half-written line can decode to a whole number of floats, so the check against the first entry's length is required. Opening the cache truncates any partial last line rather than closing it with a newline. Once terminated, a partial first line would set the expected length, and every later entry would be skipped.

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

Stub `globalThis.fetch` with `vi.fn()` and a small fake of `/api/ps`, `/api/tags`, `/api/embed` and `/api/generate`. Use a throwaway `lockFile`. Test that `withExclusiveModel`:

- Runs the callback when `/api/ps` is empty, then posts `keep_alive: 0` for that model if the session embedded.
- Unloads nothing if the session sent no embed request, so a fully cached rerun touches nothing.
- Waits while another model is loaded and never posts an unload for that other model.
- Throws after its timeout if the other model never leaves.
- Still unloads when the callback throws.
- Rethrows the callback's error if the unload fails too.
- Returns the result and warns if the unload fails, or if the model is still loaded afterwards, and gives the unload time to finish.
- Refuses a second model while one is in use, and recovers after a failure.

Test the lockfile:

- It's created with the `wx` flag, holds the pid, and is removed afterwards, including after a failure.
- A lock held by a live process throws. A lock with a dead pid, or no pid, is replaced.

Test swap protection:

- `/api/ps` is checked before each embed request, and a different model throws before the request is sent.
- Our own model being loaded is fine.

Test that `createOllamaProvider`:

- Refuses to embed outside `withExclusiveModel`, or in a session with other options, as does `assertNotTruncated`.
- Throws on overlapping `embedBatch` calls.
- Adds the task prefix to each text.
- Sends one request at a time, in batches of `batchSize`.
- Sends `truncate: false`.
- Throws if a response has the wrong number of vectors.
- Has an id that changes with the digest from `/api/tags`, prefix and options, but not with `batchSize` or `maxTokens`.
- Throws if `/api/tags` doesn't list the model.

Test that `assertNotTruncated` throws when a text's `prompt_eval_count` reaches `maxTokens`, passes below it, and throws unless the count is a positive number.

**Step 2: Run it to confirm it fails**

Run: `npx vitest run scripts/benchmark/ollama.test.ts`
Expected: FAIL, cannot find `./ollama`.

**Step 3: Implement**

```ts
import { mkdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { dirname } from "node:path";
import type { EmbeddingProvider } from "@/util/benchmark/types";
import { stableStringify } from "@/util/embedding";

const BASE = "http://localhost:11434";
const POLL_MS = 5_000;
const LOCK_FILE = ".benchmark-cache/ollama.lock";

async function readJson<T>(path: string, response: Response): Promise<T> {
  if (!response.ok) {
    throw new Error(`Ollama ${path}: ${response.status} ${await response.text()}`);
  }
  return response.json() as Promise<T>;
}

async function get<T>(path: string): Promise<T> {
  return readJson(path, await fetch(`${BASE}${path}`));
}

async function post<T>(path: string, body: unknown): Promise<T> {
  const response = await fetch(`${BASE}${path}`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  return readJson(path, response);
}

async function loadedModels(): Promise<string[]> {
  const { models } = await get<{ models: { name: string }[] }>("/api/ps");
  return models.map((m) => m.name);
}

const sleep = (ms: number): Promise<void> =>
  new Promise((resolve) => setTimeout(resolve, ms));

/** `/api/ps` always names a tag, but the registry may leave off `:latest`. */
const withTag = (name: string): string =>
  name.includes(":") ? name : `${name}:latest`;

const errorMessage = (error: unknown): string =>
  error instanceof Error ? error.message : String(error);

function isRunning(pid: number): boolean {
  if (!Number.isInteger(pid) || pid <= 0) return false;
  try {
    process.kill(pid, 0);
    return true;
  } catch (error) {
    return (error as NodeJS.ErrnoException).code === "EPERM";
  }
}

const writeLock = (file: string): void =>
  writeFileSync(file, String(process.pid), { flag: "wx" });

function acquireLock(file: string): void {
  mkdirSync(dirname(file), { recursive: true });
  try {
    writeLock(file);
    return;
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code !== "EEXIST") throw error;
  }
  const holder = Number(readFileSync(file, "utf8"));
  if (isRunning(holder)) {
    throw new Error(`Ollama lock held by pid ${holder}: ${file}`);
  }
  rmSync(file, { force: true });
  writeLock(file);
}

async function waitForIdle(timeoutMs: number, pollMs: number): Promise<void> {
  const deadline = Date.now() + timeoutMs;
  for (;;) {
    const loaded = await loadedModels();
    if (loaded.length === 0) return;
    if (Date.now() >= deadline) {
      throw new Error(`Ollama still busy with ${loaded.join(", ")}`);
    }
    await sleep(pollMs);
  }
}

/**
 * Ollama's documented unload. `/api/embed` without the run's options may reload
 * it. Only warns on failure, so it can't hide how the run itself ended.
 */
async function unload(
  model: string,
  timeoutMs: number,
  pollMs: number,
): Promise<void> {
  try {
    await post("/api/generate", { model, keep_alive: 0 });
    const deadline = Date.now() + timeoutMs;
    while ((await loadedModels()).includes(withTag(model))) {
      if (Date.now() >= deadline) throw new Error("still loaded");
      await sleep(pollMs);
    }
  } catch (error) {
    console.warn(`Couldn't unload ${model}: ${errorMessage(error)}`);
  }
}

export interface ExclusiveOptions {
  timeoutMs?: number;
  pollMs?: number;
  unloadTimeoutMs?: number;
  lockFile?: string;
}

interface Session {
  model: OllamaModel;
  /** Set once an embed is sent. Without one, there's nothing of ours to unload. */
  embedded: boolean;
  busy: boolean;
}

let session: Session | undefined;

const sameModel = (a: OllamaModel, b: OllamaModel): boolean =>
  a.name === b.name &&
  stableStringify(a.options ?? {}) === stableStringify(b.options ?? {});

/**
 * The only way to use a model. The lockfile stops our own runs from colliding,
 * and `/api/ps` is checked before each request to detect outside clients. A
 * client that loads a model between that check and the request can still force
 * a swap, so this narrows that race rather than closing it. Unloads only a
 * model this session used, and never anything else.
 */
export async function withExclusiveModel<T>(
  model: OllamaModel,
  run: () => Promise<T>,
  {
    timeoutMs = 600_000,
    pollMs = POLL_MS,
    unloadTimeoutMs = 30_000,
    lockFile = LOCK_FILE,
  }: ExclusiveOptions = {},
): Promise<T> {
  if (session) throw new Error(`Already using ${session.model.name}`);
  acquireLock(lockFile);
  const own: Session = { model, embedded: false, busy: false };
  session = own;
  try {
    await waitForIdle(timeoutMs, pollMs);
    try {
      return await run();
    } finally {
      if (own.embedded) await unload(model.name, unloadTimeoutMs, pollMs);
    }
  } finally {
    session = undefined;
    rmSync(lockFile, { force: true });
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

async function embedOnce(
  own: Session,
  model: OllamaModel,
  input: string[],
): Promise<EmbedResponse> {
  const others = (await loadedModels()).filter(
    (name) => name !== withTag(model.name),
  );
  if (others.length > 0) {
    throw new Error(`${others.join(", ")} loaded while using ${model.name}`);
  }
  own.embedded = true;
  const response = await post<EmbedResponse>("/api/embed", {
    model: model.name,
    input: input.map((text) => model.prefix + text),
    keep_alive: "5m",
    truncate: false,
    options: model.options,
  });
  if (response.embeddings.length !== input.length) {
    throw new Error(
      `${model.name} gave ${response.embeddings.length} vectors for ${input.length} texts`,
    );
  }
  return response;
}

/** Holds the session's one slot, so calls can't overlap between requests. */
async function oneAtATime<T>(
  model: OllamaModel,
  work: (own: Session) => Promise<T>,
): Promise<T> {
  if (!session || !sameModel(session.model, model)) {
    throw new Error(`Use ${model.name} inside withExclusiveModel`);
  }
  const own = session;
  if (own.busy) throw new Error(`${model.name} already has a request in flight`);
  own.busy = true;
  try {
    return await work(own);
  } finally {
    own.busy = false;
  }
}

async function modelDigest(name: string): Promise<string> {
  const { models } = await get<{ models: { name: string; digest: string }[] }>(
    "/api/tags",
  );
  const found = models.find((m) => m.name === withTag(name));
  if (!found) throw new Error(`${name} isn't installed`);
  return found.digest;
}

export async function createOllamaProvider(
  model: OllamaModel,
): Promise<EmbeddingProvider> {
  const batchSize = model.batchSize ?? 64;
  const { name, prefix, options } = model;
  const digest = await modelDigest(name);
  return {
    id: stableStringify({ host: "ollama", name, prefix, options, digest }),
    embedBatch: (texts) =>
      oneAtATime(model, async (own) => {
        const vectors: number[][] = [];
        for (let i = 0; i < texts.length; i += batchSize) {
          const { embeddings } = await embedOnce(
            own,
            model,
            texts.slice(i, i + batchSize),
          );
          vectors.push(...embeddings);
        }
        return vectors;
      }),
  };
}

/**
 * `prompt_eval_count` is a batch total, so per-text checks need their own
 * requests. Checks the longest few texts, which is where truncation would hit.
 */
export function assertNotTruncated(
  model: OllamaModel,
  texts: string[],
): Promise<void> {
  const longest = [...texts].sort((a, b) => b.length - a.length).slice(0, 5);
  return oneAtATime(model, async (own) => {
    for (const text of longest) {
      const { prompt_eval_count: tokens } = await embedOnce(own, model, [text]);
      if (typeof tokens !== "number" || !(tokens > 0)) {
        throw new Error(`${model.name} gave prompt_eval_count ${tokens}`);
      }
      if (tokens >= model.maxTokens) {
        throw new Error(`${model.name} reached ${tokens} tokens on: ${text.slice(0, 80)}`);
      }
    }
  });
}
```

Ollama only reports a batch total, so `assertNotTruncated` checks the longest texts. `truncate: false` covers every request: Ollama returns a 400 for text over the limit. That was confirmed on qwen3 at `num_ctx: 2048`. It hasn't been tested on embeddinggemma-2, which uses the MLX runner.

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
- A response with the wrong number of vectors throws.
- The id changes with pooling and prefix, but not with `batchSize`.

**Step 2: Run it to confirm it fails**

Run: `npx vitest run scripts/benchmark/workersAi.test.ts`
Expected: FAIL, cannot find `./workersAi`.

**Step 3: Implement**

```ts
import type { EmbeddingProvider } from "@/util/benchmark/types";
import { stableStringify } from "@/util/embedding";

export interface WorkersAiModel {
  name: string;
  /** bge-large only. Its schema is the one that accepts `pooling`. */
  pooling?: "mean" | "cls";
  prefix?: string;
  /** Defaults to 32, qwen3's limit. bge-large, bge-m3 and embeddinggemma allow 100. */
  batchSize?: number;
}

export function createWorkersAiProvider(
  ai: Ai,
  model: WorkersAiModel,
): EmbeddingProvider {
  const batchSize = model.batchSize ?? 32;
  const prefix = model.prefix ?? "";
  return {
    id: stableStringify({
      host: "workers-ai",
      name: model.name,
      pooling: model.pooling,
      prefix,
    }),
    async embedBatch(texts) {
      const vectors: number[][] = [];
      for (let i = 0; i < texts.length; i += batchSize) {
        const text = texts.slice(i, i + batchSize).map((t) => prefix + t);
        const input = model.pooling ? { text, pooling: model.pooling } : { text };
        const result = (await ai.run(model.name as never, input as never)) as {
          data?: number[][];
        };
        if (!result.data) throw new Error(`${model.name}: no data in response`);
        if (result.data.length !== text.length) {
          throw new Error(
            `${model.name} gave ${result.data.length} vectors for ${text.length} texts`,
          );
        }
        vectors.push(...result.data);
      }
      return vectors;
    },
  };
}
```

`npx wrangler ai models schema <model>`, checked 2026-11-05, requires no per-model handling. All four accept `text` as an array and return `data`:

| Model | Batch limit | `pooling` | Notes |
|---|---|---|---|
| bge-large | 100 | Yes | Default `mean` |
| bge-m3 | 100 | No | `truncate_inputs` defaults to false |
| embeddinggemma | 100 | No | |
| qwen3 | 32 | No | `text` is an alias for `documents`. An `instruction` input exists, and calibration should show whether it applies to `text` |

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
- Test: `scripts/benchmark/models.test.ts`

**Step 1: Confirm the task prefixes**

Checked on 2026-11-05 against each model's own card:

| Model | Prefix | Source |
|---|---|---|
| all-minilm | None | [Card](https://huggingface.co/sentence-transformers/all-MiniLM-L6-v2) mentions none |
| bge-large | None | [Card](https://huggingface.co/BAAI/bge-large-en-v1.5): the instruction is only for retrieval queries |
| mxbai-embed-large | None | [Card](https://huggingface.co/mixedbread-ai/mxbai-embed-large-v1): the prompt is only for retrieval queries |
| bge-m3 | None | [Card](https://huggingface.co/BAAI/bge-m3): no instructions needed |
| embeddinggemma | `task: sentence similarity \| query: ` | [Card](https://huggingface.co/google/embeddinggemma-300m) |
| embeddinggemma-2 | `task: sentence similarity \| query: ` | [Card](https://huggingface.co/google/embeddinggemma-2) and its `config_sentence_transformers.json` |
| nomic-embed-text | `clustering: ` | [Card](https://huggingface.co/nomic-ai/nomic-embed-text-v1.5) requires a prefix but names none for comparing sentences. This is the closest documented match, since it covers removing semantic duplicates |
| qwen3-embedding:0.6b | None | [Card](https://huggingface.co/Qwen/Qwen3-Embedding-0.6B) covers queries and documents, not comparing two sentences, so all texts are treated as documents |

Use the same prefix on all three texts of a triplet, and use the same prefix on both hosts for calibration. The prefix is part of the provider id, so changing one misses the cache instead of reusing old vectors.

**Step 2: Write the registry**

List all Ollama models as `OllamaModel` entries, and these Workers AI entries as `WorkersAiModel`: bge-large with `mean`, bge-large with `cls`, bge-m3, qwen3 and embeddinggemma. Share each prefix constant between a model's entries on both hosts.

Every entry has `availability: "live" | "batch-only"`. The Workers AI entries for bge-large, bge-m3 and qwen3 are live. embeddinggemma stays batch-only until it's priced, and Ollama entries are always batch-only.

`maxTokens` is the lowest limit known for each, from `/api/show` or the request's own `num_ctx`:

| Model | `maxTokens` | Why |
|---|---|---|
| all-minilm | 256 | `num_ctx` |
| bge-large, mxbai-embed-large | 512 | `context_length` |
| nomic-embed-text, embeddinggemma | 2048 | `context_length` |
| qwen3-embedding:0.6b | 2048 | Our `num_ctx` |
| bge-m3, embeddinggemma-2 | 8192 | Model cards. Ollama's default `num_ctx` could be lower, and `truncate: false` covers that case |

Set `options: { num_ctx: 2048 }` on qwen3. Measured through `withExclusiveModel` on 2026-11-05: `/api/ps` showed 988 MB, down from 4.8 GB, with `context_length: 2048`.

**Step 3: Commit**

```bash
git add scripts/benchmark/models.ts scripts/benchmark/models.test.ts
git commit -m "Add benchmark model registry"
```

### Task 9: Calibrate Ollama against Workers AI

**Files:**
- Create: `scripts/benchmark/calibrate.ts`
- Create: `scripts/benchmark/calibration.ts`
- Create: `scripts/benchmark/embedCached.ts`
- Test: `scripts/benchmark/calibration.test.ts`
- Test: `scripts/benchmark/embedCached.test.ts`
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

Keep the comparison in `compareHosts` (`calibration.ts`), so it can be tested without either host. Embed through `embedCached` (`embedCached.ts`), which saves after each chunk and returns vectors through the cache. Task 12 reuses it. Skip `assertNotTruncated` when everything is cached, so a rerun sends Ollama nothing.

Add `"benchmark:calibrate": "node scripts/run.mjs scripts/benchmark/calibrate.ts"` to `package.json`.

**Step 3: Run it**

Run: `npm run benchmark:calibrate`
Expected: `data/benchmark/calibration.json` has one row per model and `ollama ps` is empty afterwards.

**Step 4: Review and commit**

If verdicts match on at least 95% of triplets, treat the model as interchangeable. Otherwise, it gets separate rows. Stop and report to Alec if bge-large doesn't match, since it's the app's model.

```bash
git add scripts/benchmark data/benchmark package.json
git commit -m "Calibrate Ollama against Workers AI"
```

**Result, 2026-11-05:** every model matched on all 102 triplets, so each is interchangeable and needs one row. This covers bge-large with `cls` only; the app's `mean` pooling wasn't calibrated.

| Model | Mean cross-host cosine | Verdict match | Worst margin difference | Pass rate on both hosts |
|---|---|---|---|---|
| bge-large (`cls`) | 0.999992 | 100% | 0.00124 | 76.5% |
| bge-m3 | 0.999994 | 100% | 0.00107 | 67.6% |
| qwen3-embedding:0.6b | 0.999689 | 100% | 0.00566 | 50.0% |
| embeddinggemma | 0.999994 | 100% | 0.00073 | 76.5% |

The cosines also suggest Workers AI adds no prompt of its own: not to qwen3's `text` input, and not to embeddinggemma.

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
- Any field is empty, including `baseId`, or the id is duplicated.
- A text produces no bag-of-words tokens. `scoreTriplet` would throw on its zero vector and put bag-of-words under `missing`.
- Rows that share a `baseId` differ in category or anchor, or repeat a `contextSentences` value.

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

Load approved triplets, expand them with context under the same `baseId`, and run each model in turn. Check the cache first, and only embed what's missing. Ollama models run inside `withExclusiveModel`. Call `embedBatch` in chunks and `put` after each chunk through `embedCached`, so progress survives a failure. A provider failure or a `scoreTriplet` throw puts that model under `missing` with its error, and the run continues. Skip the cache for `batchScoped` providers such as bag-of-words, and embed and score each triplet in its own batch.

**Step 2: Test the report**

Move the aggregation into a tested function. Intervals assume independent results, so never pool the same `baseId` in one interval. The report computes intervals per `contextSentences` value, and headline and category numbers use bare sentences (`contextSentences: 0`). The aggregator must throw on a duplicate `baseId` within a group; test that.

`results.json` holds, per model, the bare-sentence pass rate and interval overall and per category, the pass rate and interval for each other context length, and every triplet's margin. A failed model appears under `missing`, never as zero.

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
