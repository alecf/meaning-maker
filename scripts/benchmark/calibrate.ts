/**
 * Compares each model's vectors and verdicts between Workers AI and Ollama.
 * Needs `npx wrangler login` and a running Ollama. Vectors are cached, so a
 * rerun only pays for what's missing.
 *
 *   npm run benchmark:calibrate
 */
import { readFileSync, writeFileSync } from "node:fs";
import { getPlatformProxy } from "wrangler";
import { compareHosts, type HostComparison, type HostVectors } from "./calibration";
import { embedCached } from "./embedCached";
import { OLLAMA_MODELS, WORKERS_AI_MODELS } from "./models";
import {
  assertNotTruncated,
  createOllamaProvider,
  type OllamaModel,
  type OllamaProvider,
  withExclusiveModel,
} from "./ollama";
import { parseTriplets } from "./validate";
import { openVectorCache, type VectorCache } from "./vectorCache";
import { createWorkersAiProvider, type WorkersAiModel } from "./workersAi";

const TRIPLETS_FILE = "data/benchmark/calibration-triplets.jsonl";
const RESULTS_FILE = "data/benchmark/calibration.json";
const CACHE_DIR = ".benchmark-cache/vectors";

interface Pair {
  ollama: OllamaModel;
  workersAi: WorkersAiModel;
}

interface Row extends Partial<HostComparison> {
  model: string;
  workersAiId?: string;
  ollamaId?: string;
  error?: string;
}

function pair(ollamaName: string, workersName: string, pooling?: "cls"): Pair {
  const ollama = OLLAMA_MODELS.find((m) => m.name === ollamaName);
  const workersAi = WORKERS_AI_MODELS.find(
    (m) => m.name === workersName && m.pooling === pooling,
  );
  if (!ollama || !workersAi) throw new Error(`${ollamaName} isn't registered`);
  return { ollama, workersAi };
}

const PAIRS: Pair[] = [
  pair("bge-large", "@cf/baai/bge-large-en-v1.5", "cls"),
  pair("bge-m3", "@cf/baai/bge-m3"),
  pair("qwen3-embedding:0.6b", "@cf/qwen/qwen3-embedding-0.6b"),
  pair("embeddinggemma", "@cf/google/embeddinggemma-300m"),
];

const errorMessage = (error: unknown): string =>
  error instanceof Error ? error.message : String(error);

async function ollamaVectors(
  provider: OllamaProvider,
  cache: VectorCache,
  texts: string[],
): Promise<HostVectors> {
  return withExclusiveModel(provider, async () => {
    const pending = texts.filter((text) => !cache.get(text));
    if (pending.length > 0) await assertNotTruncated(provider.model, pending);
    return embedCached(provider, cache, texts);
  });
}

const triplets = parseTriplets(readFileSync(TRIPLETS_FILE, "utf8"));
const texts = triplets.flatMap((t) => [t.anchor, t.paraphrase, t.edit]);

const { env, dispose } = await getPlatformProxy<CloudflareEnv>();
const rows: Row[] = PAIRS.map(({ ollama }) => ({ model: ollama.name }));
const workersVectors = new Map<string, HostVectors>();

try {
  for (const [i, { ollama, workersAi }] of PAIRS.entries()) {
    console.log(`Workers AI: ${workersAi.name}`);
    try {
      const provider = createWorkersAiProvider(env.AI, workersAi);
      rows[i].workersAiId = provider.id;
      const cache = openVectorCache(CACHE_DIR, provider.id);
      workersVectors.set(ollama.name, await embedCached(provider, cache, texts));
    } catch (error) {
      rows[i].error = `Workers AI: ${errorMessage(error)}`;
    }
  }
} finally {
  await dispose();
}

for (const [i, { ollama }] of PAIRS.entries()) {
  const workers = workersVectors.get(ollama.name);
  if (!workers) continue;
  console.log(`Ollama: ${ollama.name}`);
  try {
    const provider = await createOllamaProvider(ollama);
    rows[i].ollamaId = provider.id;
    const cache = openVectorCache(CACHE_DIR, provider.id);
    const local = await ollamaVectors(provider, cache, texts);
    Object.assign(rows[i], compareHosts(triplets, workers, local));
  } catch (error) {
    rows[i].error = `Ollama: ${errorMessage(error)}`;
  }
}

writeFileSync(RESULTS_FILE, `${JSON.stringify(rows, null, 2)}\n`);
console.log(`Wrote ${RESULTS_FILE}`);
if (rows.some((row) => row.error)) process.exitCode = 1;
