import type { PageModel } from "./data";

export interface PawsSpread {
  count: number;
  min: number;
  max: number;
}

/** The range of PAWS scores across the models that took it, if any did. */
export function pawsSpread(models: PageModel[]): PawsSpread | undefined {
  const scores = models.flatMap((model) => (model.pawsAuc === undefined ? [] : [model.pawsAuc]));
  if (scores.length === 0) return undefined;
  return { count: scores.length, min: Math.min(...scores), max: Math.max(...scores) };
}
