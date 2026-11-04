const MIN_OPACITY = 0.16;
const CURVE = 0.9;

/**
 * Map each sentence's similarity to the preceding text onto an opacity: the
 * most repetitive sentence fades furthest and the most novel stays solid. The
 * first sentence has nothing to compare with, so it stays solid and is left out
 * of the range. docs/index.html uses the same curve.
 */
export function sentenceOpacities(similarities: number[]): number[] {
  const compared = similarities.slice(1);
  const low = Math.min(...compared);
  const high = Math.max(...compared);
  return similarities.map((similarity, index) =>
    index === 0 || high === low
      ? 1
      : MIN_OPACITY +
        (1 - MIN_OPACITY) * ((high - similarity) / (high - low)) ** CURVE,
  );
}
