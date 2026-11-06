import type { EmbeddingProvider } from "./types";

/** Keeps numbers whole, with sign, currency and decimals, so edits to them show. */
const TOKEN = /[$€£-]?\d+(?:[.,]\d+)*|[\p{L}\p{N}']+/gu;

const words = (text: string): string[] =>
  (text.normalize("NFC").replaceAll("\u2019", "'").toLowerCase().match(TOKEN) ?? [])
    .map((token) => token.replace(/^'+|'+$/g, ""))
    .filter((token) => token !== "");

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
