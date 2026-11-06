import type { EmbeddingProvider } from "./types";

const words = (text: string): string[] =>
  text.toLowerCase().match(/[\p{L}\p{N}']+/gu) ?? [];

/** Word counts over the batch's vocabulary, so triplets must share a batch. */
export function createBagOfWordsProvider(): EmbeddingProvider {
  return {
    id: "bag-of-words",
    async embedBatch(texts: string[]): Promise<number[][]> {
      const vocabulary = [...new Set(texts.flatMap(words))];
      const index = new Map(vocabulary.map((word, i) => [word, i]));
      return texts.map((text) => {
        const vector = new Array<number>(vocabulary.length).fill(0);
        for (const word of words(text)) vector[index.get(word) as number]++;
        return vector;
      });
    },
  };
}
