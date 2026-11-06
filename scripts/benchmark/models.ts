import type { OllamaModel } from "./ollama";
import type { OpenRouterModel } from "./openRouter";
import type { WorkersAiModel } from "./workersAi";

/**
 * Prefixes were checked on 2026-11-05 against each model's own card. Use one
 * prefix on all three texts of a triplet, and the same prefix on both hosts.
 *
 * `maxTokens` is the lowest limit we know of: `context_length` or `num_ctx`
 * from `/api/show`, or the request's own `num_ctx`.
 */
/** Whether the live box may use a model. Ollama is never used in production. */
export type Availability = "live" | "batch-only";

interface Registered {
  availability: Availability;
}

const NO_PREFIX = "";
// https://huggingface.co/google/embeddinggemma-300m
// https://huggingface.co/google/embeddinggemma-2
const SENTENCE_SIMILARITY = "task: sentence similarity | query: ";
// The instruction is for retrieval queries only: https://huggingface.co/BAAI/bge-large-en-v1.5
const BGE_LARGE_PREFIX = NO_PREFIX;
// "No longer requires adding instructions": https://huggingface.co/BAAI/bge-m3
const BGE_M3_PREFIX = NO_PREFIX;
// The card puts an instruction on queries and none on documents, and doesn't
// cover comparing two sentences, so all texts are treated as documents.
// https://huggingface.co/Qwen/Qwen3-Embedding-0.6B
const QWEN3_PREFIX = NO_PREFIX;
// The closest documented match. The card requires a prefix but names none for
// comparing sentences; `clustering` covers removing semantic duplicates.
// https://huggingface.co/nomic-ai/nomic-embed-text-v1.5
const NOMIC_PREFIX = "clustering: ";

export const OLLAMA_MODELS: (OllamaModel & Registered)[] = [
  {
    // The card mentions no prefix: https://huggingface.co/sentence-transformers/all-MiniLM-L6-v2
    name: "all-minilm",
    prefix: NO_PREFIX,
    maxTokens: 256,
    availability: "batch-only",
  },
  {
    name: "bge-large",
    prefix: BGE_LARGE_PREFIX,
    maxTokens: 512,
    availability: "batch-only",
  },
  {
    // The prompt is for retrieval queries only: https://huggingface.co/mixedbread-ai/mxbai-embed-large-v1
    name: "mxbai-embed-large",
    prefix: NO_PREFIX,
    maxTokens: 512,
    availability: "batch-only",
  },
  {
    name: "bge-m3",
    prefix: BGE_M3_PREFIX,
    maxTokens: 8192,
    availability: "batch-only",
  },
  {
    name: "nomic-embed-text",
    prefix: NOMIC_PREFIX,
    maxTokens: 2048,
    availability: "batch-only",
  },
  {
    name: "embeddinggemma",
    prefix: SENTENCE_SIMILARITY,
    maxTokens: 2048,
    availability: "batch-only",
  },
  {
    name: "embeddinggemma-2",
    prefix: SENTENCE_SIMILARITY,
    maxTokens: 8192,
    availability: "batch-only",
  },
  {
    name: "qwen3-embedding:0.6b",
    prefix: QWEN3_PREFIX,
    maxTokens: 2048,
    options: { num_ctx: 2048 },
    availability: "batch-only",
  },
];

export const WORKERS_AI_MODELS: (WorkersAiModel & Registered)[] = [
  {
    name: "@cf/baai/bge-large-en-v1.5",
    pooling: "mean",
    prefix: BGE_LARGE_PREFIX,
    availability: "live",
  },
  {
    name: "@cf/baai/bge-large-en-v1.5",
    pooling: "cls",
    prefix: BGE_LARGE_PREFIX,
    availability: "live",
  },
  {
    name: "@cf/baai/bge-m3",
    prefix: BGE_M3_PREFIX,
    availability: "live",
  },
  {
    name: "@cf/qwen/qwen3-embedding-0.6b",
    prefix: QWEN3_PREFIX,
    availability: "live",
  },
  {
    // Stays out of the live box until it has a listed price.
    name: "@cf/google/embeddinggemma-300m",
    prefix: SENTENCE_SIMILARITY,
    availability: "batch-only",
  },
];

/**
 * Checked on 2026-11-06. These models never reach the live box. Vectors
 * through OpenRouter haven't been compared with the direct APIs.
 */
export const OPENROUTER_MODELS: (OpenRouterModel & Registered)[] = [
  {
    name: "openai/text-embedding-3-small",
    upstream: "OpenAI",
    availability: "batch-only",
  },
  {
    name: "openai/text-embedding-3-large",
    upstream: "OpenAI",
    availability: "batch-only",
  },
  {
    name: "sentence-transformers/all-mpnet-base-v2",
    upstream: "DeepInfra",
    availability: "batch-only",
  },
  {
    // The closest documented match, as with nomic. On a test sentence it gave
    // the same vector as `search_document`, the default for this model.
    // https://docs.cohere.com/reference/embed
    name: "cohere/embed-5-pro",
    upstream: "Cohere",
    inputType: "clustering",
    availability: "batch-only",
  },
  {
    // `query` and `document` add retrieval prompts, so all texts go without:
    // https://docs.voyageai.com/docs/embeddings
    // Identical requests sometimes return a different vector, moving a margin
    // by up to 0.014 in a 40-triplet retest, so the page must report its noise.
    name: "mongodb/voyage-4-large",
    upstream: "VoyageAI by MongoDB",
    availability: "batch-only",
  },
  {
    // This model takes its task in the text, not `task_type`:
    // https://aistudio.google.com/docs/embeddings
    name: "google/gemini-embedding-2",
    upstream: "Google",
    prefix: SENTENCE_SIMILARITY,
    availability: "batch-only",
  },
];
