import { RichSentenceInfo } from "@/types";
import { kv } from "@vercel/kv";
import { createHash } from "crypto";

export async function getFromDb(s: string): Promise<RichSentenceInfo | null> {
  const hash = createHash("sha256").update(s).digest("hex");
  return await kv.get<RichSentenceInfo>(hash);
}
export async function putIntoDb(s: string, value: RichSentenceInfo) {
  const hash = createHash("sha256").update(s).digest("hex");
  await kv.set(hash, value);
}
