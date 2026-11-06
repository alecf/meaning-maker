import type { EmbeddingProvider } from "@/util/benchmark/types";
import { stableStringify } from "@/util/embedding";

const URL = "https://openrouter.ai/api/v1/embeddings";
const CONCURRENCY = 4;
const MAX_RETRIES = 5;
const FIRST_WAIT_MS = 500;

export interface OpenRouterModel {
  /** OpenRouter's model id, such as `openai/text-embedding-3-small`. */
  name: string;
  /** The one upstream allowed to serve it, as OpenRouter names it. */
  upstream: string;
  prefix?: string;
  /** Sent as `input_type`. Leave unset for models that don't document one. */
  inputType?: string;
}

interface Options {
  sleep?: (ms: number) => Promise<void>;
}

interface EmbeddingResponse {
  provider?: string;
  data?: { embedding: number[] }[];
  error?: { message?: string };
}

/** Worth another try: the request was fine and the service wasn't. */
class TransientError extends Error {}

const wait = (ms: number): Promise<void> =>
  new Promise((resolve) => setTimeout(resolve, ms));

export function openRouterKey(env: Record<string, string | undefined>): string {
  const key = env.OPENROUTER_API_KEY;
  if (!key) {
    throw new Error("OPENROUTER_API_KEY is missing; add it to .env.benchmark.local");
  }
  return key;
}

function failure(name: string, status: number, body: EmbeddingResponse): string {
  return `${name}: ${status} ${body.error?.message ?? "no error message"}`;
}

async function parse(response: Response): Promise<EmbeddingResponse> {
  try {
    return (await response.json()) as EmbeddingResponse;
  } catch {
    return {};
  }
}

/**
 * Sends one text per request. Cohere's vector for a text changes with what's
 * batched beside it, and batching saves no money. Measured on 2026-11-06.
 */
export function createOpenRouterProvider(
  apiKey: string,
  model: OpenRouterModel,
  { sleep = wait }: Options = {},
): EmbeddingProvider {
  const prefix = model.prefix ?? "";

  async function attempt(text: string): Promise<number[]> {
    const response = await fetch(URL, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${apiKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model: model.name,
        input: [prefix + text],
        ...(model.inputType && { input_type: model.inputType }),
        provider: { order: [model.upstream], allow_fallbacks: false },
      }),
    }).catch((error: unknown) => {
      throw new TransientError(`${model.name}: ${String(error)}`);
    });
    const body = await parse(response);
    if (response.status === 429 || response.status >= 500 || (response.ok && body.error)) {
      throw new TransientError(failure(model.name, response.status, body));
    }
    if (!response.ok) throw new Error(failure(model.name, response.status, body));
    if (body.provider !== model.upstream) {
      throw new Error(`${model.name} came from ${body.provider}, not ${model.upstream}`);
    }
    if (body.data?.length !== 1) {
      throw new Error(`${model.name} gave ${body.data?.length ?? 0} vectors for 1 text`);
    }
    return body.data[0].embedding;
  }

  async function embed(text: string): Promise<number[]> {
    for (let retry = 0; ; retry++) {
      try {
        return await attempt(text);
      } catch (error) {
        if (!(error instanceof TransientError) || retry === MAX_RETRIES) throw error;
        await sleep(FIRST_WAIT_MS * 2 ** retry);
      }
    }
  }

  return {
    id: stableStringify({
      host: "openrouter",
      name: model.name,
      upstream: model.upstream,
      prefix,
      inputType: model.inputType,
    }),
    async embedBatch(texts) {
      const vectors: number[][] = new Array(texts.length);
      let next = 0;
      const worker = async (): Promise<void> => {
        while (next < texts.length) {
          const index = next++;
          try {
            vectors[index] = await embed(texts[index]);
          } catch (error) {
            next = texts.length;
            throw error;
          }
        }
      };
      await Promise.all(Array.from({ length: CONCURRENCY }, worker));
      return vectors;
    },
  };
}
