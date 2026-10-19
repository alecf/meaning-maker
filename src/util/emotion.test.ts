import { describe, expect, it } from "vitest";
import { createEmotionRegistry, type EmotionRegistry } from "./emotion";

function insertStyle(registry: EmotionRegistry, name: string, styles: string) {
  const { cache } = registry;
  cache.insert(`.${cache.key}-${name}`, { name, styles }, cache.sheet, true);
}

// Emotion's <Global> inserts with an empty selector.
function insertGlobal(registry: EmotionRegistry, name: string, styles: string) {
  const { cache } = registry;
  cache.insert("", { name, styles }, cache.sheet, true);
}

describe("createEmotionRegistry", () => {
  it("keeps SSR styles out of the rendered tree (compat mode)", () => {
    expect(createEmotionRegistry().cache.compat).toBe(true);
  });

  it("returns no tags when nothing has been inserted", () => {
    expect(createEmotionRegistry().flush()).toEqual([]);
  });

  it("flushes component styles into one tag", () => {
    const registry = createEmotionRegistry();
    insertStyle(registry, "abc", "color:red;");
    insertStyle(registry, "def", "color:blue;");

    expect(registry.flush()).toEqual([
      {
        dataEmotion: "css abc def",
        css: ".css-abc{color:red;}.css-def{color:blue;}",
      },
    ]);
  });

  it("gives each global style its own css-global tag, before the rest", () => {
    const registry = createEmotionRegistry();
    insertStyle(registry, "abc", "color:red;");
    insertGlobal(registry, "g1", "body{background:white;}");

    expect(registry.flush()).toEqual([
      { dataEmotion: "css-global g1", css: "body{background:white;}" },
      { dataEmotion: "css abc", css: ".css-abc{color:red;}" },
    ]);
  });

  it("flushes each style only once across stream chunks", () => {
    const registry = createEmotionRegistry();
    insertStyle(registry, "abc", "color:red;");
    registry.flush();

    insertStyle(registry, "abc", "color:red;");
    expect(registry.flush()).toEqual([]);

    insertStyle(registry, "def", "color:blue;");
    expect(registry.flush().map((tag) => tag.dataEmotion)).toEqual([
      "css def",
    ]);
  });
});
