import createCache, { type EmotionCache } from "@emotion/cache";

export interface EmotionStyleTag {
  /** Value for the tag's `data-emotion` attribute. */
  dataEmotion: string;
  css: string;
}

export interface EmotionRegistry {
  cache: EmotionCache;
  /**
   * Returns <style> tag contents for the styles inserted since the last
   * flush: one tag per global style, then one tag for all the others.
   */
  flush: () => EmotionStyleTag[];
}

/**
 * Creates an Emotion cache for server rendering under the Next.js App Router.
 *
 * Emotion's default cache renders each style as an inline <style> in <body>
 * during SSR. In compat mode, it keeps the CSS in `cache.inserted` instead, and
 * `flush` hands it to `useServerInsertedHTML`, which writes it into <head> (or,
 * for later stream chunks, after the hydrated tree). Each style is flushed
 * once, so streaming doesn't repeat earlier styles.
 *
 * Global styles get their own `<key>-global <name>` tags, the shape Emotion's
 * client-side <Global> looks for, so it can take the tag over and replace it
 * when the styles change (for example, `mode()` styles after the color mode
 * resolves to dark). Bundled into the shared tag, a stale global rule would
 * outlive its replacement.
 */
export function createEmotionRegistry(): EmotionRegistry {
  const cache = createCache({ key: "css" });
  cache.compat = true;

  let pending: { name: string; isGlobal: boolean }[] = [];
  // Only the server flushes. In the browser, Emotion inserts styles straight
  // into the document, and tracking them would only grow `pending`.
  if (typeof document === "undefined") {
    const insert = cache.insert;
    cache.insert = (...args) => {
      const [selector, serialized] = args;
      if (cache.inserted[serialized.name] === undefined) {
        pending.push({
          name: serialized.name,
          isGlobal: isGlobalInsert(selector, serialized.styles),
        });
      }
      return insert(...args);
    };
  }

  const flush = (): EmotionStyleTag[] => {
    const flushed = pending;
    pending = [];

    const tags: EmotionStyleTag[] = [];
    const names: string[] = [];
    let css = "";
    for (const { name, isGlobal } of flushed) {
      const rules = cache.inserted[name];
      if (typeof rules !== "string") {
        continue;
      }
      if (isGlobal) {
        tags.push({ dataEmotion: `${cache.key}-global ${name}`, css: rules });
      } else {
        names.push(name);
        css += rules;
      }
    }
    if (names.length > 0) {
      tags.push({ dataEmotion: `${cache.key} ${names.join(" ")}`, css });
    }
    return tags;
  };

  return { cache, flush };
}

/**
 * <Global> inserts with an empty selector. So do keyframes, which Emotion
 * inserts alongside the class (or global) that uses them; those belong in the
 * shared tag, where Emotion's own SSR puts them.
 */
function isGlobalInsert(selector: string, styles: string): boolean {
  return selector === "" && !styles.startsWith("@keyframes");
}
