import type { Category } from "@/util/benchmark/types";

interface CategoryLabel {
  name: string;
  /** A short before and after, in the page's words. */
  example: string;
}

export const CATEGORIES: Record<Category, CategoryLabel> = {
  negation: { name: "Negation", example: "protects → does not protect" },
  antonyms: { name: "Opposites", example: "hired → fired" },
  quantifiers: { name: "Quantities", example: "all of → none of" },
  numbers: { name: "Numbers", example: "March 3 → March 13" },
  "negation-scope": {
    name: "Moved “not”",
    example: "not sure it’s closed → sure it’s not closed",
  },
  "swapped-roles": { name: "Swapped roles", example: "Apple sued Samsung → Samsung sued Apple" },
};

/** Easiest first, which is also how the page tells the story. */
export const CATEGORY_ORDER: Category[] = [
  "negation",
  "antonyms",
  "quantifiers",
  "numbers",
  "negation-scope",
  "swapped-roles",
];
