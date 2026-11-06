import type { Triplet } from "@/util/benchmark/types";

/**
 * Puts neutral filler before all three texts, using the last `sentences` of it,
 * so filler always sits directly before the text under test.
 */
export function withContext(
  triplet: Triplet,
  filler: string[],
  sentences: Triplet["contextSentences"],
): Triplet {
  if (triplet.contextSentences !== 0) {
    throw new Error(`${triplet.id} already has context`);
  }
  if (sentences === 0) return triplet;
  if (filler.length < sentences) {
    throw new Error(`Need ${sentences} sentences of filler, got ${filler.length}`);
  }
  const lead = filler.slice(-sentences).join(" ");
  return {
    ...triplet,
    id: `${triplet.baseId}-context-${sentences}`,
    anchor: `${lead} ${triplet.anchor}`,
    paraphrase: `${lead} ${triplet.paraphrase}`,
    edit: `${lead} ${triplet.edit}`,
    contextSentences: sentences,
  };
}
