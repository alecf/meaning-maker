import { passRate } from "@/util/benchmark/scoring";
import type { Category, Interval, Triplet, TripletScore } from "@/util/benchmark/types";

export interface CountedInterval extends Interval {
  count: number;
}

export interface SavedScore {
  id: string;
  margin: number;
  passed: boolean;
}

export interface Summary {
  /** Bare sentences only, like `categories`. */
  overall: CountedInterval;
  categories: Partial<Record<Category, CountedInterval>>;
  /** Every context length other than 0, keyed by its number of sentences. */
  byContext: Record<string, CountedInterval>;
  scores: SavedScore[];
}

export interface RunComparison {
  triplets: number;
  flips: string[];
  medianShift: number;
  maxShift: number;
}

/** Intervals assume independent results, so a baseId can only appear once. */
function interval(triplets: Triplet[], scores: Map<string, TripletScore>): CountedInterval {
  const seen = new Set<string>();
  for (const { baseId } of triplets) {
    if (seen.has(baseId)) throw new Error(`baseId ${baseId} repeats in one interval`);
    seen.add(baseId);
  }
  const passed = triplets.map((t) => (scores.get(t.id) as TripletScore).passed);
  return { ...passRate(passed), count: triplets.length };
}

export function summarize(triplets: Triplet[], scores: TripletScore[]): Summary {
  const byId = new Map(scores.map((score) => [score.id, score]));
  for (const { id } of triplets) {
    if (!byId.has(id)) throw new Error(`No score for ${id}`);
  }
  const bare = triplets.filter((t) => t.contextSentences === 0);
  if (bare.length === 0) throw new Error("There are no bare sentences to summarize");

  const categories: Summary["categories"] = {};
  for (const category of new Set(bare.map((t) => t.category))) {
    categories[category] = interval(
      bare.filter((t) => t.category === category),
      byId,
    );
  }
  const byContext: Summary["byContext"] = {};
  const lengths = new Set(triplets.map((t) => t.contextSentences));
  for (const length of [...lengths].filter((n) => n !== 0).sort((a, b) => a - b)) {
    byContext[length] = interval(
      triplets.filter((t) => t.contextSentences === length),
      byId,
    );
  }
  return {
    overall: interval(bare, byId),
    categories,
    byContext,
    scores: scores.map(({ id, margin, passed }) => ({
      id,
      margin: Number(margin.toFixed(6)),
      passed,
    })),
  };
}

/** How much two runs of the same model disagree. */
export function compareRuns(first: TripletScore[], second: TripletScore[]): RunComparison {
  const others = new Map(second.map((score) => [score.id, score]));
  const flips: string[] = [];
  const shifts = first.map((score) => {
    const other = others.get(score.id);
    if (!other) throw new Error(`No retest score for ${score.id}`);
    if (other.passed !== score.passed) flips.push(score.id);
    return Math.abs(score.margin - other.margin);
  });
  shifts.sort((a, b) => a - b);
  return {
    triplets: first.length,
    flips,
    medianShift: shifts[Math.floor(shifts.length / 2)],
    maxShift: shifts[shifts.length - 1],
  };
}
