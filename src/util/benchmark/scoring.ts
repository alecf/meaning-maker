import { cosine_similarity } from "../util";
import type { Interval, TripletScore } from "./types";

/** Vectors are cached as Float32, so smaller margins are rounding, not signal. */
export const TIE_TOLERANCE = 1e-6;

function assertScorable(id: string, vectors: number[][]): void {
  const length = vectors[0].length;
  for (const vector of vectors) {
    if (vector.length === 0 || vector.length !== length) {
      throw new Error(`Triplet ${id}: vectors must share a non-zero length`);
    }
    if (!vector.every(Number.isFinite)) {
      throw new Error(`Triplet ${id}: vector has a non-finite element`);
    }
    if (vector.reduce((sum, x) => sum + x * x, 0) === 0) {
      throw new Error(`Triplet ${id}: vector has zero norm`);
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
