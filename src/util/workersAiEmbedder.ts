import { embed } from "ai";
import { createWorkersAI } from "workers-ai-provider";
import { type Embedder, stableStringify } from "./embedding";

/**
 * Single source of truth for the embedding model and its options. Everything
 * here is folded into the embedder id, and therefore into cache keys.
 *
 * Note: bge models accept a `pooling: "cls"` input (recommended over the
 * default "mean"), but workers-ai-provider v4 forwards extra model settings as
 * `AiOptions` (the third `run()` argument), not as model inputs, so pooling
 * cannot be set through it. The model's default pooling ("mean") is used.
 */
export const EMBEDDING_CONFIG: EmbeddingConfig = {
  model: "@cf/baai/bge-large-en-v1.5",
  options: {},
};

export interface EmbeddingConfig {
  /** Workers AI model id */
  model: string;
  /** Settings passed to the provider's `textEmbedding()` */
  options: Record<string, unknown>;
}

export function createWorkersAIEmbedder(
  binding: Ai,
  config: EmbeddingConfig = EMBEDDING_CONFIG,
): Embedder {
  const model = createWorkersAI({ binding }).textEmbedding(
    config.model,
    config.options,
  );
  return {
    id: stableStringify(config),
    async embed(text: string): Promise<number[]> {
      const { embedding } = await embed({ model, value: text });
      return embedding;
    },
  };
}
