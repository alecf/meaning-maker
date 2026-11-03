import type { SentenceInfo } from "@/types";
import { withEmbeddingCache } from "@/util/embedding";
import { createKVEmbeddingCache } from "@/util/kvEmbeddingCache";
import { extractParagraphs, getAllSentences } from "@/util/text";
import { createWorkersAIEmbedder } from "@/util/workersAiEmbedder";
import { getCloudflareContext } from "@opennextjs/cloudflare";
import { NextResponse } from "next/server";

export async function POST(request: Request) {
  const body = decodeURIComponent(await request.text());
  const { searchParams } = new URL(request.url);
  const maxWindowSize = parseInt(searchParams.get("window_size") ?? "8", 10);
  const minTokenLength = parseInt(searchParams.get("min_token_length") ?? "3", 10);
  const paragraphs = await extractParagraphs(body);

  const { env } = await getCloudflareContext({ async: true });
  const { AI, EMBED_CACHE } = env;
  const embedder = withEmbeddingCache(
    createWorkersAIEmbedder(AI),
    createKVEmbeddingCache(EMBED_CACHE),
  );

  const response: SentenceInfo[][] = await getAllSentences(
    paragraphs,
    embedder,
    maxWindowSize,
    minTokenLength,
  );
  const r = {
    response,
  };
  return NextResponse.json(r);
}
