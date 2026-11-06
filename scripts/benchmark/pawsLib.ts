import { createHash } from "node:crypto";
import {
  appendFileSync,
  existsSync,
  mkdirSync,
  readFileSync,
  truncateSync,
} from "node:fs";
import { join } from "node:path";
import { pairSimilarity } from "@/util/benchmark/scoring";
import type { EmbeddingProvider } from "@/util/benchmark/types";

export interface PawsPair {
  /** Unique across splits. */
  id: string;
  sentence1: string;
  sentence2: string;
  /** 1 if the sentences are paraphrases. */
  label: 0 | 1;
}

export interface SimilarityLog {
  get(id: string): number | undefined;
  put(id: string, similarity: number): void;
}

/** Area under the ROC curve from average ranks, so ties get half credit. */
export function rocAuc(labels: number[], scores: number[]): number {
  if (labels.length !== scores.length) throw new Error("rocAuc lengths differ");
  const positives = labels.filter((label) => label === 1).length;
  const negatives = labels.length - positives;
  if (positives === 0 || negatives === 0) {
    throw new Error("rocAuc needs both classes");
  }
  const order = scores.map((_, i) => i).sort((a, b) => scores[a] - scores[b]);
  let positiveRanks = 0;
  for (let start = 0; start < order.length; ) {
    let end = start;
    while (end + 1 < order.length && scores[order[end + 1]] === scores[order[start]]) {
      end++;
    }
    const rank = (start + end) / 2 + 1;
    for (let i = start; i <= end; i++) {
      if (labels[order[i]] === 1) positiveRanks += rank;
    }
    start = end + 1;
  }
  return (positiveRanks - (positives * (positives + 1)) / 2) / (positives * negatives);
}

/** One append-only file per provider: `<pair id> <similarity>`. Holds no vectors. */
export function openSimilarityLog(dir: string, providerId: string): SimilarityLog {
  mkdirSync(dir, { recursive: true });
  const name = createHash("sha256").update(providerId).digest("hex").slice(0, 16);
  const file = join(dir, `${name}.tsv`);
  const entries = new Map<string, number>();
  if (existsSync(file)) {
    const content = readFileSync(file, "utf8");
    const end = content.lastIndexOf("\n") + 1;
    if (end < content.length) truncateSync(file, end);
    for (const line of content.slice(0, end).split("\n")) {
      const [id, value] = line.split("\t");
      if (id && value) entries.set(id, Number(value));
    }
  }
  return {
    get: (id) => entries.get(id),
    put(id, similarity) {
      if (!Number.isFinite(similarity)) {
        throw new Error(`Won't log a bad similarity for pair ${id}`);
      }
      entries.set(id, similarity);
      appendFileSync(file, `${id}\t${similarity}\n`);
    },
  };
}

/** Embeds what the log is missing, keeping only each pair's similarity. */
export async function pairSimilarities(
  provider: EmbeddingProvider,
  pairs: PawsPair[],
  log: SimilarityLog,
  chunkSize = 64,
): Promise<void> {
  const pending = pairs.filter((pair) => log.get(pair.id) === undefined);
  for (let i = 0; i < pending.length; i += chunkSize) {
    const chunk = pending.slice(i, i + chunkSize);
    const vectors = await provider.embedBatch(
      chunk.flatMap((pair) => [pair.sentence1, pair.sentence2]),
    );
    chunk.forEach((pair, j) => {
      log.put(pair.id, pairSimilarity(pair.id, vectors[2 * j], vectors[2 * j + 1]));
    });
  }
}
