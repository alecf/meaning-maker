import type { Interval, TripletScore } from "./types";

export function cosine(a: number[], b: number[]): number {
  let ab = 0;
  let aa = 0;
  let bb = 0;
  for (let i = 0; i < a.length; i++) {
    ab += a[i] * b[i];
    aa += a[i] * a[i];
    bb += b[i] * b[i];
  }
  return aa === 0 || bb === 0 ? 0 : ab / Math.sqrt(aa * bb);
}

export function scoreTriplet(
  id: string,
  anchor: number[],
  paraphrase: number[],
  edit: number[],
): TripletScore {
  const paraphraseSimilarity = cosine(anchor, paraphrase);
  const editSimilarity = cosine(anchor, edit);
  const margin = paraphraseSimilarity - editSimilarity;
  return { id, paraphraseSimilarity, editSimilarity, margin, passed: margin > 0 };
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
