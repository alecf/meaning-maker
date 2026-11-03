import { Tokenizer } from "@huggingface/tokenizers";
// Vendored from https://huggingface.co/BAAI/bge-large-en-v1.5 and imported as
// JSON so they bundle into the Worker (no filesystem access at runtime).
import tokenizerConfig from "./bge-large-en-v1.5/tokenizer_config.json";
import tokenizerJson from "./bge-large-en-v1.5/tokenizer.json";

/** Maximum input length of bge-large-en-v1.5, including [CLS] and [SEP]. */
export const MAX_INPUT_TOKENS = 512;

let _tokenizer: Tokenizer | null = null;
function getTokenizer(): Tokenizer {
  if (!_tokenizer) {
    _tokenizer = new Tokenizer(tokenizerJson, tokenizerConfig);
  }
  return _tokenizer;
}

/** Number of tokens the embedding model sees for `text`, special tokens included. */
export function countTokens(text: string): number {
  return getTokenizer().encode(text).ids.length;
}

/**
 * Truncate `text` so that it encodes to at most `maxTokens` tokens (special
 * tokens included). Returns the text unchanged when it already fits. The
 * truncated text is reconstructed by decoding the kept token ids, so it is
 * lowercased/normalized the way the (uncased) model sees it.
 */
export function truncateToTokens(text: string, maxTokens: number): string {
  const tokenizer = getTokenizer();
  const { ids } = tokenizer.encode(text);
  if (ids.length <= maxTokens) {
    return text;
  }
  // Drop the trailing [SEP], keep [CLS] + content up to the budget; decoding
  // skips the special tokens and re-encoding adds them back.
  return tokenizer.decode(ids.slice(0, maxTokens - 1), {
    skip_special_tokens: true,
  });
}
