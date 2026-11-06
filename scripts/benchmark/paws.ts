/**
 * Scores the PAWS Wiki labelled pairs on each Ollama model, one at a time, as
 * an outside check on our triplets. Keeps pair similarities only, and resumes
 * from them. Results are written after each model.
 *
 *   npm run benchmark:paws -- prepare   (download and check the pairs)
 *   npm run benchmark:paws -- sample    (time a few pairs, write no results)
 *   npm run benchmark:paws
 */
import { existsSync, mkdirSync, readFileSync, renameSync, writeFileSync } from "node:fs";
import { OLLAMA_MODELS } from "./models";
import {
  assertNotTruncated,
  createOllamaProvider,
  withExclusiveModel,
} from "./ollama";
import {
  openSimilarityLog,
  type PawsPair,
  pairSimilarities,
  rocAuc,
} from "./pawsLib";

const DIR = ".benchmark-cache/paws";
const PAIRS_FILE = `${DIR}/pairs.jsonl`;
const LOG_DIR = `${DIR}/similarities`;
const RESULTS_FILE = "data/benchmark/paws.json";
const ROWS_URL =
  "https://datasets-server.huggingface.co/rows?dataset=google-research-datasets%2Fpaws&config=labeled_final";
const SPLITS = { train: 49_401, validation: 8_000, test: 8_000 };
const PAGE = 100;
const MAX_TRIES = 6;
/** The rows API starts refusing at full speed, about 9,000 rows in. */
const PAGE_DELAY_MS = 1_200;
const RETRY_WAIT_MS = 15_000;
const SAMPLE_PAIRS = 200;

interface RowsPage {
  rows: { row: { id: number; sentence1: string; sentence2: string; label: 0 | 1 } }[];
}

const errorMessage = (error: unknown): string =>
  error instanceof Error ? error.message : String(error);

const wait = (ms: number): Promise<void> =>
  new Promise((resolve) => setTimeout(resolve, ms));

async function fetchPage(split: string, offset: number): Promise<RowsPage> {
  const url = `${ROWS_URL}&split=${split}&offset=${offset}&length=${PAGE}`;
  for (let attempt = 1; ; attempt++) {
    const response = await fetch(url).catch(() => undefined);
    if (response?.ok) return (await response.json()) as RowsPage;
    if (attempt === MAX_TRIES) {
      throw new Error(`PAWS ${split} at ${offset}: ${response?.status ?? "no response"}`);
    }
    await wait(RETRY_WAIT_MS * 2 ** attempt);
  }
}

async function downloadPairs(): Promise<void> {
  const pairs: PawsPair[] = [];
  for (const [split, rows] of Object.entries(SPLITS)) {
    const start = pairs.length;
    for (let offset = 0; offset < rows; offset += PAGE) {
      const page = await fetchPage(split, offset);
      await wait(PAGE_DELAY_MS);
      for (const { row } of page.rows) {
        pairs.push({
          id: `${split}-${row.id}`,
          sentence1: row.sentence1,
          sentence2: row.sentence2,
          label: row.label,
        });
      }
    }
    if (pairs.length - start !== rows) {
      throw new Error(`PAWS ${split} has ${pairs.length - start} rows, not ${rows}`);
    }
    console.log(`${split}: ${rows} pairs`);
  }
  if (new Set(pairs.map((pair) => pair.id)).size !== pairs.length) {
    throw new Error("PAWS pair ids repeat");
  }
  mkdirSync(DIR, { recursive: true });
  const content = pairs.map((pair) => JSON.stringify(pair)).join("\n");
  writeFileSync(`${PAIRS_FILE}.tmp`, `${content}\n`);
  renameSync(`${PAIRS_FILE}.tmp`, PAIRS_FILE);
}

async function loadPairs(): Promise<PawsPair[]> {
  if (!existsSync(PAIRS_FILE)) await downloadPairs();
  const pairs = readFileSync(PAIRS_FILE, "utf8")
    .trim()
    .split("\n")
    .map((line) => JSON.parse(line) as PawsPair);
  const expected = Object.values(SPLITS).reduce((sum, rows) => sum + rows, 0);
  if (pairs.length !== expected) {
    throw new Error(`${PAIRS_FILE} has ${pairs.length} pairs, not ${expected}`);
  }
  return pairs;
}

/**
 * Runs inside the model's own session, so models never overlap. Checks every
 * pending text for truncation, even when `limit` embeds only some of them.
 */
async function score(modelIndex: number, pairs: PawsPair[], limit = Infinity) {
  const provider = await createOllamaProvider(OLLAMA_MODELS[modelIndex]);
  const log = openSimilarityLog(LOG_DIR, provider.id);
  let pendingPairs = 0;
  let embedded = 0;
  let seconds = 0;
  await withExclusiveModel(provider, async () => {
    const pending = pairs.filter((pair) => log.get(pair.id) === undefined);
    pendingPairs = pending.length;
    if (pending.length === 0) return;
    const texts = pending.flatMap((pair) => [pair.sentence1, pair.sentence2]);
    await assertNotTruncated(provider, texts);
    const chosen = pending.slice(0, limit);
    const started = performance.now();
    await pairSimilarities(provider, chosen, log);
    seconds = (performance.now() - started) / 1000;
    embedded = chosen.length;
  });
  return { providerId: provider.id, log, pendingPairs, embedded, seconds };
}

async function sample(pairs: PawsPair[]): Promise<void> {
  let totalSeconds = 0;
  for (const [i, { name }] of OLLAMA_MODELS.entries()) {
    const { pendingPairs, embedded, seconds } = await score(i, pairs, SAMPLE_PAIRS);
    const estimate = (seconds / embedded) * pendingPairs;
    totalSeconds += estimate;
    console.log(
      `${name}: ${(embedded / seconds).toFixed(0)} pairs/s, about ${(estimate / 3600).toFixed(2)} h`,
    );
  }
  console.log(`About ${(totalSeconds / 3600).toFixed(1)} h for all models`);
}

async function runAll(pairs: PawsPair[]): Promise<void> {
  const models: { model: string; providerId: string; pairs: number; auc: number }[] = [];
  const missing: { model: string; error: string }[] = [];
  const labels = pairs.map((pair) => pair.label);
  const save = (): void => {
    writeFileSync(
      RESULTS_FILE,
      `${JSON.stringify({ split: "labeled_final", models, missing }, null, 2)}\n`,
    );
  };
  for (const [i, { name }] of OLLAMA_MODELS.entries()) {
    console.log(`${new Date().toISOString()} ${name}`);
    try {
      const { providerId, log } = await score(i, pairs);
      const scores = pairs.map((pair) => log.get(pair.id) as number);
      const auc = rocAuc(labels, scores);
      models.push({ model: name, providerId, pairs: pairs.length, auc });
      console.log(`  AUC ${auc.toFixed(4)}`);
    } catch (error) {
      missing.push({ model: name, error: errorMessage(error) });
      console.log(`  missing: ${errorMessage(error)}`);
    }
    save();
  }
  if (missing.length > 0) process.exitCode = 1;
}

const mode = process.argv[3];
const pairs = await loadPairs();
if (mode === "prepare") {
  const paraphrases = pairs.filter((pair) => pair.label === 1).length;
  console.log(`${pairs.length} pairs, ${paraphrases} of them paraphrases`);
} else if (mode === "sample") {
  await sample(pairs);
} else {
  await runAll(pairs);
}
