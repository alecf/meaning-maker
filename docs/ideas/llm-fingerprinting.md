# LLM fingerprinting

**Status:** Idea | **Effort:** L | **Depends on:** [Semantic sensitivity](semantic-sensitivity.md), [Content and style separation](content-style-separation.md) for the method

## Introduction

If different LLMs write up the same content, can a consistent embedding model show how their writing differs? Flipped around, can you guess which model or version wrote a piece of text?

Asking every model the same prompts lets us subtract each prompt's average. What's left should be closer to the model's own voice.

## Inputs

- A set of prompts across genres, including rewrites and open writing tasks.
- Several LLMs, including multiple versions from one family.
- A single embedding model.
- A word and punctuation baseline classifier.

## Assumptions

- **Embeddings keep style signals.** They may discard much of what identifies a writer, like function words and punctuation. Compare against the baseline.
- **Model differences beat prompt differences.** A system prompt or temperature could change the voice more than the model does. Test both.
- **Families are easier than versions.** Test by holding out whole model versions.
- **Results age quickly.** Models change often, so a published result needs a date and exact model versions.
- **Usage terms allow it.** Check each provider's terms before publishing generated output.

## Building the corpus

1. Write about 100 prompts across genres.
2. Generate about 5 samples per prompt, per model, with fixed settings.
3. Embed them and subtract prompt means.
4. Train classifiers and test them on held-out prompts and models.

## How we'll know

- **Confirmed:** held-out accuracy is well above chance, and the family tree is stable across prompt sets.
- **Killed:** the word-count baseline beats embeddings easily, or accuracy falls to chance on new prompts. The first would still be an interesting result.

## End product

A results page with an LLM family tree and confusion matrix. An optional box lets users paste text and see which models it most resembles, with clear warnings that it isn't reliable proof.
