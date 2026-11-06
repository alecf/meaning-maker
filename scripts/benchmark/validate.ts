import { tokenize } from "@/util/benchmark/bagOfWords";
import { CATEGORIES, type Category, type Triplet } from "@/util/benchmark/types";

const MAX_LENGTH_DIFFERENCE = 0.3;
const CONTEXT_SENTENCES = 8;

const TEXT_FIELDS = ["anchor", "paraphrase", "edit"] as const;
const REQUIRED_FIELDS = ["id", "baseId", ...TEXT_FIELDS] as const;

const isEmpty = (value: unknown): boolean =>
  typeof value !== "string" || value.trim() === "";

function counts(tokens: string[]): Map<string, number> {
  const result = new Map<string, number>();
  for (const token of tokens) result.set(token, (result.get(token) ?? 0) + 1);
  return result;
}

/** How many tokens of `a` are left over once `b`'s are taken away. */
function unmatched(a: string[], b: string[]): number {
  const left = counts(b);
  let extra = 0;
  for (const token of a) {
    const available = left.get(token) ?? 0;
    if (available > 0) left.set(token, available - 1);
    else extra++;
  }
  return extra;
}

const sameWords = (a: string[], b: string[]): boolean =>
  unmatched(a, b) === 0 && unmatched(b, a) === 0;

/** Length is in tokens, relative to the longer text. */
function lengthsDiffer(a: string[], b: string[]): boolean {
  const longer = Math.max(a.length, b.length);
  return Math.abs(a.length - b.length) / longer > MAX_LENGTH_DIFFERENCE;
}

/** At most one word out and one in, in any order. */
const copiesAnchor = (anchor: string[], paraphrase: string[]): boolean =>
  unmatched(anchor, paraphrase) <= 1 && unmatched(paraphrase, anchor) <= 1;

/** Returns what's wrong with one row. Parsed rows may be missing fields. */
export function validateTriplet(triplet: Triplet): string[] {
  const problems: string[] = [];
  for (const field of REQUIRED_FIELDS) {
    if (isEmpty(triplet[field])) problems.push(`${field} is empty`);
  }
  if (!CATEGORIES.includes(triplet.category as Category)) {
    problems.push(`unknown category ${triplet.category}`);
  }
  for (const field of TEXT_FIELDS) {
    const text = triplet[field];
    if (isEmpty(text)) continue;
    if (tokenize(text).length === 0) problems.push(`${field} has no tokens`);
    if (text.includes("’")) problems.push(`${field} has a curly apostrophe`);
  }
  if (TEXT_FIELDS.some((field) => isEmpty(triplet[field]))) return problems;

  const anchor = tokenize(triplet.anchor);
  const paraphrase = tokenize(triplet.paraphrase);
  const edit = tokenize(triplet.edit);
  if (new Set(TEXT_FIELDS.map((field) => triplet[field])).size < 3) {
    problems.push("two of the texts are identical");
  }
  if (lengthsDiffer(paraphrase, edit)) {
    problems.push("paraphrase and edit lengths differ by more than 30%");
  }
  if (triplet.category === "swapped-roles" && !sameWords(anchor, edit)) {
    problems.push("swapped-roles edit doesn't use the same words as the anchor");
  }
  if (copiesAnchor(anchor, paraphrase)) {
    problems.push("paraphrase copies the anchor with at most one word changed");
  }
  return problems;
}

/** Row problems plus the rules that span rows, each prefixed with the row's id. */
export function validateTriplets(triplets: Triplet[]): string[] {
  const problems = triplets.flatMap((triplet) =>
    validateTriplet(triplet).map((problem) => `${triplet.id}: ${problem}`),
  );
  const ids = new Set<string>();
  const bases = new Map<string, Triplet>();
  const contexts = new Set<string>();
  for (const triplet of triplets) {
    const { id, baseId, category, anchor, contextSentences } = triplet;
    if (ids.has(id)) problems.push(`${id}: duplicated id`);
    ids.add(id);

    const base = bases.get(baseId);
    if (base && (base.category !== category || base.anchor !== anchor)) {
      problems.push(`${id}: baseId ${baseId} differs in category or anchor`);
    }
    if (!base) bases.set(baseId, triplet);

    const context = `${baseId}\t${contextSentences}`;
    if (contexts.has(context)) {
      problems.push(`${id}: baseId ${baseId} repeats contextSentences ${contextSentences}`);
    }
    contexts.add(context);
  }
  return problems;
}

export function validateContextSentences(sentences: string[]): string[] {
  const problems: string[] = [];
  if (sentences.length < CONTEXT_SENTENCES) {
    problems.push(`needs at least ${CONTEXT_SENTENCES} sentences`);
  }
  if (new Set(sentences).size < sentences.length) {
    problems.push("a sentence is repeated");
  }
  for (const sentence of sentences) {
    if (tokenize(sentence).length === 0) {
      problems.push(`"${sentence}" has no tokens`);
    }
  }
  return problems;
}

export const parseTriplets = (jsonl: string): Triplet[] =>
  jsonl
    .trim()
    .split("\n")
    .map((line) => JSON.parse(line) as Triplet);
