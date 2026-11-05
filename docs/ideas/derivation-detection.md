# Derivation detection

**Status:** Idea | **Effort:** L | **Depends on:** [Semantic sensitivity](semantic-sensitivity.md), [Telephone game](telephone-game.md)

## Introduction

Was one document rewritten from another, even in a new voice or by an LLM? Word matching fails on heavy rewrites, but the path a document traces through embedding space may survive.

This mixes two questions that need separating:

- **Was this derived from that source?** That's what this idea tries to answer.
- **Did an LLM write it?** Measuring derivation doesn't answer this.

Two techniques do most of the work:

- **Dynamic time warping** compares paths with different numbers of sentences.
- **A sentence-by-sentence similarity grid** makes a rewrite visible as a diagonal line.

To avoid a magic threshold, calibrate against two groups:

- Many rewrites of the source, using several LLMs. Their average is the "base" vector for the content.
- Independent documents on the same topic.

The second group is the hard case. Their topic matches, so average similarity won't separate them, but argument order might.

## Inputs

- Source documents, and original articles on the same topics.
- Rewrites from several LLMs, styles and strengths.
- Human rewrites, if we can get them.
- The model chosen by [Semantic sensitivity](semantic-sensitivity.md).

## Assumptions

- **Path shape survives rewriting.** Test on rewrites that change sentence boundaries and paragraph order.
- **Independent writers don't follow the same path.** Timelines and encyclopedia entries naturally share an order, so test those directly.
- **LLM rewrites stand in for human ones.** They may not. Test on human paraphrases too.
- **The original is available.** Without one, this only compares documents. Embedding search over a corpus could find a candidate source, but that's a separate project.

## Building the corpus

1. Choose about 50 source documents across genres.
2. Generate 10 or more rewrites of each, across several LLMs and strengths.
3. Collect independent same-topic documents for each.
4. Embed everything in rolling windows.
5. Measure path distance within each group, then set scores by where a text falls between them.

## How we'll know

- **Confirmed:** path scores separate rewrites from independent same-topic documents better than whole-document similarity, including on held-out LLMs.
- **Killed:** path scores add nothing over a single document embedding.

## End product

An interactive page. Users paste two documents and see the similarity grid and a calibrated score. Results should be described as evidence of derivation, not proof of plagiarism.
