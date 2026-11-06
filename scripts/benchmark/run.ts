/**
 * Scores every approved triplet at every context length, one model at a time.
 * Vectors are cached, so a rerun only pays for what's missing. A model that
 * fails goes under `missing`, never in as a score of zero.
 *
 *   npm run benchmark
 */
import { readFileSync, writeFileSync } from "node:fs";
import { loadEnvFile } from "node:process";
import { getPlatformProxy } from "wrangler";
import { createBagOfWordsProvider } from "@/util/benchmark/bagOfWords";
import { scoreTriplet } from "@/util/benchmark/scoring";
import type { EmbeddingProvider, Triplet, TripletScore } from "@/util/benchmark/types";
import { atAllContexts } from "./context";
import { embedCached } from "./embedCached";
import {
  type Availability,
  OLLAMA_MODELS,
  OPENROUTER_MODELS,
  SHARED_MODELS,
  WORKERS_AI_MODELS,
} from "./models";
import {
  assertNotTruncated,
  createOllamaProvider,
  type OllamaModel,
  withExclusiveModel,
} from "./ollama";
import { createOpenRouterProvider, openRouterKey } from "./openRouter";
import { compareRuns, type RunComparison, type Summary, summarize } from "./report";
import { readApprovedTriplets } from "./validate";
import { openVectorCache } from "./vectorCache";
import { createWorkersAiProvider } from "./workersAi";

const RESULTS_FILE = "data/benchmark/results.json";
const FILLER_FILE = "data/benchmark/context-sentences.json";
const KEY_FILE = ".env.benchmark.local";
const CACHE_DIR = ".benchmark-cache/vectors";
/** Identical requests to this model sometimes return different vectors. */
const RETESTED_MODELS = ["mongodb/voyage-4-large"];

type Vectors = Map<string, number[]>;

interface ModelRow extends Summary {
  model: string;
  host: string;
  availability: Availability;
  providerId: string;
  retest?: RunComparison;
}

interface MissingRow {
  model: string;
  host: string;
  error: string;
}

const errorMessage = (error: unknown): string =>
  error instanceof Error ? error.message : String(error);

const textsOf = (triplets: Triplet[]): string[] =>
  triplets.flatMap((t) => [t.anchor, t.paraphrase, t.edit]);

function scoreAll(triplets: Triplet[], vectors: Vectors): TripletScore[] {
  return triplets.map(({ id, anchor, paraphrase, edit }) =>
    scoreTriplet(
      id,
      vectors.get(anchor) as number[],
      vectors.get(paraphrase) as number[],
      vectors.get(edit) as number[],
    ),
  );
}

const embed = (provider: EmbeddingProvider, texts: string[], cacheId = provider.id) =>
  embedCached(provider, openVectorCache(CACHE_DIR, cacheId), texts);

/** Bag-of-words vectors only compare within a batch, so each triplet gets one. */
async function scoreBatchScoped(
  provider: EmbeddingProvider,
  triplets: Triplet[],
): Promise<TripletScore[]> {
  const scores: TripletScore[] = [];
  for (const { id, anchor, paraphrase, edit } of triplets) {
    const [a, p, e] = await provider.embedBatch([anchor, paraphrase, edit]);
    scores.push(scoreTriplet(id, a, p, e));
  }
  return scores;
}

async function embedWithOllama(model: OllamaModel, texts: string[]) {
  const provider = await createOllamaProvider(model);
  const cache = openVectorCache(CACHE_DIR, provider.id);
  const vectors = await withExclusiveModel(provider, async () => {
    const pending = texts.filter((text) => !cache.get(text));
    if (pending.length > 0) await assertNotTruncated(provider, pending);
    return embedCached(provider, cache, texts);
  });
  return { providerId: provider.id, vectors };
}

const triplets = atAllContexts(
  readApprovedTriplets(),
  JSON.parse(readFileSync(FILLER_FILE, "utf8")),
);
const texts = textsOf(triplets);
const models: ModelRow[] = [];
const missing: MissingRow[] = [];

async function attempt(
  model: string,
  host: string,
  availability: Availability,
  run: () => Promise<{ providerId: string; scores: TripletScore[]; retest?: RunComparison }>,
): Promise<void> {
  console.log(`${host}: ${model}`);
  try {
    const { providerId, scores, retest } = await run();
    const summary = summarize(triplets, scores);
    models.push({ model, host, availability, providerId, ...summary, retest });
    console.log(`  ${(summary.overall.rate * 100).toFixed(1)}% on bare sentences`);
  } catch (error) {
    missing.push({ model, host, error: errorMessage(error) });
    console.log(`  missing: ${errorMessage(error)}`);
  }
}

const bagOfWords = createBagOfWordsProvider();
await attempt("bag-of-words", "local", "batch-only", async () => ({
  providerId: bagOfWords.id,
  scores: await scoreBatchScoped(bagOfWords, triplets),
}));

// Ollama can't do mean pooling, so this is the one model only Workers AI runs.
const meanPooled = WORKERS_AI_MODELS.find((m) => m.pooling === "mean");
if (!meanPooled) throw new Error("bge-large with mean pooling isn't registered");
const { env, dispose } = await getPlatformProxy<CloudflareEnv>();
try {
  await attempt("bge-large (mean)", "workers-ai", meanPooled.availability, async () => {
    const provider = createWorkersAiProvider(env.AI, meanPooled);
    return { providerId: provider.id, scores: scoreAll(triplets, await embed(provider, texts)) };
  });
} finally {
  await dispose();
}

for (const model of OLLAMA_MODELS) {
  // Calibration gave each shared model one row, so the live box reports it too.
  const pair = SHARED_MODELS.find((shared) => shared.ollama.name === model.name);
  await attempt(model.name, "ollama", pair?.workersAi.availability ?? model.availability, async () => {
    const { providerId, vectors } = await embedWithOllama(model, texts);
    return { providerId, scores: scoreAll(triplets, vectors) };
  });
}

for (const model of OPENROUTER_MODELS) {
  await attempt(model.name, "openrouter", model.availability, async () => {
    loadEnvFile(KEY_FILE);
    const provider = createOpenRouterProvider(openRouterKey(process.env), model);
    const scores = scoreAll(triplets, await embed(provider, texts));
    if (!RETESTED_MODELS.includes(model.name)) return { providerId: provider.id, scores };
    const again = await embed(provider, texts, `${provider.id}#retest`);
    return {
      providerId: provider.id,
      scores,
      retest: compareRuns(scores, scoreAll(triplets, again)),
    };
  });
}

writeFileSync(RESULTS_FILE, `${JSON.stringify({ models, missing }, null, 2)}\n`);
console.log(`Wrote ${RESULTS_FILE}: ${models.length} models, ${missing.length} missing`);
if (missing.length > 0) process.exitCode = 1;
