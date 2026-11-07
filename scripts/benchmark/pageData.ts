import type {
  DetailScores,
  PageDetails,
  PageModel,
  PageSummary,
} from "@/app/benchmark/data";
import { passRate } from "@/util/benchmark/scoring";
import type { Availability } from "./models";
import type { Summary } from "./report";
import type { Category, Triplet } from "@/util/benchmark/types";

export interface Results {
  models: (Summary & {
    model: string;
    host: string;
    availability: Availability;
    providerId: string;
  })[];
  missing: { model: string; error: string }[];
}

export interface PawsResults {
  models: { model: string; auc: number }[];
}

const NAMES: Record<string, string> = {
  "bag-of-words": "Word counts (no AI)",
  "bge-large (mean)": "bge-large, mean pooling",
  "bge-large": "bge-large, cls pooling",
  "all-minilm": "all-MiniLM-L6-v2",
  "mxbai-embed-large": "mxbai-embed-large",
  "bge-m3": "bge-m3",
  "nomic-embed-text": "nomic-embed-text",
  embeddinggemma: "EmbeddingGemma",
  "embeddinggemma-2": "EmbeddingGemma 2",
  "qwen3-embedding:0.6b": "Qwen3 Embedding 0.6B",
  "openai/text-embedding-3-small": "OpenAI 3-small",
  "openai/text-embedding-3-large": "OpenAI 3-large",
  "sentence-transformers/all-mpnet-base-v2": "all-mpnet-base-v2",
  "cohere/embed-5-pro": "Cohere Embed 5 Pro",
  "mongodb/voyage-4-large": "Voyage 4 Large",
  "google/gemini-embedding-2": "Gemini Embedding 2",
};

const SOURCES: Record<string, string> = {
  local: "Baseline",
  "workers-ai": "Open, on Workers AI",
  ollama: "Open, run locally",
  openrouter: "Hosted API",
};

const APP_MODEL = "bge-large (mean)";

/** Hand-picked to show the range, from sets every model gets to sets none do. */
const EXAMPLE_IDS = ["ant-02", "neg-16", "quant-17", "num-11", "scope-13", "role-02"];

function scoresAt(
  row: Results["models"][number],
  triplets: Triplet[],
  context: number,
): DetailScores {
  const byId = new Map(row.scores.map((score) => [score.id, score]));
  const found = triplets.map(({ baseId }) => {
    const id = context === 0 ? baseId : `${baseId}-context-${context}`;
    const score = byId.get(id);
    if (!score) throw new Error(`${row.model} has no score for ${id}`);
    return score;
  });
  return {
    margins: found.map((score) => score.margin),
    passed: found.map((score) => (score.passed ? "1" : "0")).join(""),
  };
}

/** Each kind of change at each context length, for the page's slider. */
function gridFor(row: Results["models"][number], triplets: Triplet[], contexts: number[]) {
  const grid: PageModel["grid"] = {};
  for (const context of contexts) {
    const { passed } = scoresAt(row, triplets, context);
    const cells: PageModel["grid"][string] = {};
    for (const category of new Set(triplets.map((t) => t.category))) {
      const results = triplets.flatMap((t, i) =>
        t.category === category ? [passed[i] === "1"] : [],
      );
      cells[category] = { ...passRate(results), count: results.length };
    }
    grid[context] = cells;
  }
  return grid;
}

/** Splits results into what every visit needs and what only a click needs. */
export function buildPageData(
  results: Results,
  triplets: Triplet[],
  paws?: PawsResults,
): { summary: PageSummary; details: PageDetails } {
  const rows = [...results.models].sort((a, b) => b.overall.rate - a.overall.rate);
  const auc = new Map(paws?.models.map(({ model, auc }) => [model, auc]));
  const models: PageModel[] = rows.map((row) => {
    const pawsAuc = auc.get(row.model);
    return {
      key: row.model,
      name: NAMES[row.model] ?? row.model,
      source: SOURCES[row.host] ?? row.host,
      usedByApp: row.model === APP_MODEL,
      overall: row.overall,
      categories: row.categories,
      contexts: { "0": row.overall, ...row.byContext },
      grid: gridFor(row, triplets, [0, ...Object.keys(row.byContext).map(Number)]),
      ...(pawsAuc !== undefined && { pawsAuc }),
    };
  });
  const contexts = Object.keys(models[0].contexts).map(Number);
  const categories = Object.keys(models[0].categories) as Category[];
  const scores: PageDetails["scores"] = {};
  for (const row of rows) {
    scores[row.model] = Object.fromEntries(
      contexts.map((context) => [context, scoresAt(row, triplets, context)]),
    );
  }
  const examples = triplets
    .filter((triplet) => EXAMPLE_IDS.includes(triplet.id))
    .sort((a, b) => EXAMPLE_IDS.indexOf(a.id) - EXAMPLE_IDS.indexOf(b.id))
    .map(({ id, category, anchor, paraphrase, edit }) => ({
      id,
      category,
      anchor,
      paraphrase,
      edit,
      scores: rows.map((row) => {
        const score = row.scores.find((s) => s.id === id);
        if (!score) throw new Error(`${row.model} has no score for ${id}`);
        return { key: row.model, margin: score.margin, passed: score.passed };
      }),
    }));
  return {
    summary: { models, categories, contexts, tripletCount: triplets.length, examples },
    details: {
      triplets: triplets.map(({ category, anchor, paraphrase, edit }) => ({
        category,
        anchor,
        paraphrase,
        edit,
      })),
      scores,
    },
  };
}
