import { RichSentenceInfo, SentenceInfo } from "@/types";
import { NNSplit, Split } from "nnsplit";
import { Configuration, OpenAIApi } from "openai";
import { getFromDb, putIntoDb } from "./db";
import { cosine_similarity, trimToFitWindow } from "./util";

export const openai = new OpenAIApi(
  new Configuration({ apiKey: process.env.OPENAI_API_KEY })
);

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
  maxWindowSize: number
): AsyncGenerator<SentenceWithAccumulation> {
  // The current window of content
  const contentWindow: string[] = [];
  // Accumulated for this particular sentence - includes all whitespace preceding a sentence
  const localAccumulated: string[] = [];
  for (const sentence of sentences) {
    contentWindow.push(sentence);

    localAccumulated.push(sentence);
    if (sentence.trim() === "") {
      continue;
    }

    const currentSentence = localAccumulated.join(" ");
    localAccumulated.splice(0);

    trimToFitWindow(contentWindow, maxWindowSize);
    yield {
      sentence: currentSentence,
      accumulated: contentWindow.join(" "),
    };
  }
}

export async function extractParagraphs(body: string, nns: NNSplit) {
  const textParagraphs = body.split("\n").filter((p) => !!p);
  const paragraphHunks: Split[] = await nns.split(textParagraphs);
  const paragraphs = paragraphHunks.map(({ parts }) =>
    parts.map(({ text }) => text as string)
  );
  return paragraphs;
}

export async function getAllSentences(
  paragraphs: string[][],
  maxWindowSize: number
) {
  const response: SentenceInfo[][] = [];
  let previousEmbedding: number[] = [];
  for (const paragraph of paragraphs) {
    const si: SentenceInfo[] = [];
    for await (const {
      distance,
      sentence,
      embedding: newPreviousEmbedding,
    } of iterateEmbeddings(paragraph, previousEmbedding, maxWindowSize)) {
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
  maxWindowSize: number
) {
  for await (const { accumulated, sentence } of iterateTextWindows(
    sentences,
    maxWindowSize
  )) {
    console.log("sentence: ", sentence);
    // check cache first
    const result = await getFromDb(accumulated);
    if (result) {
      yield result;
      continue;
    }

    const embedResponse = await openai.createEmbedding({
      model: "text-embedding-ada-002",
      input: accumulated,
    });
    const embedding = embedResponse.data.data[0].embedding;
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
