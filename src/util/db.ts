import { RichSentenceInfo } from "@/types";
import { Redis } from "@upstash/redis";
import { createHash } from "crypto";

let _redis: Redis | null = null;
function getRedis() {
  if (!_redis) {
    _redis = new Redis({
      url: process.env.KV_REST_API_URL!,
      token: process.env.KV_REST_API_TOKEN!,
    });
  }
  return _redis;
}

export async function getFromDb(s: string): Promise<RichSentenceInfo | null> {
  const hash = createHash("sha256").update(s).digest("hex");
  return await getRedis().get<RichSentenceInfo>(hash);
}
export async function putIntoDb(s: string, value: RichSentenceInfo) {
  const hash = createHash("sha256").update(s).digest("hex");
  await getRedis().set(hash, value);
}
