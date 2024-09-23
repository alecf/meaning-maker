import { RichSentenceInfo, SentenceInfo } from "@/types";
import { getFromDb, putIntoDb } from "@/util/db";
import { encode } from "gpt-3-encoder";
import OpenAI from "openai";
import { split } from "sentence-splitter";
import { cosine_similarity, trimToFitWindow } from "./util";
export const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });

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
 */
export async function* iterateTextWindows(
  sentences: string[],
  maxWindowSize: number,
  minTokenLength: number,
): AsyncGenerator<SentenceWithAccumulation> {
  console.log("iterateTextWindows", sentences.length, "sentences");
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
    const sentenceTokens = encode(localAccumulated.join(" "));

    if (sentenceTokens.length <= minTokenLength) {
      console.log(
        "wasnt enough: ",
        sentence,
        ", ",
        sentenceTokens.length,
        localAccumulated,
      );
      continue;
    }

    // if we got this far, we have a big enough sentence to
    const currentSentence = localAccumulated.join(" ");
    localAccumulated.splice(0);
    contentWindow.push(currentSentence);

    trimToFitWindow(contentWindow, maxWindowSize);
    yield {
      sentence: currentSentence,
      accumulated: contentWindow.join(" "),
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
  maxWindowSize: number,
  minTokenLength: number,
) {
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
  previousEmbedding: number[],
  maxWindowSize: number,
  minTokenLength: number,
) {
  for await (const { accumulated, sentence } of iterateTextWindows(
    sentences,
    maxWindowSize,
    minTokenLength,
  )) {
    // check cache first
    const result = await getFromDb(accumulated);
    if (result) {
      yield result;
      continue;
    }

    const embedResponse = await openai.embeddings.create({
      model: "text-embedding-3-small",
      input: accumulated,
    });
    const embedding = embedResponse.data[0].embedding;
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
    await putIntoDb(accumulated, info);
    yield info;
  }
}
