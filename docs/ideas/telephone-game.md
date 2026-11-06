# Telephone game

**Status:** Idea | **Effort:** M | **Depends on:** none

## Introduction

Have an LLM paraphrase a text, then paraphrase the result, and repeat. Does the meaning decay steadily? Does everything collapse into the same bland attractor? Do different LLMs end up in different places?

## Inputs

- Source texts across genres.
- Several LLMs.
- A single embedding model.

## Assumptions

- **Drift is measurable and gradual.** LLMs may change little, then jump. Test with a few pilot chains.
- **Attractors exist.** If chains from different sources converge, their distance should shrink over time. Test directly.
- **Paraphrasing instructions don't shape the result.** Test with several prompt wordings.
- **Embeddings notice the facts that drift.** Add fact checks at each generation, because details may vanish while vectors barely move.

## Building the corpus

1. Choose about 20 source texts.
2. Run 50 generations per text, per LLM, with several chains each.
3. Embed each generation.
4. Store the rewrites, which [Derivation detection](derivation-detection.md) can reuse.

## How we'll know

- **Confirmed:** chains show a clear pattern, like steady decay or convergence, that repeats across sources and prompts.
- **Killed:** drift looks random, or chains barely move after many generations.

## End product

An interactive page. Users pick a text and scrub through generations while watching the text change and the drift chart grow. A later version could run a shorter live chain on their own text.
