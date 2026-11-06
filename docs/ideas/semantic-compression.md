# Semantic compression

**Status:** Idea | **Effort:** M | **Depends on:** [Semantic sensitivity](semantic-sensitivity.md)

## Introduction

How much of a text can you remove while keeping its meaning? Meaning Maker's novelty scores already suggest candidates: faded sentences repeat what came before.

Remove the most redundant sentences one at a time, then plot length saved against how far the document's embedding drifts. That gives a curve of meaning lost against compression. An LLM could also try rewriting to a target length, with the embedding as a constraint.

## Inputs

- Sentence novelty scores.
- A model that's sensitive to meaning changes, chosen by [Semantic sensitivity](semantic-sensitivity.md).
- An independent meaning check, likely an LLM judge.

## Assumptions

- **Staying close means keeping the meaning.** Not necessarily, and it varies by model. A summary can sit near its source while losing a key fact. Test by asking comprehension questions of both versions.
- **Removed sentences don't support later ones.** A sentence can look redundant while a later "it" depends on it. Test by reading output for coherence.
- **Document-level embeddings handle long text.** Most models have an input limit (512 tokens for bge), so longer texts need chunks or a different model. Test how chunks should be combined.

## Building the corpus

Only a small test set: documents with comprehension questions, and optionally human summaries for comparison.

## How we'll know

- **Confirmed:** embedding drift predicts lost comprehension better than word count does.
- **Killed:** texts stay close in embedding space while failing comprehension questions.

## End product

An interactive slider. Users paste their own text, drag to compress, and watch sentences disappear as the drift score updates.
