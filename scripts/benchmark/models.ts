import type { OllamaModel } from "./ollama";

/**
 * Prefixes were checked on 2026-11-05 against each model's own card. Use one
 * prefix on all three texts of a triplet, and the same prefix on both hosts.
 *
 * `maxTokens` is the lowest limit we know of: `context_length` or `num_ctx`
 * from `/api/show`, or the request's own `num_ctx`.
 */
const SENTENCE_SIMILARITY = "task: sentence similarity | query: ";

export const OLLAMA_MODELS: OllamaModel[] = [
  {
    // The card mentions no prefix: https://huggingface.co/sentence-transformers/all-MiniLM-L6-v2
    name: "all-minilm",
    prefix: "",
    maxTokens: 256,
  },
  {
    // The instruction is for retrieval queries only: https://huggingface.co/BAAI/bge-large-en-v1.5
    name: "bge-large",
    prefix: "",
    maxTokens: 512,
  },
  {
    // The prompt is for retrieval queries only: https://huggingface.co/mixedbread-ai/mxbai-embed-large-v1
    name: "mxbai-embed-large",
    prefix: "",
    maxTokens: 512,
  },
  {
    // "No longer requires adding instructions": https://huggingface.co/BAAI/bge-m3
    name: "bge-m3",
    prefix: "",
    maxTokens: 8192,
  },
  {
    // UNRESOLVED: the card says a prefix is a must but names none for sentence
    // comparison. `clustering: ` ("remove semantic duplicates") is the closest.
    // https://huggingface.co/nomic-ai/nomic-embed-text-v1.5
    name: "nomic-embed-text",
    prefix: "",
    maxTokens: 2048,
  },
  {
    // https://huggingface.co/google/embeddinggemma-300m
    name: "embeddinggemma",
    prefix: SENTENCE_SIMILARITY,
    maxTokens: 2048,
  },
  {
    // https://huggingface.co/google/embeddinggemma-2
    name: "embeddinggemma-2",
    prefix: SENTENCE_SIMILARITY,
    maxTokens: 8192,
  },
  {
    // UNRESOLVED: the card puts an instruction on queries and none on documents,
    // and doesn't cover comparing two sentences. Empty treats all as documents.
    // https://huggingface.co/Qwen/Qwen3-Embedding-0.6B
    name: "qwen3-embedding:0.6b",
    prefix: "",
    maxTokens: 2048,
    options: { num_ctx: 2048 },
  },
];
