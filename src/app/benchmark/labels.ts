import type { Category } from "@/util/benchmark/types";

interface Skill {
  name: string;
  /** The question this kind of change asks of a model. */
  question: string;
  /** What the results say about language, at sentence length. */
  insight: string;
}

export const SKILLS: Record<Category, Skill> = {
  negation: {
    name: "Negation",
    question: "Does “not” flip the meaning?",
    insight:
      "Most models register a “not”. Several popular ones barely do, and treat “does” and “does not” as nearly the same thing.",
  },
  antonyms: {
    name: "Opposites",
    question: "Are “hired” and “fired” different?",
    insight:
      "Opposites often appear in the same contexts, which could make them look alike. Many models still pull them apart.",
  },
  quantifiers: {
    name: "Quantities",
    question: "Is “all” different from “none”?",
    insight:
      "Small words like “all”, “few” and “neither” change everything, and most models pick that up.",
  },
  numbers: {
    name: "Numbers",
    question: "Is March 3 different from March 13?",
    insight:
      "Models land all over the place here. For some, a changed number hardly registers at all.",
  },
  "negation-scope": {
    name: "Where “not” goes",
    question: "Does it matter what “not” applies to?",
    insight:
      "Noticing a “not” is one thing. Working out what it applies to is much harder, and only one model does it reliably.",
  },
  "swapped-roles": {
    name: "Who did what",
    question: "Does it matter who did it to whom?",
    insight:
      "No model here reliably notices when the actors swap. Same words in a new order come out looking like the same idea.",
  },
};

/** Easiest first, which is also how the exhibit tells the story. */
export const SKILL_ORDER: Category[] = [
  "negation",
  "antonyms",
  "quantifiers",
  "numbers",
  "negation-scope",
  "swapped-roles",
];
