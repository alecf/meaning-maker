import type { EmbeddingProvider } from "./types";

/**
 * Keeps numbers whole, with sign, currency and decimals, so edits to them show.
 * A hyphen or dot after a letter or digit is punctuation, not part of the number.
 */
const TOKEN =
  /(?:[$€£]|(?<![\p{L}\p{N}])-)?(?:\d+(?:[.,]\d+)*|(?<![\p{L}\p{N}])\.\d+)|[\p{L}\p{N}']+/gu;

const normalize = (text: string): string =>
  text
    .normalize("NFC")
    .replaceAll("’", "'")
    .replaceAll("−", "-")
    .toLowerCase();

export const tokenize = (text: string): string[] =>
  (normalize(text).match(TOKEN) ?? [])
    .map((token) => token.replace(/^'+|'+$/g, ""))
    .filter((token) => token !== "");

/** Word counts over the batch's vocabulary, so triplets must share a batch. */
export function createBagOfWordsProvider(): EmbeddingProvider {
  return {
    id: "bag-of-words",
    batchScoped: true,
    async embedBatch(texts: string[]): Promise<number[][]> {
      const vocabulary = [...new Set(texts.flatMap(tokenize))];
      const index = new Map(vocabulary.map((word, i) => [word, i]));
      return texts.map((text) => {
        const vector = new Array<number>(vocabulary.length).fill(0);
        for (const word of tokenize(text)) vector[index.get(word) as number]++;
        return vector;
      });
    },
  };
}
