# Semantic sensitivity benchmark: design

**Date:** 2026-11-05 | **Idea:** [Semantic sensitivity](../ideas/semantic-sensitivity.md)

## Goal

Find out which embedding models notice small edits that change a sentence's meaning, and publish the results as a page with a heatmap, triplet drill-down and a live box for testing your own sentences.

A triplet has an anchor, a paraphrase and an edit. It passes if the paraphrase is strictly closer to the anchor than the edit is.

## Decisions

| Decision | Choice |
|---|---|
| Models | Open and paid, chosen by evidence of real use plus recent launches |
| Code | TypeScript in this repo, so batch and live share one scoring module |
| Page | `/benchmark` in the Next app, since the live box needs an API route |
| Heavy work | Local through Ollama, on the laptop |
| Live box | Workers AI models only, with no runtime secrets |
| Paid models | Precomputed only, ideally through one OpenRouter key kept in an untracked local file |
| Triplet review | Claude drafts and critiques about 130; Alec approves the shortlist |

Ollama is never used in production.

## Models for round one

Chosen on 2026-11-05. Hugging Face downloads and Ollama pulls are proxies for use, and paid APIs publish no usage data.

| Group | Model | Runs on |
|---|---|---|
| Common defaults | OpenAI text-embedding-3-small, text-embedding-3-large | OpenRouter |
| | all-MiniLM-L6-v2 | Ollama |
| | bge-m3 | Ollama, Workers AI |
| | all-mpnet-base-v2 | OpenRouter |
| | nomic-embed-text | Ollama |
| | mxbai-embed-large | Ollama |
| Newest | Cohere Embed 5 Pro | OpenRouter |
| | Voyage 4 Large | OpenRouter |
| | Gemini Embedding 2 | OpenRouter |
| | EmbeddingGemma 2 | Ollama |
| Live on the site | bge-large, `cls` pooling | Ollama, Workers AI |
| | bge-large, mean pooling | Workers AI |
| | qwen3-embedding-0.6b | Ollama, Workers AI |
| | embeddinggemma (v1) | Ollama, Workers AI |
| Floor | Bag-of-words | Local |

## System

**Providers.** An `EmbeddingProvider` interface takes a list of texts and returns vectors. There is one adapter each for Workers AI, Ollama and OpenRouter. Bag-of-words is a provider too, so it's scored the same way. Each model is marked `live` or `batch-only`.

**Batch-scoped providers.** A provider can set `batchScoped`, which means its vectors are only comparable within one `embedBatch` call. Callers must not cache those vectors or split a triplet across batches. Bag-of-words is batch-scoped, because its vocabulary comes from the batch, so it skips the cache.

**Batch step.** `npm run benchmark` embeds every text with every model, caches vectors on disk, and writes a results JSON file. Reruns only pay for what changed, and progress is saved as it goes so a failed run can resume. Results are committed; vectors are not. [Concept orthogonality](../ideas/concept-orthogonality.md) can reuse the cache.

**Page.** The heatmap and drill-down render from the results JSON. A new API route scores submitted sentences on the `live` models.

## Running on Ollama

Local runs share one laptop, so the runner must never make Ollama swap models:

- Run one model at a time, with one request in flight. Finish all of a model's texts before moving on, and never interleave models.
- Before starting a model, check `/api/ps`. If another model is loaded, wait for it to go. Don't unload something the runner didn't load.
- After a model finishes, unload it with `keep_alive: 0` and confirm `/api/ps` is empty.
- Before a run, embed the longest texts one at a time and stop if `prompt_eval_count` reaches the model's limit. Ollama truncates silently and only reports token totals per batch.
- Use each model's documented task prefixes, and record them with the results.

Measured on 2026-11-05 on an M2 Max with 32 GB, at 53 to 125 short texts per second:

| Model | Texts/s | Memory | Pooling | Truncates at (tokens) |
|---|---|---|---|---|
| all-minilm | 125 | 26 MB | mean | 256 |
| nomic-embed-text | 102 | 336 MB | mean | over 1,297 |
| embeddinggemma | 77 | 686 MB | mean | over 1,258 |
| embeddinggemma-2 | 67 | 1.3 GB | not reported | over 1,258 |
| bge-m3 | 62 | 689 MB | `cls` | over 1,379 |
| bge-large | 62 | 625 MB | `cls` | 512 |
| mxbai-embed-large | 60 | 625 MB | `cls` | 512 |
| qwen3-embedding:0.6b | 53 | 4.8 GB | last token | over 1,257 |

The core set is about 1,080 texts per model, which takes under 30 seconds per model. PAWS at about 200,000 texts would take about 6 hours across all eight, so it stays an overnight job. The 8-sentence paragraphs came to about 145 tokens, under every limit.

Disk is the tightest resource, with 23 GB free at 98% full. PAWS keeps pair similarities only, never vectors. Set `num_ctx` on qwen3 to cut its memory use.

## Calibration

The same model name doesn't guarantee the same vectors across hosts, because quantization, pooling and task prompts can differ.

For each model on both Ollama and Workers AI, run about 100 triplets on both hosts and compare the vectors and the pass or fail verdicts. A model counts as interchangeable only if the verdicts match. Otherwise it gets two rows, or the page says live scores can differ from the heatmap.

## Test set

- **Categories:** negation, swapped roles, quantifiers, numbers, antonyms and negation scope, with about 15 triplets each.
- **Balance:** the paraphrase and the edit are about the same length.
- **Swapped roles:** the edit uses exactly the same words as the anchor, so bag-of-words can't separate them.
- **Paraphrases:** they must not simply copy the anchor with one word changed.
- **Paragraphs:** each triplet gets the same neutral surrounding sentences on all three versions, with about 1, 3 and 8 sentences of context.
- **Format:** one JSONL file with base id, category, anchor, paraphrase, edit and review status. Only approved rows reach the benchmark.
- **Outside check:** PAWS, run overnight through Ollama.

## Scoring

- A tie is a fail. A margin up to `TIE_TOLERANCE` (1e-6) counts as a tie, because vectors are cached as Float32 and exact ties can land just above zero.
- Each model gets a pass rate per category and overall, with Wilson 95% score intervals across triplets. Wilson keeps a real interval at 0/15 and 15/15, where a bootstrap collapses to zero width.
- Results must be independent. All context lengths of one triplet share a `baseId`, and the same `baseId` is never pooled in one interval. Intervals are computed per `contextSentences` value, and headline and category numbers use bare sentences.
- Margins are stored, so the drill-down can separate clear passes from near misses.
- A model that fails to run, or returns vectors `scoreTriplet` rejects, is reported as missing, never scored as zero.

## Live box

Each model succeeds or fails on its own. The route enforces per-IP rate limits and a character limit, and the page says live scores come from Workers AI.

Workers AI gives 10,000 neurons a day at no charge, reset at 00:00 UTC, and the main app shares that allowance. One submission costs roughly 1.3 neurons across bge-large, bge-m3 and qwen3. Beyond the allowance, Workers Free returns errors and Workers Paid charges $0.011 per 1,000 neurons. On Paid, the route needs its own daily cap. The box shows a clear message when it's out of quota.

embeddinggemma has no listed price, so it stays out of the box unless calibration shows it's cheap.

## Build order

1. Build the provider adapters and scoring, then calibrate Ollama against Workers AI.
2. Draft the triplets and get the shortlist approved.
3. Run the benchmark and PAWS.
4. Check results against the idea's kill criteria. If all semantic models score about the same, stop and review before building the page.
5. Build `/benchmark`: heatmap, drill-down and live box.

## Testing

Vitest covers scoring, ties, Wilson intervals, resuming a run, adapters with mocked providers, and the API route's limits.

## Open questions

- Does OpenRouter pass through settings like Cohere's `input_type`, and do its vectors match the direct APIs?
- Which task prefixes should nomic-embed-text, embeddinggemma, EmbeddingGemma 2 and qwen3 use?
- Is the Cloudflare account on Workers Free or Workers Paid?
