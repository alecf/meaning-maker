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

const sleep = (ms: number): Promise<void> =>
  new Promise((resolve) => setTimeout(resolve, ms));

/** `/api/ps` always names a tag, but the registry may leave off `:latest`. */
const withTag = (name: string): string =>
  name.includes(":") ? name : `${name}:latest`;

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

/** Ollama's documented unload. `/api/embed` without the run's options may reload it. */
async function unload(
  model: string,
  timeoutMs: number,
  pollMs: number,
): Promise<void> {
  await post("/api/generate", { model, keep_alive: 0 });
  const deadline = Date.now() + timeoutMs;
  while ((await loadedModels()).includes(withTag(model))) {
    if (Date.now() >= deadline) throw new Error(`Still loaded: ${model}`);
    await sleep(pollMs);
  }
}

export interface ExclusiveOptions {
  timeoutMs?: number;
  pollMs?: number;
  unloadTimeoutMs?: number;
}

/** The model this process holds. Embedding is refused for any other. */
let activeModel: string | undefined;

/**
 * The only way to use a model. Waits for Ollama to be idle, so it never forces
 * a swap, and unloads its own model afterwards. Never unloads anything else.
 */
export async function withExclusiveModel<T>(
  model: string,
  run: () => Promise<T>,
  {
    timeoutMs = 600_000,
    pollMs = POLL_MS,
    unloadTimeoutMs = 30_000,
  }: ExclusiveOptions = {},
): Promise<T> {
  if (activeModel) throw new Error(`Already using ${activeModel}`);
  activeModel = model;
  try {
    await waitForIdle(timeoutMs, pollMs);
    try {
      return await run();
    } finally {
      await unload(model, unloadTimeoutMs, pollMs);
    }
  } finally {
    activeModel = undefined;
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
  model: OllamaModel,
  input: string[],
): Promise<EmbedResponse> {
  if (activeModel !== model.name) {
    throw new Error(`Use ${model.name} inside withExclusiveModel`);
  }
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
