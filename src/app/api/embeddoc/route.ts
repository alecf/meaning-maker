import { SentenceInfo } from "@/types";
import { dataDir } from "@/util/db";
import { extractParagraphs, getAllSentences } from "@/util/text";
import { NextResponse } from "next/server";
import nnsplit from "nnsplit";
import path from "path";

export async function POST(request: Request) {
  const body = decodeURIComponent(await request.text());
  const nns: nnsplit.NNSplit = await nnsplit.NNSplit.new(
    path.join(dataDir, "model.onnx"),
    {}
  );
  const { searchParams } = new URL(request.url);
  const maxWindowSize = parseInt(searchParams.get("window_size") ?? "8");
  const minTokenLength = parseInt(searchParams.get("min_token_length") ?? "3");
  const paragraphs = await extractParagraphs(body, nns);

  console.log(
    "split into: ",
    paragraphs
    // sentences.map(({ raw }) => raw)
  );

  const response: SentenceInfo[][] = await getAllSentences(
    paragraphs,
    maxWindowSize,
    minTokenLength
  );
  const r = {
    response,
  };
  return NextResponse.json(r);
}
