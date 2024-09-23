import { RichSentenceInfo } from "@/types";
import { kv } from "@vercel/kv";
import { createHash } from "crypto";
import { Level } from "level";
import path from "path";

export const dataDir = path.join(__dirname, "../../../../..");
let db: Level<string, RichSentenceInfo>;

declare namespace globalThis {
  let __db: Level<string, RichSentenceInfo>;
}
// Deal with dev server annoyance: process doesn't restart, but we can't
// reconnect to the db in the same process.
if (process.env.NODE_ENV === "production") {
  db = openDb();
} else {
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
    },
  );
  newdb.open();
  return newdb;
}
export async function getFromDb(s: string): Promise<RichSentenceInfo | null> {
  const hash = createHash("sha256").update(s).digest("hex");
  return await kv.get<RichSentenceInfo>(hash);
  // try {
  //   await db.open({ passive: true });
  //   const result = await db.get(hash);
  //   return result;
  // } catch (ex: any) {
  //   if (ex.code !== "LEVEL_NOT_FOUND") {
  //     console.log("miss: ", ex);
  //   }
  //   return undefined;
  // }
}
export async function putIntoDb(s: string, value: RichSentenceInfo) {
  const hash = createHash("sha256").update(s).digest("hex");
  await kv.set(hash, value);
  // try {
  //   await db.open({ passive: true });

  //   await db.put(hash, value);
  // } catch (ex) {
  //   console.log("failed to put: ", ex);
  //   return;
  // }
}
