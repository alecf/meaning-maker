# Surprise score

**Status:** Idea | **Effort:** M | **Depends on:** none

## Introduction

A sentence can be distant from what came before and still be predictable, or close to it and still be surprising. This idea measures surprise directly.

Give an LLM the text so far, and have it write the next sentence about 10 times. Embed those predictions, then measure where the real sentence falls relative to that cloud. This separates "changed the subject" from "said something you couldn't have predicted".

## Inputs

- An LLM.
- An embedding model.
- A cloud of predictions for each sentence, which means many LLM calls per document.

## Assumptions

- **Predictions are varied enough.** The LLM may produce near-identical guesses. Test with different temperatures.
- **The LLM predicts well.** If predictions are poor, everything looks surprising. Test on texts with known predictable passages, such as cliches.
- **Costs are workable.** A 30-sentence text needs about 300 generations. Test whether fewer samples give a stable result, or use it only on precomputed examples.

## Building the corpus

No large corpus. Examples for a static version would need predictions generated in advance, using the same pipeline.

## How we'll know

- **Confirmed:** scores match human judgments of surprise better than the existing score, and clichés and plot twists land where you'd expect.
- **Killed:** scores just repeat the existing measure, or need too many samples to be stable.

## End product

Precomputed examples first, showing surprise beside other novelty scores. If costs allow, a slower live analysis of the user's own text.
