import type { Category, Interval } from "@/util/benchmark/types";

export interface CountedInterval extends Interval {
  count: number;
}

export interface PageModel {
  key: string;
  name: string;
  /** How it ran, in words. */
  source: string;
  usedByApp: boolean;
  overall: CountedInterval;
  categories: Partial<Record<Category, CountedInterval>>;
  /** Keyed by sentences of filler, including 0. */
  contexts: Record<string, CountedInterval>;
  /** ROC AUC on PAWS, once it has run for this model. */
  pawsAuc?: number;
}

export interface PageExample extends DetailTriplet {
  id: string;
  scores: { key: string; margin: number; passed: boolean }[];
}

export interface PageSummary {
  models: PageModel[];
  categories: Category[];
  contexts: number[];
  tripletCount: number;
  examples: PageExample[];
}

export interface DetailTriplet {
  category: Category;
  anchor: string;
  paraphrase: string;
  edit: string;
}

export interface DetailScores {
  margins: number[];
  /** One `1` or `0` per triplet. Margins alone would lose near ties to rounding. */
  passed: string;
}

export interface PageDetails {
  /** Bare triplets. Every array in `scores` lines up with this order. */
  triplets: DetailTriplet[];
  /** Model key, then sentences of filler. */
  scores: Record<string, Record<string, DetailScores>>;
}
