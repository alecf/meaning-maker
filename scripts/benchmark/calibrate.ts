/**
 * Compares each model's vectors and verdicts between Workers AI and Ollama.
 * Needs `npx wrangler login` and a running Ollama. Vectors are cached, so a
 * rerun only pays for what's missing.
 *
 *   npm run benchmark:calibrate
 *   npm run benchmark:calibrate:context   (approved triplets, 8 sentences of filler)
 */
import { readFileSync, writeFileSync } from "node:fs";
import { getPlatformProxy } from "wrangler";
import { compareHosts, type HostComparison, type HostVectors } from "./calibration";
import { withContext } from "./context";
import { embedCached } from "./embedCached";
import { SHARED_MODELS } from "./models";
import {
  assertNotTruncated,
  createOllamaProvider,
  type OllamaProvider,
  withExclusiveModel,
} from "./ollama";
import { parseTriplets, readApprovedTriplets } from "./validate";
import { openVectorCache, type VectorCache } from "./vectorCache";
import { createWorkersAiProvider } from "./workersAi";

const onContext = process.argv[3] === "context";
const TRIPLETS_FILE = "data/benchmark/calibration-triplets.jsonl";
const FILLER_FILE = "data/benchmark/context-sentences.json";
const RESULTS_FILE = onContext
  ? "data/benchmark/calibration-context.json"
  : "data/benchmark/calibration.json";
const CACHE_DIR = ".benchmark-cache/vectors";

interface Row extends Partial<HostComparison> {
  model: string;
  workersAiId?: string;
  ollamaId?: string;
  error?: string;
}

const filler = (): string[] => JSON.parse(readFileSync(FILLER_FILE, "utf8"));

const errorMessage = (error: unknown): string =>
  error instanceof Error ? error.message : String(error);

async function ollamaVectors(
  provider: OllamaProvider,
  cache: VectorCache,
  texts: string[],
): Promise<HostVectors> {
  return withExclusiveModel(provider, async () => {
    const pending = texts.filter((text) => !cache.get(text));
    if (pending.length > 0) await assertNotTruncated(provider, pending);
    return embedCached(provider, cache, texts);
  });
}

const triplets = onContext
  ? readApprovedTriplets().map((t) => withContext(t, filler(), 8))
  : parseTriplets(readFileSync(TRIPLETS_FILE, "utf8"));
const texts = triplets.flatMap((t) => [t.anchor, t.paraphrase, t.edit]);

const { env, dispose } = await getPlatformProxy<CloudflareEnv>();
const rows: Row[] = SHARED_MODELS.map(({ ollama }) => ({ model: ollama.name }));
const workersVectors = new Map<string, HostVectors>();

try {
  for (const [i, { ollama, workersAi }] of SHARED_MODELS.entries()) {
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

for (const [i, { ollama }] of SHARED_MODELS.entries()) {
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
