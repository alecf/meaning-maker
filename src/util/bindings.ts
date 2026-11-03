import type { Ai, KVNamespace } from "@cloudflare/workers-types";

/**
 * The Worker bindings this app needs. Binding names are a fixed contract with
 * the wrangler config.
 */
export interface AppBindings {
  /** Workers AI */
  AI: Ai;
  /** KV namespace used as the embedding cache */
  EMBED_CACHE: KVNamespace;
}
