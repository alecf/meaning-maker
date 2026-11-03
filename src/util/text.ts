import type { RichSentenceInfo, SentenceInfo } from "@/types";
import DataLoader from "dataloader";
import { split } from "sentence-splitter";
import type { Embedder } from "./embedding";
import { countTokens, MAX_INPUT_TOKENS, truncateToTokens } from "./tokenizer";
import { cosine_similarity, trimToFitWindow } from "./util";

/** [CLS] and [SEP], added by the BERT tokenizer to every input */
const SPECIAL_TOKENS_PER_INPUT = 2;

interface SentenceWithAccumulation {
  sentence: string;
  accumulated: string;
}

/**
 * Emit a rolling window of content, e.g. given an array ["a", "b", "c", " ",
 * "d", "e"] and a window of 3, emits
 *
 * ```
 * "a", "a"
 * "b", "a b",
 * "c", "a b c"
 * "d", "b c d"
 * "e", "c d e"
 * ```
 *
 * The window is additionally trimmed (oldest sentences first) so that it fits
 * within `maxInputTokens` of the embedding model. A single sentence that is
 * longer than that on its own is truncated to fit.
 */
export async function* iterateTextWindows(
  sentences: string[],
  maxWindowSize: number,
  minTokenLength: number,
  maxInputTokens: number = MAX_INPUT_TOKENS,
): AsyncGenerator<SentenceWithAccumulation> {
  // The current window of content
  const contentWindow: string[] = [];

  // Accumulated for this particular sentence - includes all whitespace preceding a sentence
  const localAccumulated: string[] = [];

  for (const sentence of sentences) {
    // Ignore totally blank space
    if (!sentence.trim()) {
      console.log("skipping ", [sentence]);
      continue;
    }
    localAccumulated.push(sentence);
    // Exclude [CLS]/[SEP] so the threshold counts only content tokens
    const sentenceTokenCount =
      countTokens(localAccumulated.join(" ")) - SPECIAL_TOKENS_PER_INPUT;

    if (sentenceTokenCount <= minTokenLength) {
      console.warn(
        "wasnt enough: ",
        sentence,
        ", ",
        sentenceTokenCount,
        localAccumulated,
      );
      continue;
    }

    // if we got this far, we have a big enough sentence to
    const currentSentence = localAccumulated.join(" ");
    localAccumulated.splice(0);
    contentWindow.push(currentSentence);

    trimToFitWindow(contentWindow, maxWindowSize);
    let accumulated = contentWindow.join(" ");
    while (contentWindow.length > 1 && countTokens(accumulated) > maxInputTokens) {
      contentWindow.shift();
      accumulated = contentWindow.join(" ");
    }
    yield {
      sentence: currentSentence,
      accumulated: truncateToTokens(accumulated, maxInputTokens),
    };
  }
}

export async function extractParagraphs(body: string) {
  const paragraphHunks = split(body);
  const paragraphs = paragraphHunks.reduce<string[][]>(
    (acc, hunk) => {
      if (hunk.type === "Sentence") {
        acc[acc.length - 1].push(hunk.raw);
        return acc;
      }
      if (hunk.type === "WhiteSpace") {
        if (hunk.raw.replace(/ +?/g, "")) {
          acc.push([]);
        }
        return acc;
      }
      console.log("unkonwn node type: ", hunk.type);
      return acc;
    },
    [[]] as string[][],
  );

  return paragraphs;
}

export async function getAllSentences(
  paragraphs: string[][],
  embedder: Embedder,
  maxWindowSize: number,
  minTokenLength: number,
): Promise<SentenceInfo[][]> {
  const response: SentenceInfo[][] = [];
  let previousEmbedding: number[] = [];
  for (const paragraph of paragraphs) {
    const si: SentenceInfo[] = [];
    for await (const {
      distance,
      sentence,
      embedding: newPreviousEmbedding,
    } of iterateEmbeddings(
      paragraph,
      embedder,
      previousEmbedding,
      maxWindowSize,
      minTokenLength,
    )) {
      previousEmbedding = newPreviousEmbedding;
      si.push({ distance, sentence });
    }
    response.push(si);
  }
  return response;
}

async function* iterateEmbeddings(
  sentences: string[],
  embedder: Embedder,
  previousEmbedding: number[],
  maxWindowSize: number,
  minTokenLength: number,
) {
  const embeddingsLoader = new DataLoader<string, number[]>(
    async (keys: readonly string[]) => [await embedder.embed(keys[0])],
    { batch: false, cache: true },
  );

  const embeddingsPromises: {
    accumulated: string;
    sentence: string;
    embeddingPromise: Promise<number[]>;
  }[] = [];

  for await (const { accumulated, sentence } of iterateTextWindows(
    sentences,
    maxWindowSize,
    minTokenLength,
  )) {
    embeddingsPromises.push({
      accumulated,
      sentence,
      embeddingPromise: embeddingsLoader.load(accumulated),
    });
  }

  for (const {
    accumulated,
    sentence,
    embeddingPromise,
  } of embeddingsPromises) {
    const embedding = await embeddingPromise;
    const distance = previousEmbedding.length
      ? cosine_similarity(embedding, previousEmbedding)
      : 0;
    const info: RichSentenceInfo = {
      sentence,
      distance,
      content: accumulated,
      embedding,
    };
    previousEmbedding = embedding;
    yield info;
  }
}
