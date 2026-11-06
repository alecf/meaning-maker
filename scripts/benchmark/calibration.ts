import { passRate, scoreTriplet } from "@/util/benchmark/scoring";
import type { Interval, Triplet, TripletScore } from "@/util/benchmark/types";
import { cosine_similarity } from "@/util/util";

/**
 * A verdict flip only counts as host noise if the margin is below this on both
 * hosts. Any other flip means a model needs a row per host.
 */
export const HOST_NOISE_MARGIN = 0.01;

export type HostVectors = Map<string, number[]>;

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
  return {
    triplets: triplets.length,
    texts: texts.length,
    dimensions: vectorFor(workersAi, texts[0]).length,
    meanHostCosine: cosines.reduce((sum, c) => sum + c, 0) / cosines.length,
    verdictMatchRate: 1 - mismatches / triplets.length,
    worstMarginDifference,
    worstMarginTriplet,
    workersAi: passRate(workersScores.map((s) => s.passed)),
    ollama: passRate(ollamaScores.map((s) => s.passed)),
    forgivenMismatches,
    unforgivenMismatches,
    interchangeable: unforgivenMismatches.length === 0,
  };
}
