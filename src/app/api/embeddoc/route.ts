import { createHash } from "crypto";
import { Level } from "level";
import { NextResponse } from "next/server";
import nnsplit from "nnsplit";
import { Configuration, OpenAIApi } from "openai";
import path from "path";
import { RichSentenceInfo, SentenceInfo } from "../../../types";
const dataDir = path.join(__dirname, "../../../../..");

let db: Level<string, RichSentenceInfo>;

declare namespace globalThis {
  let __db: Level<string, RichSentenceInfo>;
}

// Deal with dev server annoyance: process doesn't restart, but we can't
// reconnect to the db in the same process.
if (process.env.NODE_ENV === "production") {
  db = openDb();
} else {
  console.log("opening db...");
  if (!globalThis.__db) {
    globalThis.__db = openDb();
  }
  db = globalThis.__db;
}

function openDb(): Level<string, RichSentenceInfo> {
  const newdb = new Level<string, RichSentenceInfo>(
    path.join(dataDir, "embeddings"),
    {
      valueEncoding: "json",
    }
  );
  newdb.open();
  return newdb;
}

const openai = new OpenAIApi(
  new Configuration({ apiKey: process.env.OPENAI_API_KEY })
);
export async function POST(request: Request) {
  const body = await request.text();
  const nns = await nnsplit.NNSplit.new(path.join(dataDir, "model.onnx"), {});
  const textParagraphs = body.split("\n").filter((p) => !!p);
  const paragraphHunks = (await nns.split(textParagraphs)) as nnsplit.Split[];
  const paragraphs = paragraphHunks.map(({ parts }) =>
    parts.map(({ text }) => text as string)
  );

  // const sentences = sbd.sentences(body, { newline_boundaries: true });
  //   const sentences = split(body, {
  //     SeparatorParser: { separatorCharacters: [".", "!", "?", "\n"] },
  //   });
  console.log(
    "split into: ",
    paragraphs
    // sentences.map(({ raw }) => raw)
  );

  const response: SentenceInfo[][] = [];
  let previousEmbedding: number[] = [];
  for (const paragraph of paragraphs) {
    const si: SentenceInfo[] = [];
    for await (const {
      distance,
      sentence,
      embedding: newPreviousEmbedding,
    } of getEmbeddings(paragraph, previousEmbedding)) {
      previousEmbedding = newPreviousEmbedding;
      si.push({ distance, sentence });
    }
    response.push(si);
  }
  const r = {
    response,
  };
  return NextResponse.json(r);
}

interface SentenceWithAccumulation {
  sentence: string;
  accumulated: string;
}

async function* iterateCombos(
  sentences: string[],
  maxWindowSize = 8
): AsyncGenerator<SentenceWithAccumulation> {
  // The current window of content
  const contentWindow: string[] = [];
  // Accumulated for this particular sentence - includes all whitespace preceding a sentence
  const localAccumulated: string[] = [];
  for (const sentence of sentences) {
    contentWindow.push(sentence);

    localAccumulated.push(sentence);

    if (sentence.trim() !== "") {
      const currentSentence = localAccumulated.join("");
      localAccumulated.splice(0);

      trimToFitWindow(contentWindow, maxWindowSize);
      yield {
        sentence: currentSentence,
        accumulated: contentWindow.join(""),
      };
    }
  }
}

/** Remove leading non-whitespace content until the window is small enough */
function trimToFitWindow(contentWindow: string[], maxWindowSize: number) {
  const sentenceCount = contentWindow.filter((s) => s.trim() !== "").length;
  let removeCount = sentenceCount - maxWindowSize;

  while (removeCount > 0) {
    // remove one at a time until we've removed the requisite non-whitespace sentences
    const nextNodeIndex = contentWindow.findIndex((s) => s.trim() !== "");
    if (nextNodeIndex === -1) {
      break;
    }
    const [oldNode] = contentWindow.splice(nextNodeIndex, 1);
    if (oldNode.trim() !== "") {
      removeCount--;
    }
  }
}

async function getFromDb(s: string) {
  const hash = createHash("sha256").update(s).digest("hex");
  try {
    await db.open({ passive: true });
    const result = await db.get(hash);
    return result;
  } catch (ex: any) {
    if (ex.code !== "LEVEL_NOT_FOUND") {
      console.log("miss: ", ex);
    }
    return undefined;
  }
}
async function putIntoDb(s: string, value: RichSentenceInfo) {
  const hash = createHash("sha256").update(s).digest("hex");
  try {
    await db.open({ passive: true });

    await db.put(hash, value);
  } catch (ex) {
    console.log("failed to put: ", ex);
    return;
  }
}

function sum(values: number[]) {
  return values.reduce((a, b) => a + b, 0);
}
async function* getEmbeddings(
  sentences: string[],
  previousEmbedding: number[]
) {
  for await (const { accumulated, sentence } of iterateCombos(sentences)) {
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
    if (previousEmbedding.length) {
      const distance = cosine_similarity(embedding, previousEmbedding, 1000);
      console.log(
        "from ",
        sum(previousEmbedding),
        " to ",
        sum(embedding),
        "is",
        distance
      );
      const info: RichSentenceInfo = {
        sentence,
        distance,
        content: accumulated,
        embedding,
      };
      await putIntoDb(accumulated, info);
      yield info;
    } else {
      const info: RichSentenceInfo = {
        sentence,
        distance: 0,
        content: accumulated,
        embedding,
      };
      await putIntoDb(accumulated, info);
      yield info;
    }

    previousEmbedding = embedding;
  }
}

function cosine_similarity(
  vectorA: number[],
  vectorB: number[],
  scale: number = 1
): number {
  const dimensionality = Math.min(vectorA.length, vectorB.length);
  let dotAB = 0;
  let dotA = 0;
  let dotB = 0;
  let dimension = 0;
  while (dimension < dimensionality) {
    const componentA = vectorA[dimension];
    const componentB = vectorB[dimension];
    dotAB += componentA * componentB;
    dotA += componentA * componentA;
    dotB += componentB * componentB;
    dimension += 1;
  }

  const magnitude = Math.sqrt(dotA * dotB);
  return magnitude === 0 ? 0 : (dotAB * scale) / magnitude;
}
