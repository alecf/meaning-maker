import { describe, expect, it } from "vitest";
import type { Triplet } from "@/util/benchmark/types";
import { atAllContexts, withContext } from "./context";

const triplet: Triplet = {
  id: "t",
  baseId: "t",
  category: "negation",
  anchor: "Anchor.",
  paraphrase: "Paraphrase.",
  edit: "Edit.",
  contextSentences: 0,
  status: "approved",
};
const filler = ["One.", "Two.", "Three.", "Four.", "Five.", "Six.", "Seven.", "Eight."];

describe("atAllContexts", () => {
  it("gives each triplet four versions under one baseId", () => {
    const rows = atAllContexts([triplet], filler);
    expect(rows.map((t) => t.contextSentences)).toEqual([0, 1, 3, 8]);
    expect(new Set(rows.map((t) => t.baseId)).size).toBe(1);
    expect(new Set(rows.map((t) => t.id)).size).toBe(4);
  });
});

describe("withContext", () => {
  it("leaves a bare triplet alone", () => {
    expect(withContext(triplet, filler, 0)).toEqual(triplet);
  });
  it("puts the last filler sentence directly before the text", () => {
    expect(withContext(triplet, filler, 1).anchor).toBe("Eight. Anchor.");
  });
  it("uses the last 3 filler sentences, in order", () => {
    expect(withContext(triplet, filler, 3).edit).toBe("Six. Seven. Eight. Edit.");
  });
  it("uses all 8 for the longest version", () => {
    expect(withContext(triplet, filler, 8).paraphrase).toBe(
      `${filler.join(" ")} Paraphrase.`,
    );
  });
  it("gives all three texts the same filler", () => {
    const { anchor, paraphrase, edit } = withContext(triplet, filler, 3);
    const lead = "Six. Seven. Eight. ";
    expect([anchor, paraphrase, edit].every((text) => text.startsWith(lead))).toBe(true);
  });
  it("keeps the baseId, and gives each length its own id", () => {
    const expanded = withContext(triplet, filler, 3);
    expect(expanded.baseId).toBe("t");
    expect(expanded.contextSentences).toBe(3);
    expect(expanded.id).not.toBe(withContext(triplet, filler, 8).id);
  });
  it("throws if there isn't enough filler", () => {
    expect(() => withContext(triplet, filler.slice(0, 2), 3)).toThrow(/3 sentences/);
  });
  it("throws on a triplet that already has context", () => {
    const expanded = withContext(triplet, filler, 1);
    expect(() => withContext(expanded, filler, 3)).toThrow(/already has context/);
  });
});
