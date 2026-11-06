import { cosine_similarity } from "../util";
import type { Interval, TripletScore } from "./types";

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
