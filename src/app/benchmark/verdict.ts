export type Verdict = "notices" | "mixed" | "misses";

const NOTICES_FROM = 0.75;
const MIXED_FROM = 0.4;
/** Differences below this are as small as noise between identical requests. */
const CLOSE_CALL = 0.01;
const CLEAR_PICK = 0.05;

export const VERDICT_ORDER: Verdict[] = ["notices", "mixed", "misses"];

export const VERDICT_NAMES: Record<Verdict, string> = {
  notices: "Usually notices",
  mixed: "Hit or miss",
  misses: "Usually misses",
};

export function verdictFor(rate: number): Verdict {
  if (rate >= NOTICES_FROM) return "notices";
  return rate >= MIXED_FROM ? "mixed" : "misses";
}

export function pickStrength(margin: number): string {
  const size = Math.abs(margin);
  if (size < CLOSE_CALL) return "It was a close call.";
  return size < CLEAR_PICK ? "It wasn't a big gap." : "It wasn't close.";
}
