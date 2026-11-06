import { createHash } from "node:crypto";
import {
  appendFileSync,
  existsSync,
  mkdirSync,
  readFileSync,
  truncateSync,
} from "node:fs";
import { join } from "node:path";

export interface VectorCache {
  get(text: string): number[] | undefined;
  put(text: string, vector: number[]): void;
}

interface Entry {
  key: string;
  value: string;
  bytes: number;
}

const HEX_KEY = /^[0-9a-f]{64}$/;

const hash = (value: string): string =>
  createHash("sha256").update(value).digest("hex");

function parseLine(line: string): Entry | undefined {
  const parts = line.split("\t");
  if (parts.length !== 2) return undefined;
  const [key, value] = parts;
  if (!HEX_KEY.test(key) || !value || value.length % 4 !== 0) return undefined;
  const bytes = Buffer.from(value, "base64").length;
  return bytes > 0 && bytes % 4 === 0 ? { key, value, bytes } : undefined;
}

/** Cuts a line left by a killed run, so the next append starts a fresh one. */
function completeLines(file: string): string[] {
  const content = readFileSync(file, "utf8");
  const end = content.lastIndexOf("\n") + 1;
  if (end < content.length) truncateSync(file, end);
  return content.slice(0, end).split("\n");
}

function loadEntries(file: string): Map<string, string> {
  const entries = new Map<string, string>();
  let vectorBytes: number | undefined;
  for (const line of completeLines(file)) {
    const entry = parseLine(line);
    if (!entry) continue;
    vectorBytes ??= entry.bytes;
    if (entry.bytes === vectorBytes) entries.set(entry.key, entry.value);
  }
  return entries;
}

/** One append-only file per provider: `<text hash> <base64 Float32 vector>`. */
export function openVectorCache(dir: string, providerId: string): VectorCache {
  mkdirSync(dir, { recursive: true });
  const file = join(dir, `${hash(providerId).slice(0, 16)}.tsv`);
  const entries = existsSync(file) ? loadEntries(file) : new Map<string, string>();
  return {
    get(text) {
      const value = entries.get(hash(text));
      if (!value) return undefined;
      const bytes = Buffer.from(value, "base64");
      const floats = new Float32Array(
        bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.length),
      );
      return Array.from(floats);
    },
    put(text, vector) {
      const floats = new Float32Array(vector);
      if (!floats.every(Number.isFinite) || floats.every((x) => x === 0)) {
        throw new Error(`Won't cache a bad vector for: ${text.slice(0, 80)}`);
      }
      const key = hash(text);
      const value = Buffer.from(floats.buffer).toString("base64");
      entries.set(key, value);
      appendFileSync(file, `${key}\t${value}\n`);
    },
  };
}
