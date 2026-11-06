# Residual novelty

**Status:** Idea | **Effort:** S | **Depends on:** none

## Introduction

Meaning Maker currently compares each window with the previous one. This idea asks a more literal version of the question: how much of the new window can't be explained by what came before?

Project the new window's embedding onto the space spanned by earlier windows, using Gram-Schmidt, and measure what's left over. A large remainder means new information.

This has to use windows or other context. Isolated sentences would misread lines like "I was swimming in molasses", which only have meaning next to the sentence before them.

## Inputs

- Window embeddings for each sentence.
- A choice of how much history to span: the last few windows, or the whole document.

## Assumptions

- **Remainders separate well.** Overlapping windows share most of their text, so remainders may be tiny or noisy. Compare window sizes, and try non-overlapping earlier chunks.
- **Linear span means "already said".** Embeddings aren't built for this. Test whether remainders match human judgments of novelty.
- **Long documents don't saturate.** In a space this size that's unlikely to be a math problem, but the score may drift downward as history grows. Test on long texts.

## Building the corpus

None for the feature. Validation needs a few texts with sentences marked as new or repeated by a person. The explainer's examples are a good start.

## How we'll know

- **Confirmed:** it agrees with human labels better than the current score.
- **Killed:** it's no better than the current score, or it just tracks sentence length.

## End product

An interactive view where users paste their own text and compare this measure with the current one. It could replace the current score if it wins.
