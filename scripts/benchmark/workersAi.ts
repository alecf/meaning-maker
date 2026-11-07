import type { EmbeddingProvider } from "@/util/benchmark/types";
import { stableStringify } from "@/util/embedding";

export interface WorkersAiModel {
  name: string;
  /** bge-large only. Its schema is the one that accepts `pooling`. */
  pooling?: "mean" | "cls";
  prefix?: string;
  /** Defaults to 32, qwen3's limit. bge-large, bge-m3 and embeddinggemma allow 100. */
  batchSize?: number;
}

export function createWorkersAiProvider(
  ai: Ai,
  model: WorkersAiModel,
): EmbeddingProvider {
  const batchSize = model.batchSize ?? 32;
  const prefix = model.prefix ?? "";
  return {
    id: stableStringify({
      host: "workers-ai",
      name: model.name,
      pooling: model.pooling,
      prefix,
    }),
    async embedBatch(texts) {
      const vectors: number[][] = [];
      for (let i = 0; i < texts.length; i += batchSize) {
        const text = texts.slice(i, i + batchSize).map((t) => prefix + t);
        const input = model.pooling ? { text, pooling: model.pooling } : { text };
        const result = (await ai.run(model.name as never, input as never)) as {
          data?: number[][];
        };
        if (!result.data) throw new Error(`${model.name}: no data in response`);
        if (result.data.length !== text.length) {
          throw new Error(
            `${model.name} gave ${result.data.length} vectors for ${text.length} texts`,
          );
        }
        vectors.push(...result.data);
      }
      return vectors;
    },
  };
}
