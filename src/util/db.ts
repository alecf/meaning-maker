import { RichSentenceInfo } from "@/types";
import { Redis } from "@upstash/redis";
import { createHash } from "crypto";

console.log(process.env.KV2_KV_REST_API_URL, process.env.KV2_KV_REST_API_TOKEN);
// Initialize Redis
const redis = new Redis({
  url: process.env.KV2_KV_REST_API_URL,
  token: process.env.KV2_KV_REST_API_TOKEN,
});

export async function getFromDb(s: string): Promise<RichSentenceInfo | null> {
  const hash = createHash("sha256").update(s).digest("hex");
  return await redis.get<RichSentenceInfo>(hash);
}
export async function putIntoDb(s: string, value: RichSentenceInfo) {
  const hash = createHash("sha256").update(s).digest("hex");
  await redis.set(hash, value);
}
