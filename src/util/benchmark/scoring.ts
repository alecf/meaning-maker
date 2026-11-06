import type { TripletScore } from "./types";

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
