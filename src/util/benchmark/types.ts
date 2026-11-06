export const CATEGORIES = [
  "negation",
  "swapped-roles",
  "quantifiers",
  "numbers",
  "antonyms",
  "negation-scope",
] as const;

export type Category = (typeof CATEGORIES)[number];

export interface Triplet {
  id: string;
  /** Shared by every context length of one base triplet. Never pool it in one interval. */
  baseId: string;
  category: Category;
  anchor: string;
  paraphrase: string;
  edit: string;
  /** Sentences of neutral context added around all three; 0 for bare sentences. */
  contextSentences: 0 | 1 | 3 | 8;
  status: "draft" | "approved" | "rejected";
  /** Judgement calls a reviewer should look at. */
  notes?: string;
}

export interface TripletScore {
  id: string;
  paraphraseSimilarity: number;
  editSimilarity: number;
  /** paraphraseSimilarity - editSimilarity. A pass must beat TIE_TOLERANCE. */
  margin: number;
  passed: boolean;
}

export interface Interval {
  rate: number;
  low: number;
  high: number;
}

export interface EmbeddingProvider {
  /** Stable identity, including pooling and task prefix. Used in cache keys. */
  readonly id: string;
  /**
   * Vectors are only comparable within one embedBatch call, so callers must
   * not cache them or split a triplet across batches.
   */
  readonly batchScoped?: boolean;
  embedBatch(texts: string[]): Promise<number[][]>;
}
