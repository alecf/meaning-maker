import { createHash } from "node:crypto";
import {
  appendFileSync,
  mkdtempSync,
  readdirSync,
  readFileSync,
  rmSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { openVectorCache } from "./vectorCache";

const key = (text: string): string =>
  createHash("sha256").update(text).digest("hex");
const encode = (vector: number[]): string =>
  Buffer.from(new Float32Array(vector).buffer).toString("base64");

describe("openVectorCache", () => {
  let dir: string;
  const cacheFile = (): string => join(dir, readdirSync(dir)[0]);

  beforeEach(() => {
    dir = mkdtempSync(join(tmpdir(), "vector-cache-"));
  });
  afterEach(() => {
    rmSync(dir, { recursive: true });
  });

  it("reads back a vector across opens, within Float32 precision", () => {
    openVectorCache(dir, "p").put("hello", [0.1, 0.2, 0.3]);
    const vector = openVectorCache(dir, "p").get("hello");
    expect(vector).toHaveLength(3);
    expect(vector?.[1]).toBeCloseTo(0.2, 6);
  });
  it("misses a text it hasn't seen", () => {
    expect(openVectorCache(dir, "p").get("hello")).toBeUndefined();
  });
  it("keeps provider ids apart", () => {
    openVectorCache(dir, "one").put("hello", [1, 2]);
    expect(openVectorCache(dir, "two").get("hello")).toBeUndefined();
  });
  it("ignores a truncated last line and keeps earlier entries", () => {
    openVectorCache(dir, "p").put("good", [1, 2, 3, 4]);
    appendFileSync(cacheFile(), `${key("cut")}\t${encode([1, 2, 3, 4]).slice(0, 9)}`);
    const cache = openVectorCache(dir, "p");
    expect(cache.get("good")).toEqual([1, 2, 3, 4]);
    expect(cache.get("cut")).toBeUndefined();
  });
  it("skips an entry whose vector length differs from the first entry's", () => {
    openVectorCache(dir, "p").put("good", [1, 2, 3, 4]);
    appendFileSync(cacheFile(), `${key("short")}\t${encode([1, 2])}\n`);
    const cache = openVectorCache(dir, "p");
    expect(cache.get("good")).toEqual([1, 2, 3, 4]);
    expect(cache.get("short")).toBeUndefined();
  });
  it.each([
    ["NaN", [1, Number.NaN]],
    ["Infinity", [1, Number.POSITIVE_INFINITY]],
    ["a value too large for Float32", [1, 1e39]],
    ["an all-zero vector", [0, 0]],
    ["values that round to zero in Float32", [1e-50, 0]],
    ["an empty vector", []],
  ])("refuses to store %s", (_name, vector) => {
    const cache = openVectorCache(dir, "p");
    expect(() => cache.put("bad", vector)).toThrow(/bad vector/);
    expect(cache.get("bad")).toBeUndefined();
    expect(openVectorCache(dir, "p").get("bad")).toBeUndefined();
  });
  it("doesn't turn a line cut 64 characters short into a garbage vector", () => {
    const whole = encode(new Array<number>(48).fill(0.5));
    openVectorCache(dir, "p").put("first", new Array<number>(48).fill(1));
    appendFileSync(cacheFile(), `${key("killed")}\t${whole.slice(0, -64)}`);

    openVectorCache(dir, "p").put("next", new Array<number>(48).fill(0.25));

    const cache = openVectorCache(dir, "p");
    expect(cache.get("killed")).toBeUndefined();
    expect(cache.get("next")).toEqual(new Array<number>(48).fill(0.25));
    expect(cache.get("first")).toEqual(new Array<number>(48).fill(1));
  });
  it("drops a partial first line, so it can't set the vector length", () => {
    openVectorCache(dir, "p").put("seed", [1, 2, 3, 4]);
    rmSync(cacheFile());
    appendFileSync(
      join(dir, `${key("p").slice(0, 16)}.tsv`),
      `${key("killed")}\t${encode([1, 2])}`,
    );

    openVectorCache(dir, "p").put("next", [1, 2, 3, 4]);

    const cache = openVectorCache(dir, "p");
    expect(cache.get("killed")).toBeUndefined();
    expect(cache.get("next")).toEqual([1, 2, 3, 4]);
  });
  it("drops a partial line even when nothing is written afterwards", () => {
    openVectorCache(dir, "p").put("good", [1, 2]);
    appendFileSync(cacheFile(), `${key("cut")}\t${encode([3, 4])}`);
    openVectorCache(dir, "p");
    expect(readFileSync(cacheFile(), "utf8").endsWith("\n")).toBe(true);
    expect(openVectorCache(dir, "p").get("cut")).toBeUndefined();
  });
  it.each([
    ["three fields", `${key("bad")}\tAAAAAAAA\tAAAAAAAA\n`],
    ["a key that isn't hex", `${"z".repeat(64)}\tAAAAAAAA\n`],
    ["a short key", `abc\tAAAAAAAA\n`],
    ["base64 of the wrong length", `${key("bad")}\tAAAAAAA\n`],
    ["bytes that aren't whole floats", `${key("bad")}\tAAAA\n`],
    ["an empty value", `${key("bad")}\t\n`],
  ])("skips a line with %s", (_name, line) => {
    openVectorCache(dir, "p").put("good", [1, 2]);
    appendFileSync(cacheFile(), line);
    const cache = openVectorCache(dir, "p");
    expect(cache.get("good")).toEqual([1, 2]);
    expect(cache.get("bad")).toBeUndefined();
  });
});
