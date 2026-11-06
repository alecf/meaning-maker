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
