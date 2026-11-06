import { passRate, scoreTriplet } from "@/util/benchmark/scoring";
import type {
  Category,
  Interval,
  Triplet,
  TripletScore,
} from "@/util/benchmark/types";
import { cosine_similarity } from "@/util/util";

/**
 * A verdict flip only counts as host noise if the margin is below this on both
 * hosts. Any other flip means a model needs a row per host.
 */
export const HOST_NOISE_MARGIN = 0.01;

/**
 * Forgiven flips still count if they all lean one way, so a model also needs
 * its hosts' pass rates this close, overall and within each category.
 */
export const MAX_PASS_RATE_GAP = 0.05;
export const MAX_CATEGORY_PASS_RATE_GAP = 0.15;

export type HostVectors = Map<string, number[]>;

export interface CategoryGap {
  category: Category;
  gap: number;
}

export interface HostComparison {
  triplets: number;
  texts: number;
  dimensions: number;
  meanHostCosine: number;
  verdictMatchRate: number;
  worstMarginDifference: number;
  worstMarginTriplet: string;
  workersAi: Interval;
  ollama: Interval;
  /** Difference between the hosts' pass rates. */
  passRateGap: number;
  worstCategoryGap: CategoryGap;
  /** Verdict flips with a margin below HOST_NOISE_MARGIN on both hosts. */
  forgivenMismatches: string[];
  /** Every other verdict flip. Any of these rules out one row. */
  unforgivenMismatches: string[];
  interchangeable: boolean;
}

function vectorFor(vectors: HostVectors, text: string): number[] {
  const vector = vectors.get(text);
  if (!vector) throw new Error(`No vector for ${text}`);
  return vector;
}

function scoreAll(triplets: Triplet[], vectors: HostVectors): TripletScore[] {
  return triplets.map(({ id, anchor, paraphrase, edit }) =>
    scoreTriplet(
      id,
      vectorFor(vectors, anchor),
      vectorFor(vectors, paraphrase),
      vectorFor(vectors, edit),
    ),
  );
}

function worstCategoryGap(
  triplets: Triplet[],
  workersScores: TripletScore[],
  ollamaScores: TripletScore[],
): CategoryGap {
  const passes = (scores: TripletScore[], category: Category): number =>
    scores.filter((s, i) => s.passed && triplets[i].category === category).length;
  const gaps = [...new Set(triplets.map((t) => t.category))].map((category) => {
    const rows = triplets.filter((t) => t.category === category).length;
    const difference =
      passes(workersScores, category) - passes(ollamaScores, category);
    return { category, gap: Math.abs(difference) / rows };
  });
  return gaps.reduce((worst, next) => (next.gap > worst.gap ? next : worst));
}

export function compareHosts(
  triplets: Triplet[],
  workersAi: HostVectors,
  ollama: HostVectors,
): HostComparison {
  const texts = [
    ...new Set(triplets.flatMap((t) => [t.anchor, t.paraphrase, t.edit])),
  ];
  const cosines = texts.map((text) => {
    const a = vectorFor(workersAi, text);
    const b = vectorFor(ollama, text);
    if (a.length !== b.length) {
      throw new Error(
        `${a.length} dimensions on Workers AI, ${b.length} on Ollama`,
      );
    }
    return cosine_similarity(a, b);
  });
  const workersScores = scoreAll(triplets, workersAi);
  const ollamaScores = scoreAll(triplets, ollama);

  const forgivenMismatches: string[] = [];
  const unforgivenMismatches: string[] = [];
  let worstMarginDifference = -1;
  let worstMarginTriplet = "";
  workersScores.forEach((score, i) => {
    const other = ollamaScores[i];
    if (score.passed !== other.passed) {
      const isNoise =
        Math.abs(score.margin) < HOST_NOISE_MARGIN &&
        Math.abs(other.margin) < HOST_NOISE_MARGIN;
      (isNoise ? forgivenMismatches : unforgivenMismatches).push(score.id);
    }
    const difference = Math.abs(score.margin - other.margin);
    if (difference > worstMarginDifference) {
      worstMarginDifference = difference;
      worstMarginTriplet = score.id;
    }
  });

  const mismatches = forgivenMismatches.length + unforgivenMismatches.length;
  const workersRate = passRate(workersScores.map((s) => s.passed));
  const ollamaRate = passRate(ollamaScores.map((s) => s.passed));
  const passRateGap = Math.abs(workersRate.rate - ollamaRate.rate);
  const categoryGap = worstCategoryGap(triplets, workersScores, ollamaScores);
  return {
    triplets: triplets.length,
    texts: texts.length,
    dimensions: vectorFor(workersAi, texts[0]).length,
    meanHostCosine: cosines.reduce((sum, c) => sum + c, 0) / cosines.length,
    verdictMatchRate: 1 - mismatches / triplets.length,
    worstMarginDifference,
    worstMarginTriplet,
    workersAi: workersRate,
    ollama: ollamaRate,
    passRateGap,
    worstCategoryGap: categoryGap,
    forgivenMismatches,
    unforgivenMismatches,
    interchangeable:
      unforgivenMismatches.length === 0 &&
      passRateGap <= MAX_PASS_RATE_GAP &&
      categoryGap.gap <= MAX_CATEGORY_PASS_RATE_GAP,
  };
}
