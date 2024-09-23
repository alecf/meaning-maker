import { SentenceInfo } from "@/types";
import { extractParagraphs, getAllSentences } from "@/util/text";
import { NextResponse } from "next/server";

export async function POST(request: Request) {
  const body = decodeURIComponent(await request.text());
  const { searchParams } = new URL(request.url);
  const maxWindowSize = parseInt(searchParams.get("window_size") ?? "8");
  const minTokenLength = parseInt(searchParams.get("min_token_length") ?? "3");
  const paragraphs = await extractParagraphs(body);

  console.log(
    "split into: ",
    paragraphs,
    // sentences.map(({ raw }) => raw)
  );

  const response: SentenceInfo[][] = await getAllSentences(
    paragraphs,
    maxWindowSize,
    minTokenLength,
  );
  const r = {
    response,
  };
  return NextResponse.json(r);
}
